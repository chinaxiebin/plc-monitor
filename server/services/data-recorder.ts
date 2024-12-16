import { EventEmitter } from 'events';
import { Database } from 'sqlite';
import { promises as fs } from 'fs';
import path from 'path';
import database from '../database';
import { TagConfig } from '../types';

interface DataPoint {
    pointId: number;
    value: number;
    quality: number;
    timestamp: Date;
}

interface DataCache {
    [pointId: number]: {
        values: DataPoint[];
        lastFlush: number;
    };
}

export class DataRecorder extends EventEmitter {
    private static instance: DataRecorder;
    private db: Database;
    private cache: DataCache = {};
    private readonly maxCacheAge = 3600000; // 1小时
    private readonly maxCacheSize = 1000; // 每个点位最多缓存1000个数据点
    private flushInterval: NodeJS.Timeout | null = null;
    private readonly flushIntervalMs = 60000; // 每分钟刷新一次缓存

    private constructor() {
        super();
        this.db = database.getDb();
        this.startFlushTimer();
    }

    public static getInstance(): DataRecorder {
        if (!DataRecorder.instance) {
            DataRecorder.instance = new DataRecorder();
        }
        return DataRecorder.instance;
    }

    private startFlushTimer(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }

        this.flushInterval = setInterval(async () => {
            try {
                await this.flushCache();
            } catch (error) {
                this.emit('error', error);
            }
        }, this.flushIntervalMs);
    }

    public async record(pointId: number, value: number, quality: number = 100): Promise<void> {
        const timestamp = new Date();

        // 初始化点位缓存
        if (!this.cache[pointId]) {
            this.cache[pointId] = {
                values: [],
                lastFlush: Date.now()
            };
        }

        // 添加数据到缓存
        this.cache[pointId].values.push({
            pointId,
            value,
            quality,
            timestamp
        });

        // 检查是否需要刷新缓存
        if (this.shouldFlushCache(pointId)) {
            await this.flushPointCache(pointId);
        }

        this.emit('data', { pointId, value, quality, timestamp });
    }

    private shouldFlushCache(pointId: number): boolean {
        const pointCache = this.cache[pointId];
        if (!pointCache) return false;

        const now = Date.now();
        return pointCache.values.length >= this.maxCacheSize ||
               (now - pointCache.lastFlush) >= this.maxCacheAge;
    }

    private async flushPointCache(pointId: number): Promise<void> {
        const pointCache = this.cache[pointId];
        if (!pointCache || pointCache.values.length === 0) return;

        try {
            await this.db.run('BEGIN TRANSACTION');

            // 批量插入数据
            const stmt = await this.db.prepare(`
                INSERT INTO data_records (point_id, value, quality, timestamp)
                VALUES (?, ?, ?, ?)
            `);

            for (const point of pointCache.values) {
                await stmt.run(
                    point.pointId,
                    point.value,
                    point.quality,
                    point.timestamp
                );
            }

            await stmt.finalize();
            await this.db.run('COMMIT');

            // 清空缓存
            pointCache.values = [];
            pointCache.lastFlush = Date.now();
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    private async flushCache(): Promise<void> {
        for (const pointId of Object.keys(this.cache)) {
            try {
                await this.flushPointCache(parseInt(pointId));
            } catch (error) {
                this.emit('error', {
                    message: 'Failed to flush cache',
                    pointId,
                    error
                });
            }
        }
    }

    public async query(
        pointIds: number[],
        startTime: Date,
        endTime: Date,
        aggregation: 'raw' | 'avg' | 'min' | 'max' = 'raw',
        interval?: number
    ): Promise<any[]> {
        let query: string;
        const params: any[] = [...pointIds, startTime, endTime];

        if (aggregation === 'raw') {
            query = `
                SELECT point_id, value, quality, timestamp
                FROM data_records
                WHERE point_id IN (${pointIds.map(() => '?').join(',')})
                AND timestamp BETWEEN ? AND ?
                ORDER BY timestamp ASC
            `;
        } else {
            if (!interval) {
                interval = 60000; // 默认1分钟
            }
            
            query = `
                SELECT 
                    point_id,
                    ${aggregation}(value) as value,
                    avg(quality) as quality,
                    datetime((strftime('%s', timestamp) / (? / 1000)) * (? / 1000), 'unixepoch') as timestamp
                FROM data_records
                WHERE point_id IN (${pointIds.map(() => '?').join(',')})
                AND timestamp BETWEEN ? AND ?
                GROUP BY point_id, timestamp
                ORDER BY timestamp ASC
            `;
            params.unshift(interval, interval);
        }

        return await this.db.all(query, params);
    }

    public async export(
        pointIds: number[],
        startTime: Date,
        endTime: Date,
        format: 'csv' | 'json' = 'csv'
    ): Promise<string> {
        const data = await this.query(pointIds, startTime, endTime);
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        } else {
            // CSV格式
            const header = 'point_id,value,quality,timestamp\n';
            const rows = data.map(row => 
                `${row.point_id},${row.value},${row.quality},${row.timestamp.toISOString()}`
            ).join('\n');
            return header + rows;
        }
    }

    public async cleanup(days: number = 30): Promise<void> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        await this.db.run(
            'DELETE FROM data_records WHERE timestamp < ?',
            [cutoffDate]
        );

        // 压缩数据库
        await this.db.run('VACUUM');
    }

    public async compress(days: number = 7): Promise<void> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        // 将旧数据按小时聚合
        await this.db.run(`
            INSERT INTO data_records_compressed
            SELECT 
                point_id,
                avg(value) as value,
                avg(quality) as quality,
                datetime((strftime('%s', timestamp) / 3600) * 3600, 'unixepoch') as timestamp
            FROM data_records
            WHERE timestamp < ?
            GROUP BY point_id, timestamp
        `, [cutoffDate]);

        // 删除已压缩的原始数据
        await this.db.run(
            'DELETE FROM data_records WHERE timestamp < ?',
            [cutoffDate]
        );
    }
}

export default DataRecorder.getInstance();
