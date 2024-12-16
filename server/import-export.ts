import * as XLSX from 'xlsx';
import database from './database';
import { Database } from 'sqlite';
import path from 'path';

interface PLCConfig {
    name: string;
    ip: string;
    port: number;
    enabled: boolean;
}

interface MonitorPoint {
    plc_name: string;
    name: string;
    address: string;
    type: string;
    description?: string;
    unit?: string;
    scale?: number;
}

interface AlarmConfig {
    point_name: string;
    condition: string;
    threshold: number;
    priority: number;
    description?: string;
}

export class ImportExportManager {
    private static instance: ImportExportManager;
    private db: Database | null = null;

    private constructor() {}

    public static getInstance(): ImportExportManager {
        if (!ImportExportManager.instance) {
            ImportExportManager.instance = new ImportExportManager();
        }
        return ImportExportManager.instance;
    }

    private async getDb(): Promise<Database> {
        if (!this.db) {
            this.db = await database.getDb();
        }
        return this.db;
    }

    public async importExcel(filePath: string): Promise<void> {
        const workbook = XLSX.readFile(filePath);
        const db = await this.getDb();

        await db.run('BEGIN TRANSACTION');

        try {
            // 导入PLC配置
            const plcSheet = workbook.Sheets["PLC配置"];
            if (plcSheet) {
                const plcs = XLSX.utils.sheet_to_json<PLCConfig>(plcSheet);
                for (const plc of plcs) {
                    await db.run(`
                        INSERT OR REPLACE INTO plc_config (name, ip, port, enabled)
                        VALUES (?, ?, ?, ?)
                    `, [plc.name, plc.ip, plc.port, plc.enabled ? 1 : 0]);
                }
            }

            // 导入监控点位
            const pointsSheet = workbook.Sheets["监控点位"];
            if (pointsSheet) {
                const points = XLSX.utils.sheet_to_json<MonitorPoint>(pointsSheet);
                for (const point of points) {
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
                        point.description, point.unit, point.scale || 1]);
                }
            }

            // 导入报警配置
            const alarmsSheet = workbook.Sheets["报警配置"];
            if (alarmsSheet) {
                const alarms = XLSX.utils.sheet_to_json<AlarmConfig>(alarmsSheet);
                for (const alarm of alarms) {
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
            }

            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    }

    public async exportTemplate(filePath: string): Promise<void> {
        const workbook = XLSX.utils.book_new();

        // PLC配置模板
        const plcData = [
            {
                name: "注塑机1号",
                ip: "192.168.1.100",
                port: 502,
                enabled: "是"
            }
        ];
        const plcSheet = XLSX.utils.json_to_sheet(plcData);
        XLSX.utils.book_append_sheet(workbook, plcSheet, "PLC配置");

        // 监控点位模板
        const pointsData = [
            {
                plc_name: "注塑机1号",
                name: "模具温度",
                address: "40001",
                type: "保持寄存器",
                description: "模具当前温度",
                unit: "℃",
                scale: 0.1
            }
        ];
        const pointsSheet = XLSX.utils.json_to_sheet(pointsData);
        XLSX.utils.book_append_sheet(workbook, pointsSheet, "监控点位");

        // 报警配置模板
        const alarmsData = [
            {
                point_name: "模具温度",
                condition: ">",
                threshold: 80,
                priority: 1,
                description: "模具温度过高"
            }
        ];
        const alarmsSheet = XLSX.utils.json_to_sheet(alarmsData);
        XLSX.utils.book_append_sheet(workbook, alarmsSheet, "报警配置");

        XLSX.writeFile(workbook, filePath);
    }

    public async exportConfig(filePath: string): Promise<void> {
        const db = await this.getDb();
        const workbook = XLSX.utils.book_new();

        // 导出PLC配置
        const plcs = await db.all("SELECT name, ip, port, enabled FROM plc_config");
        const plcSheet = XLSX.utils.json_to_sheet(plcs.map(plc => ({
            ...plc,
            enabled: plc.enabled ? "是" : "否"
        })));
        XLSX.utils.book_append_sheet(workbook, plcSheet, "PLC配置");

        // 导出监控点位
        const points = await db.all(`
            SELECT p.*, c.name as plc_name
            FROM monitor_points p
            JOIN plc_config c ON p.plc_id = c.id
        `);
        const pointsSheet = XLSX.utils.json_to_sheet(points);
        XLSX.utils.book_append_sheet(workbook, pointsSheet, "监控点位");

        // 导出报警配置
        const alarms = await db.all(`
            SELECT a.*, p.name as point_name
            FROM alarm_config a
            JOIN monitor_points p ON a.point_id = p.id
        `);
        const alarmsSheet = XLSX.utils.json_to_sheet(alarms);
        XLSX.utils.book_append_sheet(workbook, alarmsSheet, "报警配置");

        XLSX.writeFile(workbook, filePath);
    }
}

export default ImportExportManager.getInstance();
