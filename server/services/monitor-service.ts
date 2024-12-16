import { EventEmitter } from 'events';
import os from 'os';
import { DatabaseService } from '../database/database-service';

interface SystemStats {
    cpu: number;
    memory: {
        total: number;
        used: number;
        free: number;
    };
    disk: {
        total: number;
        used: number;
        free: number;
    };
}

interface DatabaseStats {
    plcCount: number;
    pointCount: number;
    alarmCount: number;
    backupCount: number;
    lastBackup: string | null;
    dataSize: number;
}

export class MonitorService extends EventEmitter {
    private static instance: MonitorService;
    private dbService: DatabaseService;
    private pollInterval: NodeJS.Timeout | null = null;
    private readonly pollIntervalMs = 5000; // 5秒轮询一次

    private constructor() {
        super();
        this.dbService = DatabaseService.getInstance();
    }

    public static getInstance(): MonitorService {
        if (!MonitorService.instance) {
            MonitorService.instance = new MonitorService();
        }
        return MonitorService.instance;
    }

    /**
     * 启动监控
     */
    public start(): void {
        if (this.pollInterval) {
            return;
        }

        this.pollInterval = setInterval(async () => {
            try {
                const [systemStats, dbStats] = await Promise.all([
                    this.getSystemStats(),
                    this.getDatabaseStats()
                ]);

                this.emit('stats', {
                    system: systemStats,
                    database: dbStats,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Monitor error:', error);
                this.emit('error', error);
            }
        }, this.pollIntervalMs);
    }

    /**
     * 停止监控
     */
    public stop(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * 获取系统状态
     */
    private async getSystemStats(): Promise<SystemStats> {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type as keyof typeof cpu.times];
            }
            totalIdle += cpu.times.idle;
        });

        const cpuUsage = 100 - (totalIdle / totalTick) * 100;

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        // 这里需要实现获取磁盘信息的功能
        // 在 Windows 上可以使用 wmic 命令
        const disk = {
            total: 0,
            used: 0,
            free: 0
        };

        return {
            cpu: cpuUsage,
            memory: {
                total: totalMem,
                used: usedMem,
                free: freeMem
            },
            disk
        };
    }

    /**
     * 获取数据库状态
     */
    private async getDatabaseStats(): Promise<DatabaseStats> {
        const [plcs, points, alarms] = await Promise.all([
            this.dbService.getPLCConfigs(),
            this.dbService.getTagConfigs(),
            this.dbService.getAlarmConfigs()
        ]);

        // 获取备份信息
        // TODO: 实现获取备份列表和大小的功能

        return {
            plcCount: plcs.length,
            pointCount: points.length,
            alarmCount: alarms.length,
            backupCount: 0, // TODO
            lastBackup: null, // TODO
            dataSize: 0 // TODO
        };
    }

    /**
     * 检查数据库健康状态
     */
    public async checkHealth(): Promise<{
        healthy: boolean;
        issues: string[];
    }> {
        const issues: string[] = [];

        try {
            // 检查数据库连接
            await this.dbService.getPLCConfigs();

            // 检查数据完整性
            const [plcs, points, alarms] = await Promise.all([
                this.dbService.getPLCConfigs(),
                this.dbService.getTagConfigs(),
                this.dbService.getAlarmConfigs()
            ]);

            // 检查关联完整性
            for (const point of points) {
                const plc = plcs.find(p => p.id === point.plcId);
                if (!plc) {
                    issues.push(`监控点 ${point.name} 关联的 PLC 不存在`);
                }
            }

            for (const alarm of alarms) {
                const point = points.find(p => p.id === alarm.pointId);
                if (!point) {
                    issues.push(`报警规则 ${alarm.id} 关联的监控点不存在`);
                }
            }

            // 检查系统资源
            const stats = await this.getSystemStats();
            if (stats.memory.free < 100 * 1024 * 1024) { // 小于 100MB
                issues.push('系统内存不足');
            }

            if (stats.cpu > 90) { // CPU 使用率超过 90%
                issues.push('CPU 负载过高');
            }

            return {
                healthy: issues.length === 0,
                issues
            };
        } catch (error) {
            console.error('Health check error:', error);
            return {
                healthy: false,
                issues: [(error as Error).message]
            };
        }
    }
}
