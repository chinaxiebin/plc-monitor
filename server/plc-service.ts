import ModbusRTU from 'modbus-serial';
import { Server } from 'socket.io';
import { PLCConfig, TagConfig } from './types';
import { AlarmService } from './services/alarm-service';
import { ConfigService } from './services/config-service';
import { DatabaseService } from './services/database-service';
import { EventEmitter } from 'events';

interface PLCConnectionStatus {
    connected: boolean;
    lastError?: string;
    lastErrorTime?: Date;
    reconnectAttempts: number;
}

export class PLCService extends EventEmitter {
    private static instance: PLCService;
    private clients: Map<string, ModbusRTU> = new Map();
    private connectionStatus: Map<string, PLCConnectionStatus> = new Map();
    private io: Server;
    private alarmService: AlarmService;
    private configService: ConfigService;
    private dbService: DatabaseService;
    private simulation: boolean;
    private values: { [key: string]: any } = {};
    private analogValues: { [key: string]: number } = {};
    private analogOutputs: { [key: string]: number } = {};
    private registers: { [key: string]: number } = {};
    private digitalOutputs: { [key: string]: boolean } = {};
    private pollInterval: NodeJS.Timeout | null = null;
    private pollIntervalMs: number = 1000; // 默认轮询间隔为1秒
    private maxReconnectAttempts: number = 5;
    private reconnectIntervalMs: number = 5000;
    private tagConfigCache: TagConfig[] | null = null;
    private tagConfigLastUpdate: number = 0;
    private tagConfigCacheTimeout: number = 60000; // 1分钟缓存超时

    private constructor(io: Server) {
        super();
        this.io = io;
        this.simulation = process.env.SIMULATION === 'true';
        this.alarmService = AlarmService.getInstance();
        this.configService = ConfigService.getInstance();
        this.dbService = DatabaseService.getInstance();
        
        // 监听报警事件
        this.alarmService.on('alarm', (alarmEvent) => {
            this.io.emit('alarm', alarmEvent);
        });

        // 启动轮询
        this.startPolling();

        // 定期清理连接状态
        setInterval(() => this.cleanupConnectionStatus(), 3600000); // 每小时清理一次
    }

    public static getInstance(io: Server): PLCService {
        if (!PLCService.instance) {
            PLCService.instance = new PLCService(io);
        }
        return PLCService.instance;
    }

    // 启动轮询
    private startPolling(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        this.pollInterval = setInterval(() => {
            this.poll().catch(error => {
                console.error('Polling error:', error);
            });
        }, this.pollIntervalMs);
    }

