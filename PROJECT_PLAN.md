# PLC 监控项目规划

## 一、项目概述

PLC 监控系统，支持多 PLC 实时监控、报警提醒。采用绿色版模式，双击即可运行，无需安装配置。

## 二、核心功能

1. **基础监控**

   - PLC 通信
     - Modbus TCP 协议
     - 动态增减监控 PLC
     - 全局报警监控
   - 数据监控
     - DI/DO 状态
     - AI/AO 数值
     - 数据寄存器

2. **独立部署**

   - 绿色版免安装
   - 内置 Web 服务器
   - 双击运行启动
   - 自动检测端口

3. **配置管理**
   - Excel 导入配置
   - 配置备份恢复

4. **数据可视化**
   - 实时数据趋势图
     - 支持多曲线对比
     - 自动缩放和平移
     - 数据标记和注释
   - 历史数据查询
     - 时间范围选择
     - 数据过滤和排序
     - 导出为 CSV/Excel
   - 报警历史查询
     - 按优先级筛选
     - 按时间范围查询
     - 统计分析报表

5. **系统监控**
   - 通信状态监控
     - PLC 连接状态
     - 通信质量统计
     - 错误日志记录
   - 系统资源监控
     - CPU 使用率
     - 内存占用
     - 磁盘使用情况
   - 日志管理
     - 操作日志
     - 系统日志
     - 错误日志
     - 日志归档和清理

### 配置导入设计

