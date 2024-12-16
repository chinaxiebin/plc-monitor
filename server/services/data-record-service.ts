import { EventEmitter } from 'events';
import { DatabaseService } from '../database/database-service';
import { MonitorService } from './monitor-service';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

interface DataRecord {
    pointId: string;
    value: number;
    quality: number;
    timestamp: string;
}

interface DataQuery {
    startTime: string;
    endTime: string;
    pointIds?: string[];
    minQuality?: number;
}

interface ArchiveOptions {
    olderThan: number; // 毫秒
    compress: boolean;
}

export class DataRecordService extends EventEmitter {
    private static instance: DataRecordService;
    private dbService: DatabaseService;
    private monitorService: MonitorService;
    private archiveInterval: NodeJS.Timeout | null = null;
    private readonly archiveIntervalMs = 24 * 60 * 60 * 1000; // 每天归档一次
    private readonly dataDir: string;
    private readonly archiveDir: string;

    private constructor() {
        super();
        this.dbService = DatabaseService.getInstance();
        this.monitorService = MonitorService.getInstance();
        
        // 创建数据目录
        this.dataDir = path.join(process.cwd(), 'data');
        this.archiveDir = path.join(this.dataDir, 'archive');
        fs.mkdirSync(this.dataDir, { recursive: true });
        fs.mkdirSync(this.archiveDir, { recursive: true });

        // 监听监控点数据更新
        this.monitorService.on('data', this.handleDataUpdate.bind(this));
    }

    public static getInstance(): DataRecordService {
        if (!DataRecordService.instance) {
            DataRecordService.instance = new DataRecordService();
        }
        return DataRecordService.instance;
    }

    /**
     * 启动数据记录服务
     */
    public start(): void {
        if (this.archiveInterval) {
            return;
        }

        // 启动自动归档
        this.archiveInterval = setInterval(async () => {
            try {
                await this.archive({
                    olderThan: 30 * 24 * 60 * 60 * 1000, // 30天
                    compress: true
                });
            } catch (error) {
                console.error('Archive error:', error);
                this.emit('error', error);
            }
        }, this.archiveIntervalMs);
    }

    /**
     * 停止数据记录服务
     */
    public stop(): void {
        if (this.archiveInterval) {
            clearInterval(this.archiveInterval);
            this.archiveInterval = null;
        }
    }

    /**
     * 处理数据更新
     */
    private async handleDataUpdate(data: {
        pointId: string;
        value: number;
        quality: number;
    }): Promise<void> {
        try {
            const record: DataRecord = {
                ...data,
                timestamp: new Date().toISOString()
            };

            // 写入数据文件
            const fileName = this.getDataFileName();
            const filePath = path.join(this.dataDir, fileName);
            
            await fs.promises.appendFile(
                filePath,
                JSON.stringify(record) + '\n'
            );

            this.emit('record', record);
        } catch (error) {
            console.error('Record error:', error);
            this.emit('error', error);
        }
    }

    /**
     * 查询历史数据
     */
    public async query(query: DataQuery): Promise<DataRecord[]> {
        const records: DataRecord[] = [];
        const files = await this.getDataFiles(query);

        for (const file of files) {
            const content = await fs.promises.readFile(file, 'utf8');
            const lines = content.split('\n').filter(Boolean);

            for (const line of lines) {
                const record: DataRecord = JSON.parse(line);
                
                if (record.timestamp >= query.startTime &&
                    record.timestamp <= query.endTime &&
                    (!query.pointIds || query.pointIds.includes(record.pointId)) &&
                    (!query.minQuality || record.quality >= query.minQuality)) {
                    records.push(record);
                }
            }
        }

        return records.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
    }

    /**
     * 归档数据
     */
    public async archive(options: ArchiveOptions): Promise<void> {
        const files = await fs.promises.readdir(this.dataDir);
        const now = Date.now();

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const filePath = path.join(this.dataDir, file);
            const stats = await fs.promises.stat(filePath);

            if (now - stats.mtimeMs > options.olderThan) {
                const content = await fs.promises.readFile(filePath);
                const archivePath = path.join(
                    this.archiveDir,
                    file.replace('.json', '.gz')
                );

                if (options.compress) {
                    const compressed = await gzip(content);
                    await fs.promises.writeFile(archivePath, compressed);
                } else {
                    await fs.promises.copyFile(filePath, archivePath);
                }

                await fs.promises.unlink(filePath);
                this.emit('archive', { file, archivePath });
            }
        }
    }

    /**
     * 清理数据
     */
    public async cleanup(olderThan: number): Promise<void> {
        const files = await fs.promises.readdir(this.archiveDir);
        const now = Date.now();

        for (const file of files) {
            const filePath = path.join(this.archiveDir, file);
            const stats = await fs.promises.stat(filePath);

            if (now - stats.mtimeMs > olderThan) {
                await fs.promises.unlink(filePath);
                this.emit('cleanup', { file });
            }
        }
    }

    /**
     * 获取当前数据文件名
     */
    private getDataFileName(): string {
        const date = new Date();
        return `data_${date.getFullYear()}-${
            (date.getMonth() + 1).toString().padStart(2, '0')
        }-${
            date.getDate().toString().padStart(2, '0')
        }.json`;
    }

    /**
     * 获取数据文件列表
     */
    private async getDataFiles(query: DataQuery): Promise<string[]> {
        const files: string[] = [];
        
        // 检查当前数据目录
        const dataFiles = await fs.promises.readdir(this.dataDir);
        for (const file of dataFiles) {
            if (file.endsWith('.json')) {
                files.push(path.join(this.dataDir, file));
            }
        }

        // 检查归档目录
        const archiveFiles = await fs.promises.readdir(this.archiveDir);
        for (const file of archiveFiles) {
            if (file.endsWith('.gz')) {
                files.push(path.join(this.archiveDir, file));
            }
        }

        return files;
    }

    /**
     * 导出数据为CSV
     */
    public async exportToCsv(query: DataQuery): Promise<string> {
        const records = await this.query(query);
        const points = await this.dbService.getTagConfigs();
        
        let csv = 'Time,Point,Value,Quality\n';
        
        for (const record of records) {
            const point = points.find(p => p.id === record.pointId);
            csv += `${record.timestamp},${point?.name || record.pointId},${record.value},${record.quality}\n`;
        }

        return csv;
    }
}