    // 停止轮询
    private stopPolling(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    // 设置轮询间隔
    public setPollInterval(intervalMs: number): void {
        this.pollIntervalMs = intervalMs;
        this.startPolling(); // 重启轮询以应用新的间隔
    }

    // 清理资源
    public async dispose(): Promise<void> {
        this.stopPolling();
        for (const key of this.clients.keys()) {
            try {
                await this.disconnect(key.split(':')[0], parseInt(key.split(':')[1]));
            } catch (error) {
                console.error(`Error disconnecting from ${key}:`, error);
            }
        }
    }

    // 连接到PLC
    public async connect(config: PLCConfig): Promise<void> {
        const key = `${config.ip}:${config.port || 502}`;
        let client = this.clients.get(key);

        if (!client) {
            client = new ModbusRTU();
            this.clients.set(key, client);
        }

        if (this.simulation) {
            console.log('Running in simulation mode');
            return;
        }

        try {
            await client.connectTCP(config.ip, { port: config.port || 502 });
            console.log(`Connected to PLC at ${key}`);
            this.connectionStatus.set(key, { connected: true, reconnectAttempts: 0 });
        } catch (error) {
            console.error(`Failed to connect to PLC at ${key}:`, error);
            this.connectionStatus.set(key, { connected: false, lastError: error.message, lastErrorTime: new Date(), reconnectAttempts: 1 });
            throw error;
        }
    }

    // 断开连接
    public async disconnect(ip: string, port: number = 502): Promise<void> {
        const key = `${ip}:${port}`;
        const client = this.clients.get(key);
        
        if (client) {
            try {
                await new Promise<void>((resolve, reject) => {
                    client.close((err?: Error) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
                this.clients.delete(key);
                console.log(`Disconnected from PLC at ${key}`);
                this.connectionStatus.delete(key);
            } catch (error) {
                console.error(`Failed to disconnect from PLC at ${key}:`, error);
                throw error;
            }
        }
    }

    // 读取数字量输入
    private async readDigitalInputs(config: TagConfig[]): Promise<void> {
        if (this.simulation) {
            this.simulateDigitalInputs();
            return;
        }

        for (const client of this.clients.values()) {
            for (const tag of config) {
                if (tag.type !== 'DI') continue;

                try {
                    client.setID(0);  // 设置从站地址
                    const response = await client.readCoils(tag.address, 1);
                    this.values[`DI${tag.address}`] = response.data[0];
                    this.io.emit('digitalInputUpdate', {
                        address: tag.address,
                        value: response.data[0]
                    });
                } catch (error) {
                    console.error(`Failed to read digital input ${tag.address}:`, error);
                }
            }
        }
    }

    // 读取数字量输出
    private async readDigitalOutputs(config: TagConfig[]): Promise<void> {
        if (this.simulation) {
            this.simulateDigitalOutputs();
            return;
        }

        for (const client of this.clients.values()) {
            for (const tag of config) {
                if (tag.type !== 'DO') continue;

                try {
                    client.setID(0);  // 设置从站地址
                    const response = await client.readCoils(tag.address, 1);
                    this.values[`DO${tag.address}`] = response.data[0];
                    this.io.emit('digitalOutputUpdate', {
                        address: tag.address,
                        value: response.data[0]
                    });
                } catch (error) {
                    console.error(`Failed to read digital output ${tag.address}:`, error);
                }
            }
        }
    }

    // 写入数字量输出
    public async writeDigitalOutput(address: number, value: boolean): Promise<void> {
        if (this.simulation) {
            this.digitalOutputs[`DO${address}`] = value;
            this.io.emit('digitalOutputUpdate', { address, value });
            return;
        }

        for (const client of this.clients.values()) {
            try {
                client.setID(0);  // 设置从站地址
                await client.writeCoil(address, value);
                this.digitalOutputs[`DO${address}`] = value;
                this.io.emit('digitalOutputUpdate', { address, value });
            } catch (error) {
                console.error(`Failed to write digital output ${address}:`, error);
                throw error;
            }
        }
    }

    // 读取模拟量输入
    private async readAnalogInputs(config: TagConfig[]): Promise<void> {
        if (this.simulation) {
            this.simulateAnalogInputs();
            return;
        }

        for (const client of this.clients.values()) {
            for (const tag of config) {
                if (tag.type !== 'AI') continue;

                try {
                    client.setID(0);  // 设置从站地址
                    const response = await client.readHoldingRegisters(tag.address, 1);
                    const value = response.data[0];
                    const scaledValue = value * (tag.scale || 1);
                    
                    this.analogValues[`AI${tag.address}`] = scaledValue;
                    await this.alarmService.checkValue(tag.address, scaledValue);
                    
                    this.io.emit('analogInputUpdate', {
                        address: tag.address,
                        value: scaledValue,
                        raw: value
                    });
                } catch (error) {
                    console.error(`Failed to read analog input ${tag.address}:`, error);
                }
            }
        }
    }

    // 读取模拟量输出
    private async readAnalogOutputs(config: TagConfig[]): Promise<void> {
        if (this.simulation) {
            // 在模拟模式下保持当前值
            for (const tag of config) {
                if (tag.type !== 'AO') continue;
                const value = this.analogOutputs[`AO${tag.address}`] || 0;
                this.io.emit('analogOutputUpdate', {
                    address: tag.address,
                    value,
                    unit: tag.unit
                });
            }
            return;
        }

        for (const client of this.clients.values()) {
            for (const tag of config) {
                if (tag.type !== 'AO') continue;

                try {
                    client.setID(0);  // 设置从站地址
                    const response = await client.readHoldingRegisters(tag.address, 1);
                    const value = response.data[0];
                    const scaledValue = value * (tag.scale || 1);
                    
                    this.analogOutputs[`AO${tag.address}`] = scaledValue;
                    this.io.emit('analogOutputUpdate', {
                        address: tag.address,
                        value: scaledValue,
                        raw: value,
                        unit: tag.unit
                    });
                } catch (error) {
                    console.error(`Failed to read analog output ${tag.address}:`, error);
                }
            }
        }
    }

    // 写入模拟量输出
    public async writeAnalogOutput(address: number, value: number): Promise<void> {
        if (this.simulation) {
            this.analogOutputs[`AO${address}`] = value;
            this.io.emit('analogOutputUpdate', { address, value });
            return;
        }

        for (const client of this.clients.values()) {
            try {
                client.setID(0);  // 设置从站地址
                await client.writeRegisters(address, [value]);
                this.analogOutputs[`AO${address}`] = value;
                this.io.emit('analogOutputUpdate', { address, value });
            } catch (error) {
                console.error(`Failed to write analog output ${address}:`, error);
                throw error;
            }
        }
    }

    // 读取数据寄存器
    private async readRegisters(config: TagConfig[]): Promise<void> {
        if (this.simulation) {
            // 在模拟模式下保持当前值
            for (const tag of config) {
                if (tag.type !== 'REG') continue;
                const value = this.registers[`REG${tag.address}`] || 0;
                this.io.emit('registerUpdate', {
                    address: tag.address,
                    value
                });
            }
            return;
        }

        for (const client of this.clients.values()) {
            for (const tag of config) {
                if (tag.type !== 'REG') continue;

                try {
                    client.setID(0);  // 设置从站地址
                    const response = await client.readHoldingRegisters(tag.address, 1);
                    const value = response.data[0];
                    
                    this.registers[`REG${tag.address}`] = value;
                    this.io.emit('registerUpdate', {
                        address: tag.address,
                        value
                    });
                } catch (error) {
                    console.error(`Failed to read register ${tag.address}:`, error);
                }
            }
        }
    }

    // 写入数据寄存器
    public async writeRegister(address: number, value: number): Promise<void> {
        if (this.simulation) {
            this.registers[`REG${address}`] = value;
            this.io.emit('registerUpdate', { address, value });
            return;
        }

        for (const client of this.clients.values()) {
            try {
                client.setID(0);  // 设置从站地址
                await client.writeRegisters(address, [value]);
                this.registers[`REG${address}`] = value;
                this.io.emit('registerUpdate', { address, value });
            } catch (error) {
                console.error(`Failed to write register ${address}:`, error);
                throw error;
            }
        }
    }

    private async poll(): Promise<void> {
        if (!this.clients.size && !this.simulation) return;

        try {
            const config = await this.getTagConfigs();
            const results = await Promise.allSettled([
                this.readDigitalInputs(config),
                this.readDigitalOutputs(config),
                this.readAnalogInputs(config),
                this.readAnalogOutputs(config),
                this.readRegisters(config)
            ]);
            
            // 处理每个操作的结果
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.error(`Poll operation ${index} failed:`, result.reason);
                    this.emit('pollError', { operation: index, error: result.reason });
                }
            });
        } catch (error) {
            console.error('Polling error:', error);
            this.handleCommunicationError();
        }
    }

    private handleCommunicationError(): void {
        // 通知客户端通信错误
        this.io.emit('communicationError');
        
        // 遍历所有连接并尝试重新连接
        for (const [key, status] of this.connectionStatus.entries()) {
            if (status.reconnectAttempts >= this.maxReconnectAttempts) {
                this.emit('maxReconnectAttemptsReached', { plcId: key });
                continue;
            }

            setTimeout(async () => {
                try {
                    const [ip, port] = key.split(':');
                    await this.connect({ ip, port: parseInt(port) });
                    status.connected = true;
                    status.lastError = undefined;
                    status.lastErrorTime = undefined;
                    status.reconnectAttempts = 0;
                } catch (error) {
                    status.connected = false;
                    status.lastError = error.message;
                    status.lastErrorTime = new Date();
                    status.reconnectAttempts++;
                    console.error(`Reconnection failed for ${key}:`, error);
                }
                this.connectionStatus.set(key, status);
            }, this.reconnectIntervalMs * (status.reconnectAttempts + 1)); // 指数退避重连
        }
    }

    /**
     * 更新标签配置缓存
     */
    private async updateTagConfigCache(): Promise<void> {
        try {
            this.tagConfigCache = await this.dbService.getTagConfigs();
            this.tagConfigLastUpdate = Date.now();
        } catch (error) {
            console.error('Failed to update tag config cache:', error);
            throw error;
        }
    }

    /**
     * 获取标签配置
     */
    public async getTagConfigs(): Promise<TagConfig[]> {
        if (!this.tagConfigCache || Date.now() - this.tagConfigLastUpdate > this.tagConfigCacheTimeout) {
            await this.updateTagConfigCache();
        }
        return this.tagConfigCache || [];
    }

    // 清理连接状态
    private cleanupConnectionStatus(): void {
        for (const [key, status] of this.connectionStatus.entries()) {
            if (!this.clients.has(key)) {
                this.connectionStatus.delete(key);
            }
        }
    }

    // 获取连接状态
    public getConnectionStatus(): Map<string, PLCConnectionStatus> {
        return new Map(this.connectionStatus);
    }

    // 重置连接
    public async resetConnection(ip: string, port: number = 502): Promise<void> {
        const key = `${ip}:${port}`;
        await this.disconnect(ip, port);
        this.connectionStatus.delete(key);
        await this.connect({ ip, port });
    }

    // 设置重连参数
    public setReconnectParams(maxAttempts: number, intervalMs: number): void {
        this.maxReconnectAttempts = maxAttempts;
        this.reconnectIntervalMs = intervalMs;
    }

    // 模拟模式实现
    private simulateDigitalInputs(): void {
        // 随机更新数字量输入
        for (let i = 0; i < 8; i++) {
            if (Math.random() < 0.1) { // 10% 概率改变状态
                const value = Math.random() < 0.5;
                this.values[`DI${i}`] = value;
                this.io.emit('digitalInputUpdate', { address: i, value });
            }
        }
    }

    private simulateDigitalOutputs(): void {
        // 保持数字量输出状态不变，只发送当前值
        for (let i = 0; i < 8; i++) {
            const value = this.values[`DO${i}`] || false;
            this.io.emit('digitalOutputUpdate', { address: i, value });
        }
    }

    private simulateAnalogInputs(): void {
        // 模拟温度、压力等模拟量变化
        const analogTags = [
            { address: 0, min: 20, max: 30, unit: '℃' }, // 温度
            { address: 1, min: 0, max: 10, unit: 'bar' }, // 压力
            { address: 2, min: 0, max: 100, unit: 'L/min' }, // 流量
            { address: 3, min: 0, max: 200, unit: 'mm' }  // 液位
        ];

        for (const tag of analogTags) {
            const currentValue = this.analogValues[`AI${tag.address}`] || tag.min;
            let newValue = currentValue + (Math.random() - 0.5) * (tag.max - tag.min) * 0.02;
            newValue = Math.max(tag.min, Math.min(tag.max, newValue));
            
            this.analogValues[`AI${tag.address}`] = newValue;
            this.io.emit('analogInputUpdate', {
                address: tag.address,
                value: newValue,
                unit: tag.unit
            });
        }
    }
}
