import { promises as fs } from 'fs';
import fs_sync from 'fs';
import path from 'path';
import { Low, JSONFile } from 'lowdb';
import { app } from 'electron';
import { EventEmitter } from 'events';
import { createGzip } from 'zlib';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { z } from 'zod';
import { DbSchema, dbSchema, dataRecordSchema, alarmHistorySchema, systemLogSchema, systemStatusSchema } from './validator';
import { DatabaseMigrator } from './migrator';

const pipelineAsync = promisify(pipeline);

class DatabaseManager extends EventEmitter {
    private static instance: DatabaseManager;
    private db: Low<DbSchema> | null = null;
    private readonly dbPath: string;
    private readonly backupDir: string;
    private backupInterval: NodeJS.Timeout | null = null;
    private collections: DbSchema = {
        plcConfig: [],
        monitorPoints: [],
        alarmRules: [],
        alarmHistory: [],
        dataRecords: [],
        systemLogs: [],
        systemStatus: [],
        settings: {
            dataRetentionDays: 30,
            logRetentionDays: 30,
            enableCompression: true,
            enableAutoBackup: true,
            backupTime: '02:00',
            autoStart: true
        }
    };

    private constructor() {
        super();
        const userDataPath = app.getPath('userData');
        this.dbPath = path.join(userDataPath, 'db.json');
        this.backupDir = path.join(userDataPath, 'backups');
    }

