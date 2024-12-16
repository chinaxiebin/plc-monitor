import xlsx from 'node-xlsx';
import { promises as fs } from 'fs';
import path from 'path';
import { PLCConfig, TagConfig } from '../types';
import { DatabaseService } from '../database/database-service';
import { EventEmitter } from 'events';

// 配置变更事件类型
export enum ConfigChangeType {
    PLC_ADDED = 'plc_added',
    PLC_UPDATED = 'plc_updated',
    PLC_DELETED = 'plc_deleted',
    POINT_ADDED = 'point_added',
    POINT_UPDATED = 'point_updated',
    POINT_DELETED = 'point_deleted',
    ALARM_ADDED = 'alarm_added',
    ALARM_UPDATED = 'alarm_updated',
    ALARM_DELETED = 'alarm_deleted'
}

// 验证器接口
interface Validator<T> {
    validate(data: T): { valid: boolean; errors: string[] };
}

// PLC配置验证器
class PLCConfigValidator implements Validator<any[]> {
    validate(row: any[]): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const [name, ip, port, enabled] = row;

        if (!name) errors.push('PLC名称不能为空');
        if (!ip) errors.push('IP地址不能为空');
        if (!port || isNaN(port)) errors.push('端口号必须是有效数字');
        if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) errors.push('IP地址格式无效');
        if (port && (port < 1 || port > 65535)) errors.push('端口号必须在1-65535之间');

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// 监控点位验证器
class MonitorPointValidator implements Validator<any[]> {
    validate(row: any[]): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const [plcName, name, address, type, description, unit, scale] = row;

        if (!plcName) errors.push('PLC名称不能为空');
        if (!name) errors.push('点位名称不能为空');
        if (!address || isNaN(address)) errors.push('地址必须是有效数字');
        if (!['DI', 'DO', 'AI', 'AO', 'REG'].includes(type)) errors.push('无效的点位类型');
        if (scale && isNaN(scale)) errors.push('缩放系数必须是有效数字');

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// 报警配置验证器
class AlarmConfigValidator implements Validator<any[]> {
    validate(row: any[]): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const [pointName, condition, threshold, priority, description] = row;

        if (!pointName) errors.push('点位名称不能为空');
        if (!['>', '<', '>=', '<=', '=', '!='].includes(condition)) errors.push('无效的报警条件');
        if (!threshold || isNaN(threshold)) errors.push('报警阈值必须是有效数字');
        if (priority && (isNaN(priority) || priority < 1 || priority > 3)) errors.push('优先级必须在1-3之间');

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

export class ConfigService extends EventEmitter {
    private static instance: ConfigService;
    private dbService: DatabaseService;
    private plcValidator: PLCConfigValidator;
    private pointValidator: MonitorPointValidator;
    private alarmValidator: AlarmConfigValidator;
    private configCache: {
        plcs?: PLCConfig[];
        points?: TagConfig[];
        alarms?: any[];
        lastUpdate: number;
    } = { lastUpdate: 0 };
    private readonly cacheTimeout = 60000; // 1分钟缓存超时

    private constructor() {
        super();
        this.dbService = DatabaseService.getInstance();
        this.plcValidator = new PLCConfigValidator();
        this.pointValidator = new MonitorPointValidator();
        this.alarmValidator = new AlarmConfigValidator();
    }

    public static getInstance(): ConfigService {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService();
        }
        return ConfigService.instance;
    }

    // 获取PLC配置（带缓存）
    public async getPLCConfig(): Promise<PLCConfig[]> {
        const now = Date.now();
        if (this.configCache.plcs && (now - this.configCache.lastUpdate) < this.cacheTimeout) {
            return this.configCache.plcs;
        }

        try {
            const plcs = await this.dbService.getPLCConfigs();
            this.configCache.plcs = plcs;
            this.configCache.lastUpdate = now;
            return plcs;
        } catch (error) {
            console.error('Failed to get PLC config:', error);
            if (this.configCache.plcs) {
                return this.configCache.plcs;
            }
            throw error;
        }
    }

    // 获取监控点位（带缓存）
    public async getMonitorPoints(): Promise<TagConfig[]> {
        const now = Date.now();
        if (this.configCache.points && (now - this.configCache.lastUpdate) < this.cacheTimeout) {
            return this.configCache.points;
        }

        try {
            const points = await this.dbService.getTagConfigs();
            this.configCache.points = points;
            this.configCache.lastUpdate = now;
            return points;
        } catch (error) {
            console.error('Failed to get monitor points:', error);
            if (this.configCache.points) {
                return this.configCache.points;
            }
            throw error;
        }
    }

    // 获取报警配置（带缓存）
    public async getAlarmConfig(): Promise<any[]> {
        const now = Date.now();
        if (this.configCache.alarms && (now - this.configCache.lastUpdate) < this.cacheTimeout) {
            return this.configCache.alarms;
        }

        try {
            const alarms = await this.dbService.getAlarmConfigs();
            this.configCache.alarms = alarms;
            this.configCache.lastUpdate = now;
            return alarms;
        } catch (error) {
            console.error('Failed to get alarm config:', error);
            if (this.configCache.alarms) {
                return this.configCache.alarms;
            }
            throw error;
        }
    }

