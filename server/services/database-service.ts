import { DatabaseManager } from '../database';
import { z } from 'zod';
import { PLCConfig, TagConfig, AlarmConfig } from '../types';

/**
 * 数据库服务
 * 封装数据库操作，提供类型安全的API
 */
export class DatabaseService {
    private static instance: DatabaseService;
    private db: typeof DatabaseManager;

    private constructor() {
        this.db = DatabaseManager;
    }

    public static getInstance(): DatabaseService {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    /**
     * 初始化数据库
     */
    public async initialize(): Promise<void> {
        await this.db.initialize();
    }

    /**
     * 获取PLC配置列表
     */
    public async getPLCConfigs(): Promise<PLCConfig[]> {
        const configs = await this.db.getCollection('plcConfig');
        return configs as PLCConfig[];
    }

    /**
     * 更新PLC配置
     */
    public async updatePLCConfig(config: PLCConfig): Promise<void> {
        await this.db.setCollection('plcConfig', config);
    }

    /**
     * 获取监控点位配置
     */
    public async getTagConfigs(): Promise<TagConfig[]> {
        const tags = await this.db.getCollection('monitorPoints');
        return tags as TagConfig[];
    }

    /**
     * 更新监控点位配置
     */
    public async updateTagConfigs(tags: TagConfig[]): Promise<void> {
        await this.db.setCollection('monitorPoints', tags);
    }

    /**
     * 获取报警配置
     */
    public async getAlarmConfigs(): Promise<AlarmConfig[]> {
        const alarms = await this.db.getCollection('alarmConfig');
        return alarms as AlarmConfig[];
    }

    /**
     * 更新报警配置
     */
    public async updateAlarmConfigs(alarms: AlarmConfig[]): Promise<void> {
        await this.db.setCollection('alarmConfig', alarms);
    }

    /**
     * 备份数据库
     */
    public async backup(compress: boolean = true): Promise<string> {
        return await this.db.backup({ compress });
    }

    /**
     * 恢复数据库
     */
    public async restore(backupPath: string): Promise<void> {
        await this.db.restore(backupPath);
    }

    /**
     * 清理数据库
     */
    public async cleanup(): Promise<void> {
        await this.db.cleanup();
    }

    /**
     * 关闭数据库
     */
    public async close(): Promise<void> {
        await this.db.close();
    }
}
