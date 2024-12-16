import { DatabaseManager } from '../database';
import { EventEmitter } from 'events';

interface AlarmRule {
    id: number;
    point_id: number;
    condition: '>' | '<' | '>=' | '<=' | '=' | '!=';
    threshold: number;
    priority: 1 | 2 | 3;
    description: string;
    enabled: boolean;
}

interface AlarmEvent {
    ruleId: number;
    pointId: number;
    value: number;
    timestamp: Date;
}

export class AlarmService extends EventEmitter {
    private static instance: AlarmService;
    private db = DatabaseManager.getInstance();

    private constructor() {
        super();
    }

    public static getInstance(): AlarmService {
        if (!AlarmService.instance) {
            AlarmService.instance = new AlarmService();
        }
        return AlarmService.instance;
    }

    // 检查值是否触发报警
    public async checkValue(pointId: number, value: number): Promise<void> {
        const rules = await this.getEnabledRules(pointId);
        
        for (const rule of rules) {
            if (this.evaluateCondition(value, rule.condition, rule.threshold)) {
                const alarmEvent: AlarmEvent = {
                    ruleId: rule.id,
                    pointId,
                    value,
                    timestamp: new Date()
                };
                
                await this.recordAlarm(alarmEvent);
                this.emit('alarm', alarmEvent);
            }
        }
    }

    // 获取指定点位的启用规则
    private async getEnabledRules(pointId: number): Promise<AlarmRule[]> {
        return this.db.query<AlarmRule>(
            'SELECT * FROM alarm_rules WHERE point_id = ? AND enabled = 1',
            [pointId]
        );
    }

    // 评估报警条件
    private evaluateCondition(value: number, condition: string, threshold: number): boolean {
        switch (condition) {
            case '>': return value > threshold;
            case '<': return value < threshold;
            case '>=': return value >= threshold;
            case '<=': return value <= threshold;
            case '=': return value === threshold;
            case '!=': return value !== threshold;
            default: return false;
        }
    }

    // 记录报警事件
    private async recordAlarm(event: AlarmEvent): Promise<void> {
        await this.db.run(
            `INSERT INTO alarm_history (rule_id, point_id, value, triggered_at)
             VALUES (?, ?, ?, ?)`,
            [event.ruleId, event.pointId, event.value, event.timestamp]
        );
    }

    // 确认报警
    public async acknowledgeAlarm(alarmId: number, acknowledgedBy: string): Promise<void> {
        await this.db.run(
            `UPDATE alarm_history 
             SET acknowledged_at = CURRENT_TIMESTAMP,
                 acknowledged_by = ?
             WHERE id = ? AND acknowledged_at IS NULL`,
            [acknowledgedBy, alarmId]
        );
    }

    // 获取活跃报警
    public async getActiveAlarms(): Promise<any[]> {
        return this.db.query(
            `SELECT h.*, r.description, r.priority, p.name as point_name
             FROM alarm_history h
             JOIN alarm_rules r ON h.rule_id = r.id
             JOIN monitor_points p ON h.point_id = p.id
             WHERE h.acknowledged_at IS NULL
             ORDER BY h.triggered_at DESC`
        );
    }

    // 获取历史报警记录
    public async getAlarmHistory(
        startDate?: Date,
        endDate?: Date,
        pointId?: number,
        priority?: number
    ): Promise<any[]> {
        let sql = `
            SELECT h.*, r.description, r.priority, p.name as point_name
            FROM alarm_history h
            JOIN alarm_rules r ON h.rule_id = r.id
            JOIN monitor_points p ON h.point_id = p.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (startDate) {
            sql += ' AND h.triggered_at >= ?';
            params.push(startDate);
        }

        if (endDate) {
            sql += ' AND h.triggered_at <= ?';
            params.push(endDate);
        }

        if (pointId) {
            sql += ' AND h.point_id = ?';
            params.push(pointId);
        }

        if (priority) {
            sql += ' AND r.priority = ?';
            params.push(priority);
        }

        sql += ' ORDER BY h.triggered_at DESC';

        return this.db.query(sql, params);
    }

    // 添加报警规则
    public async addRule(rule: Omit<AlarmRule, 'id'>): Promise<number> {
        const { lastID } = await this.db.run(
            `INSERT INTO alarm_rules (point_id, condition, threshold, priority, description, enabled)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [rule.point_id, rule.condition, rule.threshold, rule.priority, rule.description, rule.enabled]
        );
        
        if (typeof lastID !== 'number') {
            throw new Error('Failed to get inserted rule ID');
        }
        return lastID;
    }

    // 更新报警规则
    public async updateRule(ruleId: number, updates: Partial<AlarmRule>): Promise<void> {
        const setClauses: string[] = [];
        const params: any[] = [];

        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                setClauses.push(`${key} = ?`);
                params.push(value);
            }
        }

        if (setClauses.length === 0) return;

        params.push(ruleId);
        await this.db.run(
            `UPDATE alarm_rules SET ${setClauses.join(', ')} WHERE id = ?`,
            params
        );
    }

    // 删除报警规则
    public async deleteRule(ruleId: number): Promise<void> {
        await this.db.run('DELETE FROM alarm_rules WHERE id = ?', [ruleId]);
    }
}