    // 清除缓存
    public clearCache(): void {
        this.configCache = { lastUpdate: 0 };
    }

    // 导入配置（带事务和事件通知）
    public async importConfig(filePath: string): Promise<{ success: boolean; errors: string[] }> {
        const workbook = xlsx.parse(filePath);
        const errors: string[] = [];

        try {
            // 读取并验证PLC配置
            const plcSheet = workbook.find(sheet => sheet.name === 'PLC配置');
            if (plcSheet) {
                const plcErrors = await this.importPLCConfig(plcSheet.data.slice(1));
                errors.push(...plcErrors);
            }

            // 读取并验证监控点位
            const pointSheet = workbook.find(sheet => sheet.name === '监控点位');
            if (pointSheet) {
                const pointErrors = await this.importMonitorPoints(pointSheet.data.slice(1));
                errors.push(...pointErrors);
            }

            // 读取并验证报警配置
            const alarmSheet = workbook.find(sheet => sheet.name === '报警配置');
            if (alarmSheet) {
                const alarmErrors = await this.importAlarmConfig(alarmSheet.data.slice(1));
                errors.push(...alarmErrors);
            }

            // 清除缓存
            this.clearCache();

            return {
                success: errors.length === 0,
                errors
            };
        } catch (error) {
            console.error('Failed to import config:', error);
            return {
                success: false,
                errors: [(error as Error).message]
            };
        }
    }

    // 备份数据库
    public async backupDatabase(backupPath?: string): Promise<string> {
        return await this.dbService.backup(true);
    }

    // 从备份恢复
    public async restoreFromBackup(backupFile: string): Promise<void> {
        await this.dbService.restore(backupFile);
        this.clearCache();
    }

    // 导出当前配置到Excel（带进度通知）
    public async exportConfig(): Promise<Buffer> {
        this.emit('exportStarted');
        
        try {
            const plcs = await this.getPLCConfig();
            const points = await this.getMonitorPoints();
            const alarms = await this.getAlarmConfig();
            
            const workbook = [
                {
                    name: 'PLC配置',
                    data: [
                        ['名称', 'IP地址', '端口', '启用状态'],
                        ...plcs.map(plc => [plc.name, plc.ip, plc.port, plc.enabled])
                    ]
                },
                {
                    name: '监控点位',
                    data: [
                        ['PLC名称', '点位名称', '地址', '类型', '描述', '单位', '缩放系数'],
                        ...points.map(point => [
                            point.plc_id,
                            point.name,
                            point.address,
                            point.type,
                            point.description,
                            point.unit,
                            point.scale
                        ])
                    ]
                },
                {
                    name: '报警配置',
                    data: [
                        ['点位ID', '条件', '阈值', '优先级', '描述', '启用状态'],
                        ...alarms.map(alarm => [
                            alarm.point_id,
                            alarm.condition,
                            alarm.threshold,
                            alarm.priority,
                            alarm.description,
                            alarm.enabled
                        ])
                    ]
                }
            ];
            
            const buffer = xlsx.build(workbook);
            this.emit('exportCompleted');
            return buffer;
        } catch (error) {
            this.emit('exportError', { error });
            throw error;
        }
    }

    private async importPLCConfig(data: any[]): Promise<string[]> {
        const errors: string[] = [];
        for (const row of data) {
            const result = this.plcValidator.validate(row);
            if (!result.valid) {
                errors.push(...result.errors);
                continue;
            }

            const [name, ip, port, enabled] = row;
            if (!name || !ip || !port) continue;

            await this.dbService.addPLCConfig(name, ip, port, enabled === '是' ? 1 : 0);
        }
        return errors;
    }

    private async importMonitorPoints(data: any[]): Promise<string[]> {
        const errors: string[] = [];
        for (const row of data) {
            const result = this.pointValidator.validate(row);
            if (!result.valid) {
                errors.push(...result.errors);
                continue;
            }

            const [plcName, name, address, type, description, unit, scale] = row;
            if (!plcName || !name || !address || !type) continue;

            // 获取PLC ID
            const plc = await this.dbService.getPLCConfig(plcName);
            if (!plc) continue;

            await this.dbService.addMonitorPoint(plc.id, name, address, type, description, unit, scale);
        }
        return errors;
    }

    private async importAlarmConfig(data: any[]): Promise<string[]> {
        const errors: string[] = [];
        for (const row of data) {
            const result = this.alarmValidator.validate(row);
            if (!result.valid) {
                errors.push(...result.errors);
                continue;
            }

            const [pointName, condition, threshold, priority, description] = row;
            if (!pointName || !condition || !threshold) continue;

            // 获取点位ID
            const point = await this.dbService.getMonitorPoint(pointName);
            if (!point) continue;

            await this.dbService.addAlarmConfig(point.id, condition, threshold, priority || 1, description);
        }
        return errors;
    }
}

export default new ConfigService();
