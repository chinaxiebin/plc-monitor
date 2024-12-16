import { EventEmitter } from 'events';
import os from 'os';
import { DatabaseManager } from '../database';
import { PlcService } from '../plc-service';

export interface SystemStatus {
  cpu: {
    usage: number;
    count: number;
  };
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
  timestamp: string;
}

export interface CommunicationStatus {
  plcId: string;
  connected: boolean;
  lastError?: string;
  quality: number;
  responseTime: number;
  timestamp: string;
}

export class SystemMonitorService extends EventEmitter {
  private static instance: SystemMonitorService;
  private systemStatusInterval: NodeJS.Timer | null = null;
  private communicationStatusInterval: NodeJS.Timer | null = null;
  private db: DatabaseManager;
  private plcService: PlcService;

  private constructor() {
    super();
    this.db = DatabaseManager.getInstance();
    this.plcService = PlcService.getInstance();
  }

  public static getInstance(): SystemMonitorService {
    if (!SystemMonitorService.instance) {
      SystemMonitorService.instance = new SystemMonitorService();
    }
    return SystemMonitorService.instance;
  }

  public async start() {
    // 每5秒更新系统状态
    this.systemStatusInterval = setInterval(async () => {
      const status = await this.getSystemStatus();
      this.emit('systemStatus', status);
      await this.saveSystemStatus(status);
    }, 5000);

    // 每秒更新通信状态
    this.communicationStatusInterval = setInterval(async () => {
      const status = await this.getCommunicationStatus();
      this.emit('communicationStatus', status);
      await this.saveCommunicationStatus(status);
    }, 1000);
  }

  public stop() {
    if (this.systemStatusInterval) {
      clearInterval(this.systemStatusInterval);
      this.systemStatusInterval = null;
    }
    if (this.communicationStatusInterval) {
      clearInterval(this.communicationStatusInterval);
      this.communicationStatusInterval = null;
    }
  }

  private async getSystemStatus(): Promise<SystemStatus> {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // 计算CPU使用率
    const cpuUsage = await new Promise<number>((resolve) => {
      const startMeasure = cpus.map(cpu => ({
        idle: cpu.times.idle,
        total: Object.values(cpu.times).reduce((acc, val) => acc + val, 0),
      }));

      setTimeout(() => {
        const endMeasure = os.cpus().map(cpu => ({
          idle: cpu.times.idle,
          total: Object.values(cpu.times).reduce((acc, val) => acc + val, 0),
        }));

        const avgUsage = startMeasure.map((start, i) => {
          const end = endMeasure[i];
          const idleDiff = end.idle - start.idle;
          const totalDiff = end.total - start.total;
          return 100 - (100 * idleDiff / totalDiff);
        }).reduce((acc, val) => acc + val, 0) / cpus.length;

        resolve(Math.round(avgUsage * 100) / 100);
      }, 100);
    });

    return {
      cpu: {
        usage: cpuUsage,
        count: cpus.length,
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
      },
      disk: await this.getDiskUsage(),
      uptime: os.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  private async getDiskUsage(): Promise<{ total: number; used: number; free: number }> {
    // 这里需要根据具体操作系统实现磁盘使用情况的获取
    // 为简化示例，这里返回模拟数据
    return {
      total: 1000000000000, // 1TB
      used: 500000000000,  // 500GB
      free: 500000000000,  // 500GB
    };
  }

  private async getCommunicationStatus(): Promise<CommunicationStatus[]> {
    const plcs = await this.db.getPlcConfigs();
    return Promise.all(plcs.map(async plc => {
      const stats = this.plcService.getConnectionStats(plc.id);
      return {
        plcId: plc.id,
        connected: stats.connected,
        lastError: stats.lastError,
        quality: stats.quality,
        responseTime: stats.responseTime,
        timestamp: new Date().toISOString(),
      };
    }));
  }

  private async saveSystemStatus(status: SystemStatus) {
    await this.db.insertSystemStatus(status);
  }

  private async saveCommunicationStatus(status: CommunicationStatus[]) {
    await this.db.insertCommunicationStatus(status);
  }

  public async getHistoricalSystemStatus(startTime: string, endTime: string) {
    return await this.db.getSystemStatus(startTime, endTime);
  }

  public async getHistoricalCommunicationStatus(startTime: string, endTime: string) {
    return await this.db.getCommunicationStatus(startTime, endTime);
  }
}
