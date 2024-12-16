import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { DbSchema } from './validator';

interface OldDbData {
    plcConfig?: any[];
    monitorPoints?: any[];
    alarmRules?: any[];
    alarmHistory?: any[];
    dataRecords?: any[];
    systemLogs?: any[];
    systemStatus?: any[];
    settings?: any;
}

export class DatabaseMigrator {
    private readonly oldDbPath: string;
    private readonly newDbPath: string;

    constructor() {
        const userDataPath = app.getPath('userData');
        this.oldDbPath = path.join(userDataPath, 'db');
        this.newDbPath = path.join(userDataPath, 'db.json');
    }

    public async migrate(): Promise<void> {
        try {
            // 检查是否需要迁移
            if (!await this.needsMigration()) {
                console.log('No migration needed');
                return;
            }

            // 读取旧数据
            const oldData = await this.readOldData();

            // 转换数据
            const newData = await this.convertData(oldData);

            // 保存新数据
            await this.saveNewData(newData);

            // 备份旧数据
            await this.backupOldData();

            console.log('Migration completed successfully');
        } catch (error) {
            console.error('Migration failed:', error);
            throw error;
        }
    }

    private async needsMigration(): Promise<boolean> {
        try {
            // 检查旧数据库文件是否存在
            const oldDbExists = await fs.access(this.oldDbPath)
                .then(() => true)
                .catch(() => false);

            // 检查新数据库文件是否已存在
            const newDbExists = await fs.access(this.newDbPath)
                .then(() => true)
                .catch(() => false);

            return oldDbExists && !newDbExists;
        } catch (error) {
            console.error('Error checking migration status:', error);
            return false;
        }
    }

    private async readOldData(): Promise<OldDbData> {
        const data: OldDbData = {};
        const collections = [
            'plc_config',
            'monitor_points',
            'alarm_rules',
            'alarm_history',
            'data_records',
            'system_logs',
            'system_status',
            'settings'
        ];

        for (const collection of collections) {
            const filePath = path.join(this.oldDbPath, `${collection}.db`);
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const lines = content.split('\n').filter(line => line.trim());
                const items = lines.map(line => JSON.parse(line));
                
                // 转换集合名称
                const key = this.convertCollectionName(collection);
                if (key) {
                    data[key] = items;
                }
            } catch (error) {
                console.warn(`Warning: Could not read collection ${collection}:`, error);
            }
        }

        return data;
    }

    private convertCollectionName(name: string): keyof OldDbData | null {
        const mapping: { [key: string]: keyof OldDbData } = {
            'plc_config': 'plcConfig',
            'monitor_points': 'monitorPoints',
            'alarm_rules': 'alarmRules',
            'alarm_history': 'alarmHistory',
            'data_records': 'dataRecords',
            'system_logs': 'systemLogs',
            'system_status': 'systemStatus',
            'settings': 'settings'
        };
        return mapping[name] || null;
    }

    private async convertData(oldData: OldDbData): Promise<DbSchema> {
        const now = new Date().toISOString();

        return {
            plcConfig: (oldData.plcConfig || []).map(item => ({
                id: item._id || uuidv4(),
                name: item.name,
                ip: item.ip,
                port: item.port,
                slaveId: item.slaveId,
                createdAt: item.createdAt || now,
                updatedAt: item.updatedAt || now
            })),
            monitorPoints: (oldData.monitorPoints || []).map(item => ({
                id: item._id || uuidv4(),
                plcId: item.plcId,
                name: item.name,
                address: item.address,
                dataType: item.dataType,
                description: item.description,
                createdAt: item.createdAt || now,
                updatedAt: item.updatedAt || now
            })),
            alarmRules: (oldData.alarmRules || []).map(item => ({
                id: item._id || uuidv4(),
                pointId: item.pointId,
                condition: item.condition,
                threshold: item.threshold,
                severity: item.severity,
                message: item.message,
                createdAt: item.createdAt || now,
                updatedAt: item.updatedAt || now
            })),
            alarmHistory: (oldData.alarmHistory || []).map(item => ({
                id: item._id || uuidv4(),
                ruleId: item.ruleId,
                pointId: item.pointId,
                value: item.value,
                triggeredAt: item.triggeredAt,
                acknowledgedAt: item.acknowledgedAt,
                resolvedAt: item.resolvedAt
            })),
            dataRecords: (oldData.dataRecords || []).map(item => ({
                id: item._id || uuidv4(),
                pointId: item.pointId,
                value: item.value,
                timestamp: item.timestamp
            })),
            systemLogs: (oldData.systemLogs || []).map(item => ({
                id: item._id || uuidv4(),
                level: item.level,
                type: item.type,
                message: item.message,
                timestamp: item.timestamp,
                details: item.details
            })),
            systemStatus: (oldData.systemStatus || []).map(item => ({
                id: item._id || uuidv4(),
                type: item.type,
                value: item.value,
                timestamp: item.timestamp
            })),
            settings: oldData.settings || {
                dataRetentionDays: 30,
                logRetentionDays: 30,
                enableCompression: true,
                enableAutoBackup: true,
                backupTime: '02:00',
                autoStart: true
            }
        };
    }

    private async saveNewData(data: DbSchema): Promise<void> {
        const jsonData = JSON.stringify(data, null, 2);
        await fs.writeFile(this.newDbPath, jsonData, 'utf-8');
    }

    private async backupOldData(): Promise<void> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(app.getPath('userData'), 'backups', `old-db-${timestamp}`);
        
        try {
            // 创建备份目录
            await fs.mkdir(backupDir, { recursive: true });
            
            // 复制所有旧数据库文件
            const files = await fs.readdir(this.oldDbPath);
            for (const file of files) {
                const sourcePath = path.join(this.oldDbPath, file);
                const targetPath = path.join(backupDir, file);
                await fs.copyFile(sourcePath, targetPath);
            }
            
            console.log(`Old database backed up to: ${backupDir}`);
        } catch (error) {
            console.error('Failed to backup old database:', error);
            throw error;
        }
    }
}
