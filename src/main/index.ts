import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { WebServer } from '../../server/web-server';
import { DatabaseManager } from '../../server/database';
import { PlcService } from '../../server/plc-service';
import { SystemMonitorService } from '../../server/services/system-monitor-service';
import { DataRecordService } from '../../server/services/data-record-service';
import { ConfigManagerService } from '../../server/services/config-manager-service';
import { setupIpcHandlers } from '../../server/ipc';
import isDev from 'electron-is-dev';

class Application {
  private mainWindow: BrowserWindow | null = null;
  private webServer: WebServer;
  private db: DatabaseManager;
  private plcService: PlcService;
  private systemMonitor: SystemMonitorService;
  private dataRecorder: DataRecordService;
  private configManager: ConfigManagerService;

  constructor() {
    this.webServer = WebServer.getInstance();
    this.db = DatabaseManager.getInstance();
    this.plcService = PlcService.getInstance();
    this.systemMonitor = SystemMonitorService.getInstance();
    this.dataRecorder = DataRecordService.getInstance();
    this.configManager = ConfigManagerService.getInstance();

    // 确保只有一个实例在运行
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      app.quit();
      return;
    }

    this.setupAppEvents();
  }

  private setupAppEvents() {
    app.on('ready', () => this.onReady());
    app.on('window-all-closed', () => this.onWindowAllClosed());
    app.on('activate', () => this.onActivate());
    app.on('second-instance', () => this.onSecondInstance());
  }

  private async onReady() {
    try {
      // 初始化数据库
      await this.db.init();

      // 启动Web服务器
      const port = await this.webServer.start();

      // 创建主窗口
      await this.createMainWindow(port);

      // 设置IPC处理器
      setupIpcHandlers();

      // 启动服务
      await this.startServices();

    } catch (error) {
      dialog.showErrorBox('启动错误', `应用程序启动失败: ${error.message}`);
      app.quit();
    }
  }

  private async createMainWindow(port: number) {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    // 加载应用
    if (isDev) {
      await this.mainWindow.loadURL('http://localhost:3000');
      this.mainWindow.webContents.openDevTools();
    } else {
      await this.mainWindow.loadURL(`http://localhost:${port}`);
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private async startServices() {
    try {
      // 启动PLC服务
      await this.plcService.start();

      // 启动系统监控
      await this.systemMonitor.start();

      // 启动数据记录
      await this.dataRecorder.start();

    } catch (error) {
      console.error('服务启动失败:', error);
      throw error;
    }
  }

  private async stopServices() {
    try {
      // 停止所有服务
      await this.plcService.stop();
      await this.systemMonitor.stop();
      await this.dataRecorder.stop();
      await this.webServer.stop();
      await this.db.close();

    } catch (error) {
      console.error('服务停止失败:', error);
    }
  }

  private onWindowAllClosed() {
    this.stopServices().finally(() => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }

  private onActivate() {
    if (this.mainWindow === null) {
      this.onReady();
    }
  }

  private onSecondInstance() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.focus();
    }
  }
}

// 启动应用
new Application();