```typescript
// 数据库表结构
interface Database {
    // PLC配置表
    plc_config: {
        id: number;          // PLC ID
        name: string;        // PLC名称
        ip: string;         // IP地址
        port: number;       // 端口号
        enabled: boolean;   // 是否启用
    };

    // 监控点位表
    monitor_points: {
        id: number;          // 点位ID
        plc_id: number;      // 所属PLC
        name: string;        // 点位名称
        address: string;     // 地址
        type: string;        // 类型(DI/DO/AI/AO/REG)
        description: string; // 描述
        unit: string;       // 单位(模拟量)
        scale: number;      // 缩放系数(模拟量)
    };

    // 报警配置表
    alarm_config: {
        id: number;          // 报警ID
        point_id: number;    // 监控点位ID
        condition: string;   // 报警条件(>/</>=/<=)
        threshold: number;   // 报警阈值
        priority: number;    // 报警优先级(1-3)
        description: string; // 报警描述
    };

    // 数据记录表
    data_records: {
        id: number;          // 记录ID
        point_id: number;    // 监控点位ID
        value: number;       // 数值
        quality: number;     // 质量戳(0-100)
        timestamp: Date;     // 时间戳
    };

    // 报警记录表
    alarm_history: {
        id: number;          // 记录ID
        rule_id: number;     // 报警规则ID
        point_id: number;    // 监控点位ID
        value: number;       // 触发值
        triggered_at: Date;  // 触发时间
        acknowledged_at: Date; // 确认时间
        acknowledged_by: string; // 确认人
        note: string;        // 备注
    };

    // 系统日志表
    system_logs: {
        id: number;          // 日志ID
        type: string;        // 日志类型(operation/system/error)
        level: string;       // 日志级别(info/warning/error)
        message: string;     // 日志内容
        details: string;     // 详细信息
        timestamp: Date;     // 时间戳
    };

    // 系统状态表
    system_status: {
        id: number;          // 状态ID
        type: string;        // 状态类型(cpu/memory/disk/network)
        value: number;       // 数值
        unit: string;        // 单位
        timestamp: Date;     // 时间戳
    };
}

// Excel模板定义
interface ExcelTemplates {
    // PLC配置表
    plc_sheet: {
        name: "PLC配置";
        columns: [
            "名称",    // name
            "IP地址",  // ip
            "端口号",  // port
            "是否启用" // enabled
        ];
    };

    // 监控点位表
    points_sheet: {
        name: "监控点位";
        columns: [
            "PLC名称",  // 关联plc_config.name
            "点位名称", // name
            "地址",    // address
            "类型",    // type
            "描述",    // description
            "单位",    // unit
            "缩放系数" // scale
        ];
    };

    // 报警配置表
    alarms_sheet: {
        name: "报警配置";
        columns: [
            "点位名称",  // 关联monitor_points.name
            "报警条件",  // condition
            "报警阈值",  // threshold
            "优先级",   // priority
            "报警描述"  // description
        ];
    };
}

// 导入管理器
class ImportManager {
    // 导入Excel文件
    async importExcel(filePath: string) {
        const workbook = await readExcel(filePath);

        // 1. 导入PLC配置
        const plcSheet = workbook.getSheet("PLC配置");
        const plcs = this.parsePLCSheet(plcSheet);
        await this.savePLCs(plcs);

        // 2. 导入监控点位
        const pointsSheet = workbook.getSheet("监控点位");
        const points = this.parsePointsSheet(pointsSheet);
        await this.savePoints(points);

        // 3. 导入报警配置
        const alarmsSheet = workbook.getSheet("报警配置");
        const alarms = this.parseAlarmsSheet(alarmsSheet);
        await this.saveAlarms(alarms);
    }

    // 解析PLC配置表
    private parsePLCSheet(sheet: Sheet): PLCConfig[] {
        return sheet.rows.map(row => ({
            name: row["名称"],
            ip: row["IP地址"],
            port: parseInt(row["端口号"]) || 502,
            enabled: row["是否启用"] === "是"
        }));
    }

    // 解析监控点位表
    private parsePointsSheet(sheet: Sheet): MonitorPoint[] {
        return sheet.rows.map(row => ({
            plc_name: row["PLC名称"],
            name: row["点位名称"],
            address: row["地址"],
            type: row["类型"],
            description: row["描述"],
            unit: row["单位"] || "",
            scale: parseFloat(row["缩放系数"]) || 1
        }));
    }

    // 解析报警配置表
    private parseAlarmsSheet(sheet: Sheet): AlarmConfig[] {
        return sheet.rows.map(row => ({
            point_name: row["点位名称"],
            condition: row["报警条件"],
            threshold: parseFloat(row["报警阈值"]),
            priority: parseInt(row["优先级"]) || 3,
            description: row["报警描述"]
        }));
    }

    // 保存到数据库
    private async savePLCs(plcs: PLCConfig[]) {
        const db = await this.getDatabase();
        await db.transaction(async () => {
            for (const plc of plcs) {
                await db.run(`
                    INSERT OR REPLACE INTO plc_config
                    (name, ip, port, enabled)
                    VALUES (?, ?, ?, ?)
                `, [plc.name, plc.ip, plc.port, plc.enabled]);
            }
        });
    }

    private async savePoints(points: MonitorPoint[]) {
        const db = await this.getDatabase();
        await db.transaction(async () => {
            for (const point of points) {
                // 查找对应的PLC ID
                const plc = await db.get(
                    "SELECT id FROM plc_config WHERE name = ?",
                    [point.plc_name]
                );
                if (!plc) continue;

                await db.run(`
                    INSERT OR REPLACE INTO monitor_points
                    (plc_id, name, address, type, description, unit, scale)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [plc.id, point.name, point.address, point.type,
                    point.description, point.unit, point.scale]);
            }
        });
    }

    private async saveAlarms(alarms: AlarmConfig[]) {
        const db = await this.getDatabase();
        await db.transaction(async () => {
            for (const alarm of alarms) {
                // 查找对应的点位ID
                const point = await db.get(
                    "SELECT id FROM monitor_points WHERE name = ?",
                    [alarm.point_name]
                );
                if (!point) continue;

                await db.run(`
                    INSERT OR REPLACE INTO alarm_config
                    (point_id, condition, threshold, priority, description)
                    VALUES (?, ?, ?, ?, ?)
                `, [point.id, alarm.condition, alarm.threshold,
                    alarm.priority, alarm.description]);
            }
        });
    }
}