    public static getInstance(): DatabaseManager {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    public async initialize(): Promise<void> {
        try {
            // 确保目录存在
            await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
            await fs.mkdir(this.backupDir, { recursive: true });

            // 运行数据迁移
            const migrator = new DatabaseMigrator();
            await migrator.migrate();

            // 初始化数据库
            const adapter = new JSONFile<DbSchema>(this.dbPath);
            this.db = new Low(adapter);

            // 读取数据
            await this.db.read();

            // 如果数据为空，使用默认值
            if (this.db.data === null) {
                this.db.data = this.collections;
                await this.db.write();
            }

            // 验证数据
            try {
                dbSchema.parse(this.db.data);
            } catch (error) {
                console.error('数据验证失败:', error);
                await this.repairData();
            }

            // 启动自动备份
            if (this.db.data.settings.enableAutoBackup) {
                this.startAutoBackup();
            }

            this.emit('initialized');
        } catch (error) {
            console.error('初始化数据库失败:', error);
            this.emit('error', error);
            throw error;
        }
    }

    private async repairData(): Promise<void> {
        if (!this.db?.data) return;

        try {
            // 备份损坏的数据
            const backupPath = path.join(
                this.backupDir,
                `corrupted-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
            );
            await fs.writeFile(backupPath, JSON.stringify(this.db.data, null, 2));

            // 修复数据
            const repairedData = {
                ...this.collections,
                ...this.db.data,
                // 确保所有必需的字段都存在
                settings: {
                    ...this.collections.settings,
                    ...this.db.data.settings
                }
            };

            // 验证修复后的数据
            this.db.data = dbSchema.parse(repairedData);
            await this.db.write();

            console.log('数据修复完成');
            this.emit('dataRepaired');
        } catch (error) {
            console.error('数据修复失败:', error);
            throw error;
        }
    }

    public getCollection<T extends keyof DbSchema>(name: T): DbSchema[T] {
        if (!this.db?.data) {
            throw new Error('Database not initialized');
        }
        return this.db.data[name];
    }

    public async setCollection<T extends keyof DbSchema>(name: T, data: DbSchema[T]): Promise<void> {
        if (!this.db?.data) {
            throw new Error('Database not initialized');
        }

        try {
            // 验证新数据
            const partialSchema = { [name]: dbSchema.shape[name] };
            const validator = z.object(partialSchema);
            validator.parse({ [name]: data });

            // 更新数据
            this.db.data[name] = data;
            await this.db.write();
        } catch (error) {
            console.error(`验证失败 (${String(name)}):`, error);
            throw error;
        }
    }

    private startAutoBackup(): void {
        if (!this.db?.data?.settings.enableAutoBackup) {
            return;
        }

        // 解析备份时间
        const [hours, minutes] = this.db.data.settings.backupTime.split(':').map(Number);
        
        // 计算下次备份时间
        const now = new Date();
        const nextBackup = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            hours,
            minutes,
            0
        );
        if (nextBackup <= now) {
            nextBackup.setDate(nextBackup.getDate() + 1);
        }
        
        const delay = nextBackup.getTime() - now.getTime();

        this.backupInterval = setInterval(() => {
            this.backup().catch(error => {
                console.error('自动备份失败:', error);
                this.emit('error', error);
            });
        }, 24 * 60 * 60 * 1000); // 24小时

        // 首次备份
        setTimeout(() => {
            this.backup().catch(error => {
                console.error('首次备份失败:', error);
                this.emit('error', error);
            });
        }, delay);
    }

    public async backup(): Promise<string> {
        if (!this.db?.data) {
            throw new Error('Database not initialized');
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(this.backupDir, `backup-${timestamp}.json`);
        const compressedFile = path.join(this.backupDir, `backup-${timestamp}.json.gz`);

        try {
            // 创建备份
            const jsonData = JSON.stringify(this.db.data, null, 2);

            if (this.db.data.settings.enableCompression) {
                // 创建压缩文件
                const gzip = createGzip();
                const source = Buffer.from(jsonData);
                const destination = fs_sync.createWriteStream(compressedFile);
                
                await pipelineAsync(
                    source,
                    gzip,
                    destination
                );
            } else {
                // 创建未压缩的备份
                await fs.writeFile(backupFile, jsonData);
            }

            // 清理旧备份
            const backups = await fs.readdir(this.backupDir);
            const oldBackups = backups
                .filter(f => f.startsWith('backup-'))
                .sort()
                .reverse()
                .slice(7); // 保留最近7天的备份

            for (const backup of oldBackups) {
                await fs.unlink(path.join(this.backupDir, backup));
            }

            const finalBackupFile = this.db.data.settings.enableCompression ? compressedFile : backupFile;
            this.emit('backupCreated', finalBackupFile);
            return finalBackupFile;
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    public async restore(backupPath: string): Promise<void> {
        try {
            let jsonData: string;

            if (backupPath.endsWith('.gz')) {
                // 读取并解压缩备份文件
                const compressed = await fs.readFile(backupPath);
                const gunzip = promisify(require('zlib').gunzip);
                const buffer = await gunzip(compressed);
                jsonData = buffer.toString('utf-8');
            } else {
                // 直接读取未压缩的备份文件
                jsonData = await fs.readFile(backupPath, 'utf-8');
            }

            // 解析和验证数据
            const data = JSON.parse(jsonData);
            const validatedData = dbSchema.parse(data);

            // 更新数据库
            if (this.db) {
                this.db.data = validatedData;
                await this.db.write();
            }

            this.emit('restored', backupPath);
        } catch (error) {
            console.error('恢复备份失败:', error);
            this.emit('error', error);
            throw error;
        }
    }

    public async cleanup(): Promise<void> {
        if (!this.db?.data) {
            throw new Error('Database not initialized');
        }

        try {
            const now = new Date();
            const dataRetentionDate = new Date(
                now.getTime() - this.db.data.settings.dataRetentionDays * 24 * 60 * 60 * 1000
            );
            const logRetentionDate = new Date(
                now.getTime() - this.db.data.settings.logRetentionDays * 24 * 60 * 60 * 1000
            );

            // 清理数据记录
            this.db.data.dataRecords = this.db.data.dataRecords.filter(
                (record: z.infer<typeof dataRecordSchema>) => new Date(record.timestamp) > dataRetentionDate
            );

            // 清理报警历史
            this.db.data.alarmHistory = this.db.data.alarmHistory.filter(
                (alarm: z.infer<typeof alarmHistorySchema>) => new Date(alarm.triggeredAt) > dataRetentionDate
            );

            // 清理系统日志
            this.db.data.systemLogs = this.db.data.systemLogs.filter(
                (log: z.infer<typeof systemLogSchema>) => new Date(log.timestamp) > logRetentionDate
            );

            // 清理系统状态记录
            this.db.data.systemStatus = this.db.data.systemStatus.filter(
                (status: z.infer<typeof systemStatusSchema>) => new Date(status.timestamp) > logRetentionDate
            );

            // 保存更改
            await this.db.write();

            this.emit('cleanup');
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    public async close(): Promise<void> {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
            this.backupInterval = null;
        }

        if (this.db?.data) {
            await this.db.write();
        }

        this.db = null;
        this.emit('closed');
    }
}

export default DatabaseManager.getInstance();
