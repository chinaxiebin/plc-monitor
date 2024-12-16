import { ipcMain } from 'electron';
import database from './database';
import plcService from './plc-service';
import configService from './services/config-service';
import systemMonitor from './services/system-monitor';
import dataRecorder from './services/data-recorder';

// 初始化IPC处理器
export function initializeIpcHandlers() {
    // 服务控制
    ipcMain.handle('start-service', async () => {
        await plcService.start();
        return { success: true };
    });

    ipcMain.handle('stop-service', async () => {
        await plcService.stop();
        return { success: true };
    });

    ipcMain.handle('get-service-status', async () => {
        return {
            running: plcService.isRunning(),
            connectionStatus: plcService.getConnectionStatus()
        };
    });

    // 数据查询
    ipcMain.handle('query-data', async (event, args) => {
        const { pointIds, startTime, endTime, aggregation, interval } = args;
        return await dataRecorder.query(
            pointIds,
            new Date(startTime),
            new Date(endTime),
            aggregation,
            interval
        );
    });

    ipcMain.handle('export-data', async (event, args) => {
        const { pointIds, startTime, endTime, format } = args;
        return await dataRecorder.export(
            pointIds,
            new Date(startTime),
            new Date(endTime),
            format
        );
    });

    // 系统监控
    ipcMain.handle('get-system-status', async () => {
        return await systemMonitor.getSystemStatus();
    });

    ipcMain.handle('get-system-trend', async (event, args) => {
        const { type, hours } = args;
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - hours * 3600000);
        return await systemMonitor.getSystemStatus(startTime, endTime);
    });

    ipcMain.handle('get-system-logs', async (event, args) => {
        const { level, page, pageSize } = args;
        const logs = await systemMonitor.getLogs(
            undefined,
            level,
            undefined,
            undefined,
            pageSize
        );

        const total = await database.getDb().get(
            'SELECT COUNT(*) as count FROM system_logs WHERE level = ? OR ? = ""',
            [level, level]
        );

        return {
            logs: logs.slice((page - 1) * pageSize, page * pageSize),
            total: total.count
        };
    });

    // 监控点位
    ipcMain.handle('get-monitor-points', async () => {
        return await configService.getMonitorPoints();
    });

    // 系统设置
    ipcMain.handle('get-settings', async () => {
        const settings = await database.getDb().get('SELECT * FROM settings LIMIT 1');
        return settings || {
            dataRetentionDays: 30,
            logRetentionDays: 30,
            enableCompression: true,
            enableAutoBackup: true,
            backupTime: '02:00'
        };
    });

    ipcMain.handle('save-settings', async (event, settings) => {
        await database.getDb().run('DELETE FROM settings');
        await database.getDb().run(
            `INSERT INTO settings (
                dataRetentionDays,
                logRetentionDays,
                enableCompression,
                enableAutoBackup,
                backupTime
            ) VALUES (?, ?, ?, ?, ?)`,
            [
                settings.dataRetentionDays,
                settings.logRetentionDays,
                settings.enableCompression ? 1 : 0,
                settings.enableAutoBackup ? 1 : 0,
                settings.backupTime
            ]
        );

        // 更新服务配置
        if (settings.enableCompression) {
            const days = Math.floor(settings.dataRetentionDays / 2);
            await dataRecorder.compress(days);
        }

        // 清理过期数据和日志
        await dataRecorder.cleanup(settings.dataRetentionDays);
        await systemMonitor.cleanupOldLogs(settings.logRetentionDays);

        return { success: true };
    });
}

// 更新数据库结构
async function updateDatabaseSchema() {
    const db = database.getDb();
    
    // 创建设置表
    await db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dataRetentionDays INTEGER DEFAULT 30,
            logRetentionDays INTEGER DEFAULT 30,
            enableCompression BOOLEAN DEFAULT 1,
            enableAutoBackup BOOLEAN DEFAULT 1,
            backupTime TEXT DEFAULT '02:00'
        )
    `);

    // 检查是否需要插入默认设置
    const settings = await db.get('SELECT * FROM settings LIMIT 1');
    if (!settings) {
        await db.run(`
            INSERT INTO settings (
                dataRetentionDays,
                logRetentionDays,
                enableCompression,
                enableAutoBackup,
                backupTime
            ) VALUES (30, 30, 1, 1, '02:00')
        `);
    }
}

// 初始化
export async function initialize() {
    await updateDatabaseSchema();
    initializeIpcHandlers();
}