// 导出管理器
class ExportManager {
    // 导出为Excel模板
    async exportTemplate(filePath: string) {
        const workbook = createExcel();

        // 创建PLC配置表
        const plcSheet = workbook.addSheet("PLC配置");
        plcSheet.addHeader([
            "名称", "IP地址", "端口号", "是否启用"
        ]);
        plcSheet.addExample([
            "注塑机1号", "192.168.1.100", "502", "是"
        ]);

        // 创建监控点位表
        const pointsSheet = workbook.addSheet("监控点位");
        pointsSheet.addHeader([
            "PLC名称", "点位名称", "地址", "类型",
            "描述", "单位", "缩放系数"
        ]);
        pointsSheet.addExample([
            "注塑机1号", "温度1", "400001", "AI",
            "模具温度", "℃", "0.1"
        ]);

        // 创建报警配置表
        const alarmsSheet = workbook.addSheet("报警配置");
        alarmsSheet.addHeader([
            "点位名称", "报警条件", "报警阈值",
            "优先级", "报警描述"
        ]);
        alarmsSheet.addExample([
            "温度1", ">", "80", "1",
            "模具温度过高"
        ]);

        await workbook.save(filePath);
    }

    // 导出当前配置
    async exportConfig(filePath: string) {
        const workbook = createExcel();
        const db = await this.getDatabase();

        // 导出PLC配置
        const plcSheet = workbook.addSheet("PLC配置");
        plcSheet.addHeader([
            "名称", "IP地址", "端口号", "是否启用"
        ]);

        const plcs = await db.all("SELECT * FROM plc_config");
        for (const plc of plcs) {
            plcSheet.addRow([
                plc.name,
                plc.ip,
                plc.port.toString(),
                plc.enabled ? "是" : "否"
            ]);
        }

        // 导出监控点位
        const pointsSheet = workbook.addSheet("监控点位");
        pointsSheet.addHeader([
            "PLC名称", "点位名称", "地址", "类型",
            "描述", "单位", "缩放系数"
        ]);

        const points = await db.all(`
            SELECT p.*, c.name as plc_name
            FROM monitor_points p
            JOIN plc_config c ON p.plc_id = c.id
        `);

        for (const point of points) {
            pointsSheet.addRow([
                point.plc_name,
                point.name,
                point.address,
                point.type,
                point.description,
                point.unit,
                point.scale.toString()
            ]);
        }

        // 导出报警配置
        const alarmsSheet = workbook.addSheet("报警配置");
        alarmsSheet.addHeader([
            "点位名称", "报警条件", "报警阈值",
            "优先级", "报警描述"
        ]);

        const alarms = await db.all(`
            SELECT a.*, p.name as point_name
            FROM alarm_config a
            JOIN monitor_points p ON a.point_id = p.id
        `);

        for (const alarm of alarms) {
            alarmsSheet.addRow([
                alarm.point_name,
                alarm.condition,
                alarm.threshold.toString(),
                alarm.priority.toString(),
                alarm.description
            ]);
        }

        await workbook.save(filePath);
    }
}

### 目录结构
```

plc-monitor/
├── www/ # Web 前端
│ ├── index.html
│ ├── css/
│ └── js/
├── data/ # 数据文件
│ ├── plc-config.db # SQLite 数据库
│ └── templates/ # Excel 模板
│ └── config.xlsx
├── config.json # 应用配置
└── start.js # 启动脚本

```

## 三、使用说明
1. 双击运行exe文件
2. 下载Excel模板
3. 填写配置信息
4. 导入配置表
5. 开始监控运行

## 四、开发计划
1. **基础开发（3周）**
   - 通信服务
   - 数据监控
   - 报警功能
   - 配置导入导出

2. **测试发布（1周）**
   - 功能测试
   - 打包发布
