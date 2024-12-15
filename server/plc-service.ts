import ModbusRTU from 'modbus-serial';
import { Server } from 'socket.io';
import { PLCConfig, TagConfig, TagGroup, TagValue } from './types';

export class PLCService {
    private io: Server;
    private client: ModbusRTU;
    private isConnected: boolean;
    private simulation: boolean;
    private currentHost: string;
    private currentPort: number;
    
    // 存储变量的当前值
    private values: { [key: string]: TagValue };
    // 存储变量的配置
    private tagConfigs: { [key: string]: TagConfig };
    // 存储变量组（优化读取）
    private tagGroups: TagGroup[];
    // 存储定时器
    private timers: { [key: string]: NodeJS.Timeout };

    constructor(io: Server, config: PLCConfig) {
        this.io = io;
        this.client = new ModbusRTU();
        this.isConnected = false;
        this.simulation = config.simulation || false;
        this.values = {};
        this.tagConfigs = {};
        this.tagGroups = [];
        this.timers = {};
        this.currentHost = config.ip;
        this.currentPort = config.port || 502;

        console.log('PLC Service initialized with config:', {
            simulation: this.simulation,
            host: this.currentHost,
            port: this.currentPort
        });

        if (this.simulation) {
            console.log('Running in simulation mode');
            this.isConnected = true;
            setTimeout(() => {
                this.io.emit('plc-connection-status', true);
                this.initializeSimulation();
            }, 1000);  // 延迟1秒初始化，确保客户端已准备好
        } else {
            // 初始化连接
            this.connect(this.currentHost, this.currentPort);
        }

        // 添加事件监听
        this.io.on('connection', (socket) => {
            console.log('Client connected, sending current status');
            // 发送当前连接状态
            socket.emit('plc-connection-status', this.isConnected);
            
            if (this.isConnected) {
                // 发送当前所有变量的值
                const values = Object.entries(this.values).map(([name, value]) => ({ name, value }));
                console.log('Sending initial values to new client:', values);
                socket.emit('values-changed', values);
            }
        });
    }

    // 获取连接状态
    public getConnectionStatus(): boolean {
        console.log('Current connection status:', this.isConnected);
        return this.isConnected;
    }

    // 添加变量配置
    public addTags(configs: { [key: string]: TagConfig }) {
        console.log('Adding tags:', configs);
        this.tagConfigs = { ...configs };
        
        // 初始化值
        Object.keys(this.tagConfigs).forEach(name => {
            const config = this.tagConfigs[name];
            if (config.type === 'X' || config.type === 'Y') {
                this.values[name] = false;
            } else if (config.type === 'D') {
                this.values[name] = 0;
            }
        });

        // 如果已经连接，则初始化模拟或轮询
        if (this.isConnected) {
            if (this.simulation) {
                console.log('Reinitializing simulation for new tags');
                this.initializeSimulation();
            } else {
                this.initializeTagGroups();
                this.startPolling();
            }
        }
    }

    private async connect(ip: string, port: number) {
        try {
            console.log(`Connecting to PLC at ${ip}:${port}...`);
            await this.client.connectTCP(ip, { port });
            this.client.setID(1);
            this.isConnected = true;
            console.log('Connected to PLC');
            
            // 广播连接状态
            this.io.emit('plc-connection-status', true);
            
            // 初始化变量组和定时器
            this.initializeTagGroups();
            this.startPolling();
        } catch (error) {
            console.error('Connection failed:', error);
            this.isConnected = false;
            this.io.emit('plc-connection-status', false);
            // 3秒后重试
            setTimeout(() => this.connect(ip, port), 3000);
        }
    }

    private initializeTagGroups() {
        // 清除现有的组
        this.tagGroups = [];
        
        // 按类型和刷新率分组
        const groupedTags: { [key: string]: TagConfig[] } = {};
        
        Object.entries(this.tagConfigs).forEach(([name, config]) => {
            const key = `${config.type}_${config.refreshRate || 1000}`;
            if (!groupedTags[key]) {
                groupedTags[key] = [];
            }
            groupedTags[key].push({ ...config, name });
        });

        // 创建优化后的变量组
        Object.entries(groupedTags).forEach(([_, tags]) => {
            // 按地址排序
            tags.sort((a, b) => a.address - b.address);
            
            let currentGroup: TagGroup | null = null;
            
            tags.forEach((tag) => {
                const tagLength = tag.length || 1;
                
                // 如果可以加入当前组
                if (currentGroup && 
                    tag.type === currentGroup.type &&
                    tag.address <= currentGroup.startAddress + currentGroup.length) {
                    // 扩展当前组
                    currentGroup.length = Math.max(
                        currentGroup.length,
                        tag.address + tagLength - currentGroup.startAddress
                    );
                    currentGroup.tags.push(tag.name!);
                } else {
                    // 创建新组
                    currentGroup = {
                        type: tag.type,
                        startAddress: tag.address,
                        length: tagLength,
                        refreshRate: tag.refreshRate || 1000,
                        tags: [tag.name!]
                    };
                    this.tagGroups.push(currentGroup);
                }
            });
        });
    }

