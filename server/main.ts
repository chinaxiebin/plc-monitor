import { app, BrowserWindow } from 'electron';
import path from 'path';
import database from './database';
import plcService from './plc-service';
import configService from './services/config-service';
import systemMonitor from './services/system-monitor';
import dataRecorder from './services/data-recorder';
import { initialize as initializeIpc } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    if (process.env.NODE_ENV === 'development') {
        // 开发环境下加载开发服务器地址
        await mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        // 生产环境下加载打包后的页面
        await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

async function initialize() {
    try {
        // 初始化数据库
        await database.initialize();

        // 初始化IPC处理器
        await initializeIpc();

        // 初始化服务
        await configService.initialize();
        await systemMonitor.start();

        // 如果启用了自动备份，设置定时任务
        const settings = await database.getDb().get('SELECT * FROM settings LIMIT 1');
        if (settings?.enableAutoBackup) {
            const [hours, minutes] = settings.backupTime.split(':').map(Number);
            scheduleBackup(hours, minutes);
        }

        // 创建窗口
        await createWindow();

        // 自动启动PLC服务
        if (settings?.autoStart) {
            await plcService.start();
        }
    } catch (error) {
        console.error('初始化失败:', error);
        app.quit();
    }
}

// 设置自动备份定时任务
function scheduleBackup(hours: number, minutes: number) {
    const now = new Date();
    let backupTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hours,
        minutes
    );

    // 如果今天的备份时间已经过了，设置为明天
    if (backupTime.getTime() < now.getTime()) {
        backupTime.setDate(backupTime.getDate() + 1);
    }

    const delay = backupTime.getTime() - now.getTime();
    setTimeout(async () => {
        try {
            await database.backup();
            // 设置下一次备份
            scheduleBackup(hours, minutes);
        } catch (error) {
            console.error('自动备份失败:', error);
            // 出错时1小时后重试
            setTimeout(() => scheduleBackup(hours, minutes), 3600000);
        }
    }, delay);
}

// 应用事件处理
app.whenReady().then(initialize);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// 优雅退出
app.on('before-quit', async () => {
    // 停止所有服务
    await plcService.stop();
    await systemMonitor.stop();

    // 关闭数据库连接
    await database.close();
});
