import { EventEmitter } from 'events';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseManager } from '../database';
import { PlcConfig, MonitorPoint, AlarmConfig } from '../types';

export class ConfigManagerService extends EventEmitter {
  private static instance: ConfigManagerService;
  private db: DatabaseManager;

  private constructor() {
    super();
    this.db = DatabaseManager.getInstance();
  }

  public static getInstance(): ConfigManagerService {
    if (!ConfigManagerService.instance) {
      ConfigManagerService.instance = new ConfigManagerService();
    }
    return ConfigManagerService.instance;
  }

  /**
   * 从Excel导入配置
   */
  public async importFromExcel(filePath: string): Promise<void> {
    try {
      const workbook = XLSX.readFile(filePath);

      // 导入PLC配置
      const plcSheet = workbook.Sheets['PLC配置'];
      if (plcSheet) {
        const plcConfigs: PlcConfig[] = XLSX.utils.sheet_to_json(plcSheet);
        await this.validatePlcConfigs(plcConfigs);
        await this.db.savePlcConfigs(plcConfigs);
      }

      // 导入监控点配置
      const pointSheet = workbook.Sheets['监控点配置'];
      if (pointSheet) {
        const points: MonitorPoint[] = XLSX.utils.sheet_to_json(pointSheet);
        await this.validatePoints(points);
        await this.db.saveMonitorPoints(points);
      }

      // 导入报警配置
      const alarmSheet = workbook.Sheets['报警配置'];
      if (alarmSheet) {
        const alarms: AlarmConfig[] = XLSX.utils.sheet_to_json(alarmSheet);
        await this.validateAlarms(alarms);
        await this.db.saveAlarmConfigs(alarms);
      }

      this.emit('configImported');
    } catch (error) {
      throw new Error(`导入配置失败: ${error.message}`);
    }
  }

  /**
   * 导出配置到Excel
   */
  public async exportToExcel(filePath: string): Promise<void> {
    try {
      const workbook = XLSX.utils.book_new();

      // 导出PLC配置
      const plcConfigs = await this.db.getPlcConfigs();
      const plcSheet = XLSX.utils.json_to_sheet(plcConfigs);
      XLSX.utils.book_append_sheet(workbook, plcSheet, 'PLC配置');

      // 导出监控点配置
      const points = await this.db.getMonitorPoints();
      const pointSheet = XLSX.utils.json_to_sheet(points);
      XLSX.utils.book_append_sheet(workbook, pointSheet, '监控点配置');

      // 导出报警配置
      const alarms = await this.db.getAlarmConfigs();
      const alarmSheet = XLSX.utils.json_to_sheet(alarms);
      XLSX.utils.book_append_sheet(workbook, alarmSheet, '报警配置');

      // 写入文件
      XLSX.writeFile(workbook, filePath);
      this.emit('configExported');
    } catch (error) {
      throw new Error(`导出配置失败: ${error.message}`);
    }
  }

  /**
   * 创建配置备份
   */
  public async createBackup(backupDir: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `backup_${timestamp}`);
      
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // 导出数据库
      const dbData = await this.db.exportData();
      fs.writeFileSync(path.join(backupPath, 'database.json'), JSON.stringify(dbData, null, 2));

      // 导出配置文件
      await this.exportToExcel(path.join(backupPath, 'config.xlsx'));

      // 创建压缩文件
      const archiver = require('archiver');
      const output = fs.createWriteStream(`${backupPath}.zip`);
      const archive = archiver('zip', { zlib: { level: 9 } });

      await new Promise((resolve, reject) => {
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(backupPath, false);
        archive.finalize();
      });

      // 清理临时文件
      fs.rmSync(backupPath, { recursive: true, force: true });

      this.emit('backupCreated', `${backupPath}.zip`);
      return `${backupPath}.zip`;
    } catch (error) {
      throw new Error(`创建备份失败: ${error.message}`);
    }
  }

  /**
   * 恢复配置备份
   */
  public async restoreBackup(backupPath: string): Promise<void> {
    try {
      const tempDir = path.join(path.dirname(backupPath), 'temp_restore');
      
      // 解压备份文件
      const extract = require('extract-zip');
      await extract(backupPath, { dir: tempDir });

      // 恢复数据库
      const dbData = JSON.parse(fs.readFileSync(path.join(tempDir, 'database.json'), 'utf8'));
      await this.db.importData(dbData);

      // 恢复配置文件
      await this.importFromExcel(path.join(tempDir, 'config.xlsx'));

      // 清理临时文件
      fs.rmSync(tempDir, { recursive: true, force: true });

      this.emit('backupRestored');
    } catch (error) {
      throw new Error(`恢复备份失败: ${error.message}`);
    }
  }

  /**
   * 验证PLC配置
   */
  private async validatePlcConfigs(configs: PlcConfig[]): Promise<void> {
    const errors: string[] = [];
    const ips = new Set<string>();

    configs.forEach((config, index) => {
      if (!config.name) {
        errors.push(`第${index + 1}行: PLC名称不能为空`);
      }
      if (!config.ip) {
        errors.push(`第${index + 1}行: IP地址不能为空`);
      } else if (ips.has(config.ip)) {
        errors.push(`第${index + 1}行: IP地址${config.ip}重复`);
      } else {
        ips.add(config.ip);
      }
      if (!config.port || config.port < 0 || config.port > 65535) {
        errors.push(`第${index + 1}行: 端口号无效`);
      }
    });

    if (errors.length > 0) {
      throw new Error(`PLC配置验证失败:\n${errors.join('\n')}`);
    }
  }

  /**
   * 验证监控点配置
   */
  private async validatePoints(points: MonitorPoint[]): Promise<void> {
    const errors: string[] = [];
    const names = new Set<string>();

    points.forEach((point, index) => {
      if (!point.name) {
        errors.push(`第${index + 1}行: 点位名称不能为空`);
      } else if (names.has(point.name)) {
        errors.push(`第${index + 1}行: 点位名称${point.name}重复`);
      } else {
        names.add(point.name);
      }
      if (!point.address) {
        errors.push(`第${index + 1}行: 地址不能为空`);
      }
      if (!['DI', 'DO', 'AI', 'AO', 'REG'].includes(point.type)) {
        errors.push(`第${index + 1}行: 类型无效`);
      }
    });

    if (errors.length > 0) {
      throw new Error(`监控点配置验证失败:\n${errors.join('\n')}`);
    }
  }

  /**
   * 验证报警配置
   */
  private async validateAlarms(alarms: AlarmConfig[]): Promise<void> {
    const errors: string[] = [];
    const points = await this.db.getMonitorPoints();
    const pointIds = new Set(points.map(p => p.id));

    alarms.forEach((alarm, index) => {
      if (!pointIds.has(alarm.pointId)) {
        errors.push(`第${index + 1}行: 监控点ID${alarm.pointId}不存在`);
      }
      if (!['>', '<', '>=', '<=', '=='].includes(alarm.condition)) {
        errors.push(`第${index + 1}行: 报警条件无效`);
      }
      if (typeof alarm.threshold !== 'number') {
        errors.push(`第${index + 1}行: 报警阈值必须是数字`);
      }
      if (![1, 2, 3].includes(alarm.priority)) {
        errors.push(`第${index + 1}行: 报警优先级必须是1-3`);
      }
    });

    if (errors.length > 0) {
      throw new Error(`报警配置验证失败:\n${errors.join('\n')}`);
    }
  }
}