    private startPolling() {
        // 清除现有的轮询定时器
        Object.values(this.timers).forEach(timer => clearInterval(timer));
        this.timers = {};

        // 为每个变量组创建轮询定时器
        this.tagGroups.forEach((group, index) => {
            const timer = setInterval(async () => {
                if (!this.isConnected || this.simulation) return;

                try {
                    let values: boolean[] | number[] = [];
                    if (group.type === 'X') {
                        const result = await this.client.readDiscreteInputs(group.startAddress, group.length);
                        values = Array.isArray(result.data) ? result.data : [result.data];
                    } else if (group.type === 'Y') {
                        const result = await this.client.readCoils(group.startAddress, group.length);
                        values = Array.isArray(result.data) ? result.data : [result.data];
                    } else if (group.type === 'D') {
                        const result = await this.client.readHoldingRegisters(group.startAddress, group.length);
                        values = Array.isArray(result.data) ? result.data : [result.data];
                    }

                    // 更新值并发送变化
                    let hasChanges = false;
                    const changes: { name: string; value: boolean | number }[] = [];
                    
                    group.tags.forEach((tag, i) => {
                        const newValue = values[i];
                        if (this.values[tag] !== newValue) {
                            this.values[tag] = newValue;
                            changes.push({ name: tag, value: newValue });
                            hasChanges = true;
                            console.log(`Value updated: ${tag} = ${newValue}`);
                        }
                    });

                    // 如果有变化，一次性发送所有变化
                    if (hasChanges) {
                        this.io.emit('values-changed', changes);
                    }
                } catch (error) {
                    console.error(`Polling error for group ${index}:`, error);
                    this.handleCommunicationError();
                }
            }, group.refreshRate); // 使用配置的刷新率

            this.timers[`group_${index}`] = timer;
        });
    }

    private handleCommunicationError() {
        this.isConnected = false;
        // 广播连接状态
        this.io.emit('plc-connection-status', false);
        // 清除所有定时器
        Object.values(this.timers).forEach(timer => clearInterval(timer));
        this.timers = {};
        // 触发重连
        this.connect(this.currentHost, this.currentPort);
    }

    // 写入值
    public async writeValue(name: string, value: boolean | number): Promise<boolean> {
        if (!this.isConnected) {
            console.error('Cannot write value: PLC not connected');
            return false;
        }

        console.log(`Writing value: ${name} = ${value}`);
        const config = this.tagConfigs[name];
        if (!config) {
            console.error(`Tag ${name} not found in configuration`);
            return false;
        }

        try {
            if (this.simulation) {
                // 在模拟模式下直接更新值
                this.values[name] = value;
                this.io.emit('values-changed', [{ name, value }]);
                return true;
            } else {
                // 实际PLC写入逻辑
                if (config.type === 'Y') {
                    await this.client.writeCoil(config.address, value as boolean);
                } else if (config.type === 'D') {
                    await this.client.writeRegister(config.address, value as number);
                }

                this.values[name] = value;
                this.io.emit('values-changed', [{ name, value }]);
                return true;
            }
        } catch (error) {
            console.error('Error writing value:', error);
            return false;
        }
    }

    // 模拟模式实现
    private initializeSimulation() {
        console.log('Initializing simulation mode');
        
        // 初始化所有变量的值
        const initialValues: { name: string; value: boolean | number }[] = [];
        
        Object.keys(this.tagConfigs).forEach(name => {
            const config = this.tagConfigs[name];
            if (config.type === 'X' || config.type === 'Y') {
                this.values[name] = false;
            } else if (config.type === 'D') {
                this.values[name] = 0;
            }
            initialValues.push({ name, value: this.values[name] });
        });

        // 一次性发送所有初始值
        console.log('Sending initial values:', initialValues);
        this.io.emit('values-changed', initialValues);

        // 清除现有的模拟定时器
        if (this.timers['simulation']) {
            clearInterval(this.timers['simulation']);
        }

        // 模拟值变化
        this.timers['simulation'] = setInterval(() => {
            if (!this.isConnected) {
                console.log('Simulation stopped: PLC disconnected');
                return;
            }

            const changes: { name: string; value: boolean | number }[] = [];
            
            Object.keys(this.tagConfigs).forEach(name => {
                const config = this.tagConfigs[name];
                if (config.type === 'X' && Math.random() < 0.1) {
                    // 随机改变输入状态
                    const newValue = !this.values[name];
                    this.values[name] = newValue;
                    changes.push({ name, value: newValue });
                    console.log(`Input ${name} changed to ${newValue}`);
                } else if (config.type === 'D' && Math.random() < 0.1) {
                    // 随机改变数据值
                    const newValue = Math.floor(Math.random() * 100);
                    this.values[name] = newValue;
                    changes.push({ name, value: newValue });
                    console.log(`Data ${name} changed to ${newValue}`);
                }
            });

            // 如果有变化，一次性发送
            if (changes.length > 0) {
                console.log('Sending value changes:', changes);
                this.io.emit('values-changed', changes);
            }
        }, 1000);
    }

    // 获取当前值
    public getValue(tagName: string): TagValue | undefined {
        return this.values[tagName];
    }

    // 获取所有值
    public getAllValues(): { [key: string]: boolean | number } {
        return { ...this.values };
    }

    // 清理资源
    public dispose() {
        // 清除所有定时器
        Object.values(this.timers).forEach(timer => clearInterval(timer));
        this.timers = {};

        // 断开连接
        if (this.client && !this.simulation) {
            this.client.close(() => {
                console.log('PLC connection closed');
            });
        }
        
        this.isConnected = false;
    }
}
