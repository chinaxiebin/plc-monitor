import { ipcMain } from 'electron';
import { ConfigManagerService } from '../services/config-manager-service';
import path from 'path';
import { app } from 'electron';

export function setupConfigHandlers() {
  const configManager = ConfigManagerService.getInstance();
  const backupDir = path.join(app.getPath('userData'), 'backups');

  // 导入配置
  ipcMain.handle('config:import', async (event, filePath: string) => {
    try {
      await configManager.importFromExcel(filePath);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '导入失败' 
      };
    }
  });

  // 导出配置
  ipcMain.handle('config:export', async (event, filePath: string) => {
    try {
      await configManager.exportToExcel(filePath);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '导出失败' 
      };
    }
  });

  // 创建备份
  ipcMain.handle('config:createBackup', async () => {
    try {
      const backupPath = await configManager.createBackup(backupDir);
      return { 
        success: true, 
        backupPath 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '创建备份失败' 
      };
    }
  });

  // 恢复备份
  ipcMain.handle('config:restoreBackup', async (event, backupPath: string) => {
    try {
      await configManager.restoreBackup(backupPath);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '恢复备份失败' 
      };
    }
  });

  // 获取配置预览
  ipcMain.handle('config:preview', async (event, filePath: string) => {
    try {
      const workbook = await import('xlsx').then(XLSX => XLSX.readFile(filePath));
      const preview = {
        plcConfigs: [],
        points: [],
        alarms: [],
      };

      // 读取PLC配置
      const plcSheet = workbook.Sheets['PLC配置'];
      if (plcSheet) {
        preview.plcConfigs = await import('xlsx').then(XLSX => 
          XLSX.utils.sheet_to_json(plcSheet)
        );
      }

      // 读取监控点配置
      const pointSheet = workbook.Sheets['监控点配置'];
      if (pointSheet) {
        preview.points = await import('xlsx').then(XLSX => 
          XLSX.utils.sheet_to_json(pointSheet)
        );
      }

      // 读取报警配置
      const alarmSheet = workbook.Sheets['报警配置'];
      if (alarmSheet) {
        preview.alarms = await import('xlsx').then(XLSX => 
          XLSX.utils.sheet_to_json(alarmSheet)
        );
      }

      return { 
        success: true, 
        preview 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '读取预览失败' 
      };
    }
  });

  // 下载配置模板
  ipcMain.handle('config:downloadTemplate', async () => {
    try {
      const templatePath = path.join(app.getPath('userData'), 'templates', 'config_template.xlsx');
      const workbook = await import('xlsx').then(XLSX => XLSX.utils.book_new());

      // PLC配置模板
      const plcTemplate = [
        {
          name: 'PLC1',
          ip: '192.168.1.100',
          port: 502,
          enabled: true,
        }
      ];
      const plcSheet = await import('xlsx').then(XLSX => 
        XLSX.utils.json_to_sheet(plcTemplate)
      );
      await import('xlsx').then(XLSX => 
        XLSX.utils.book_append_sheet(workbook, plcSheet, 'PLC配置')
      );

      // 监控点配置模板
      const pointTemplate = [
        {
          name: '温度传感器1',
          plc_id: 1,
          address: 'D100',
          type: 'AI',
          description: '1号机温度',
          unit: '℃',
          scale: 0.1,
        }
      ];
      const pointSheet = await import('xlsx').then(XLSX => 
        XLSX.utils.json_to_sheet(pointTemplate)
      );
      await import('xlsx').then(XLSX => 
        XLSX.utils.book_append_sheet(workbook, pointSheet, '监控点配置')
      );

      // 报警配置模板
      const alarmTemplate = [
        {
          point_id: 1,
          condition: '>',
          threshold: 80,
          priority: 2,
          description: '温度过高报警',
        }
      ];
      const alarmSheet = await import('xlsx').then(XLSX => 
        XLSX.utils.json_to_sheet(alarmTemplate)
      );
      await import('xlsx').then(XLSX => 
        XLSX.utils.book_append_sheet(workbook, alarmSheet, '报警配置')
      );

      // 保存模板
      await import('xlsx').then(XLSX => 
        XLSX.writeFile(workbook, templatePath)
      );

      return { 
        success: true, 
        templatePath 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '创建模板失败' 
      };
    }
  });
}
