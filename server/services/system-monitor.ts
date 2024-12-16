import { EventEmitter } from 'events';
import os from 'os';
import { Database } from 'sqlite';
import { promises as fs } from 'fs';
import path from 'path';
import database from '../database';

export interface SystemStatus {
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
    uptime: number;
}

export class SystemMonitor extends EventEmitter {
    private static instance: SystemMonitor;
    private db: Database;
    private monitorInterval: NodeJS.Timeout | null = null;
    private readonly monitorIntervalMs = 5000; // 5秒采集一次
    private readonly logDir: string;
    private currentLogFile: string;

    private constructor() {
        super();
        this.db = database.getDb();
        this.logDir = path.join(process.cwd(), 'logs');
        this.currentLogFile = this.getLogFileName();
        this.initLogDir();
    }

    public static getInstance(): SystemMonitor {
        if (!SystemMonitor.instance) {
            SystemMonitor.instance = new SystemMonitor();
        }
        return SystemMonitor.instance;
    }

    private async initLogDir(): Promise<void> {
        await fs.mkdir(this.logDir, { recursive: true });
    }

    private getLogFileName(): string {
        const date = new Date().toISOString().split('T')[0];
        return path.join(this.logDir, `system-${date}.log`);
    }

    public async start(): Promise<void> {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }

        this.monitorInterval = setInterval(async () => {
            try {
                const status = await this.collectSystemStatus();
                await this.saveSystemStatus(status);
                this.emit('status', status);
            } catch (error) {
                await this.logError('Monitor Error', error);
            }
        }, this.monitorIntervalMs);
    }

    public async stop(): Promise<void> {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }

    private async collectSystemStatus(): Promise<SystemStatus> {
        // 收集CPU使用率
        const cpus = os.cpus();
        const cpuUsage = cpus.reduce((acc, cpu) => {
            const total = Object.values(cpu.times).reduce((a, b) => a + b);
            const idle = cpu.times.idle;
            return acc + ((total - idle) / total);
        }, 0) / cpus.length;

        // 收集内存使用情况
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        // 收集磁盘使用情况
        const rootDir = process.cwd().split(path.sep)[0] + path.sep;
        const { size, used } = await this.getDiskInfo(rootDir);

        return {
            cpu: cpuUsage * 100,
            memory: {
                total: totalMem,
                used: usedMem,
                free: freeMem
            },
            disk: {
                total: size,
                used: used,
                free: size - used
            },
            uptime: os.uptime()
        };
    }

    private async getDiskInfo(dir: string): Promise<{ size: number; used: number }> {
        // 这里需要实现获取磁盘信息的逻辑
        // 在 Windows 下可以使用 wmic 命令
        // 在 Linux 下可以使用 df 命令
        // 为简单起见，这里返回模拟数据
        return {
            size: 1000000000000, // 1TB
            used: 500000000000   // 500GB
        };
    }

    private async saveSystemStatus(status: SystemStatus): Promise<void> {
        const timestamp = new Date();
        
        // 保存 CPU 使用率
        await this.db.run(
            'INSERT INTO system_status (type, value, unit, timestamp) VALUES (?, ?, ?, ?)',
            ['cpu', status.cpu, '%', timestamp]
        );

        // 保存内存使用情况
        await this.db.run(
            'INSERT INTO system_status (type, value, unit, timestamp) VALUES (?, ?, ?, ?)',
            ['memory_used', status.memory.used, 'bytes', timestamp]
        );

        // 保存磁盘使用情况
        await this.db.run(
            'INSERT INTO system_status (type, value, unit, timestamp) VALUES (?, ?, ?, ?)',
            ['disk_used', status.disk.used, 'bytes', timestamp]
        );
    }

    public async log(type: string, level: string, message: string, details?: any): Promise<void> {
        const timestamp = new Date();
        
        // 保存到数据库
        await this.db.run(
            'INSERT INTO system_logs (type, level, message, details, timestamp) VALUES (?, ?, ?, ?, ?)',
            [type, level, message, details ? JSON.stringify(details) : null, timestamp]
        );

        // 写入日志文件
        const logEntry = `[${timestamp.toISOString()}] [${level}] ${type}: ${message}\n`;
        if (details) {
            logEntry + `Details: ${JSON.stringify(details)}\n`;
        }

        // 检查是否需要新的日志文件
        const logFileName = this.getLogFileName();
        if (logFileName !== this.currentLogFile) {
            this.currentLogFile = logFileName;
        }

        await fs.appendFile(this.currentLogFile, logEntry);
    }

    public async logError(message: string, error: Error): Promise<void> {
        await this.log('error', 'error', message, {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
    }

    public async getSystemStatus(startTime?: Date, endTime?: Date): Promise<any[]> {
        let query = 'SELECT * FROM system_status';
        const params: any[] = [];

        if (startTime || endTime) {
            query += ' WHERE ';
            if (startTime) {
                query += 'timestamp >= ?';
                params.push(startTime);
            }
            if (startTime && endTime) {
                query += ' AND ';
            }
            if (endTime) {
                query += 'timestamp <= ?';
                params.push(endTime);
            }
        }

        query += ' ORDER BY timestamp DESC';
        return await this.db.all(query, params);
    }

    public async getLogs(
        type?: string,
        level?: string,
        startTime?: Date,
        endTime?: Date,
        limit: number = 100
    ): Promise<any[]> {
        let query = 'SELECT * FROM system_logs';
        const params: any[] = [];
        const conditions: string[] = [];

        if (type) {
            conditions.push('type = ?');
            params.push(type);
        }
        if (level) {
            conditions.push('level = ?');
            params.push(level);
        }
        if (startTime) {
            conditions.push('timestamp >= ?');
            params.push(startTime);
        }
        if (endTime) {
            conditions.push('timestamp <= ?');
            params.push(endTime);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);

        return await this.db.all(query, params);
    }

    public async cleanupOldLogs(days: number = 30): Promise<void> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        // 清理数据库日志
        await this.db.run(
            'DELETE FROM system_logs WHERE timestamp < ?',
            [cutoffDate]
        );

        // 清理日志文件
        const files = await fs.readdir(this.logDir);
        const oldLogs = files.filter(f => {
            const match = f.match(/system-(\d{4}-\d{2}-\d{2})\.log/);
            if (!match) return false;
            const logDate = new Date(match[1]);
            return logDate < cutoffDate;
        });

        for (const log of oldLogs) {
            const logPath = path.join(this.logDir, log);
            await fs.unlink(logPath);
        }
    }
}

export default SystemMonitor.getInstance();
