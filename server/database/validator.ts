import { z } from 'zod';

// 基础类型
const timestampSchema = z.string().datetime();
const idSchema = z.string().uuid();

// PLC配置验证
export const plcConfigSchema = z.object({
    id: idSchema,
    name: z.string().min(1).max(50),
    ip: z.string().ip(),
    port: z.number().int().min(1).max(65535),
    slaveId: z.number().int().min(0).max(255),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
});

// 监控点位验证
export const monitorPointSchema = z.object({
    id: idSchema,
    plcId: idSchema,
    name: z.string().min(1).max(50),
    address: z.string().min(1).max(20),
    dataType: z.enum(['int16', 'uint16', 'int32', 'uint32', 'float', 'boolean']),
    description: z.string().max(200).optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
});

// 报警规则验证
export const alarmRuleSchema = z.object({
    id: idSchema,
    pointId: idSchema,
    condition: z.enum(['>', '>=', '<', '<=', '==', '!=']),
    threshold: z.number(),
    severity: z.enum(['info', 'warning', 'error', 'critical']),
    message: z.string().max(200),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
});

// 报警历史验证
export const alarmHistorySchema = z.object({
    id: idSchema,
    ruleId: idSchema,
    pointId: idSchema,
    value: z.number(),
    triggeredAt: timestampSchema,
    acknowledgedAt: timestampSchema.optional(),
    resolvedAt: timestampSchema.optional()
});

// 数据记录验证
export const dataRecordSchema = z.object({
    id: idSchema,
    pointId: idSchema,
    value: z.union([z.number(), z.string(), z.boolean()]),
    timestamp: timestampSchema
});

// 系统日志验证
export const systemLogSchema = z.object({
    id: idSchema,
    level: z.enum(['debug', 'info', 'warning', 'error']),
    type: z.string().min(1).max(50),
    message: z.string().max(500),
    timestamp: timestampSchema,
    details: z.any().optional()
});

// 系统状态验证
export const systemStatusSchema = z.object({
    id: idSchema,
    type: z.enum(['cpu', 'memory', 'disk']),
    value: z.number().min(0).max(100),
    timestamp: timestampSchema
});

// 设置验证
export const settingsSchema = z.object({
    dataRetentionDays: z.number().int().min(1).max(365),
    logRetentionDays: z.number().int().min(1).max(365),
    enableCompression: z.boolean(),
    enableAutoBackup: z.boolean(),
    backupTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    autoStart: z.boolean()
});

// 完整数据库模式验证
export const dbSchema = z.object({
    plcConfig: z.array(plcConfigSchema),
    monitorPoints: z.array(monitorPointSchema),
    alarmRules: z.array(alarmRuleSchema),
    alarmHistory: z.array(alarmHistorySchema),
    dataRecords: z.array(dataRecordSchema),
    systemLogs: z.array(systemLogSchema),
    systemStatus: z.array(systemStatusSchema),
    settings: settingsSchema
});

export type DbSchema = z.infer<typeof dbSchema>;
