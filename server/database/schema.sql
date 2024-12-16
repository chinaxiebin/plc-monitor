-- PLC配置表
CREATE TABLE IF NOT EXISTS plc_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    ip TEXT NOT NULL,
    port INTEGER DEFAULT 502,
    enabled BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 更新时间触发器
CREATE TRIGGER IF NOT EXISTS update_plc_config_timestamp 
   AFTER UPDATE ON plc_config
BEGIN
    UPDATE plc_config SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- 监控点位表
CREATE TABLE IF NOT EXISTS monitor_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plc_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('DI', 'DO', 'AI', 'AO', 'REG')),
    description TEXT,
    unit TEXT,
    scale REAL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plc_id) REFERENCES plc_config(id) ON DELETE CASCADE,
    UNIQUE (plc_id, name),
    UNIQUE (plc_id, address, type)
);

-- 更新时间触发器
CREATE TRIGGER IF NOT EXISTS update_monitor_points_timestamp 
   AFTER UPDATE ON monitor_points
BEGIN
    UPDATE monitor_points SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- 报警规则表
CREATE TABLE IF NOT EXISTS alarm_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    point_id INTEGER NOT NULL,
    condition TEXT NOT NULL CHECK(condition IN ('>', '<', '>=', '<=', '=', '!=')),
    threshold REAL NOT NULL,
    priority INTEGER DEFAULT 3 CHECK(priority BETWEEN 1 AND 3),
    description TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (point_id) REFERENCES monitor_points(id) ON DELETE CASCADE
);

-- 更新时间触发器
CREATE TRIGGER IF NOT EXISTS update_alarm_rules_timestamp 
   AFTER UPDATE ON alarm_rules
BEGIN
    UPDATE alarm_rules SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- 报警记录表
CREATE TABLE IF NOT EXISTS alarm_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    point_id INTEGER NOT NULL,
    value REAL NOT NULL,
    triggered_at DATETIME NOT NULL,
    acknowledged_at DATETIME,
    acknowledged_by TEXT,
    note TEXT,
    FOREIGN KEY (rule_id) REFERENCES alarm_rules(id) ON DELETE CASCADE,
    FOREIGN KEY (point_id) REFERENCES monitor_points(id) ON DELETE CASCADE
);

-- 数据记录表
CREATE TABLE IF NOT EXISTS data_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    point_id INTEGER NOT NULL,
    value REAL NOT NULL,
    quality INTEGER DEFAULT 100,
    timestamp DATETIME NOT NULL,
    FOREIGN KEY (point_id) REFERENCES monitor_points(id) ON DELETE CASCADE
);

-- 压缩数据表
CREATE TABLE IF NOT EXISTS data_records_compressed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    point_id INTEGER NOT NULL,
    value REAL NOT NULL,
    quality INTEGER DEFAULT 100,
    timestamp DATETIME NOT NULL,
    FOREIGN KEY (point_id) REFERENCES monitor_points(id) ON DELETE CASCADE
);

-- 系统日志表
CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'error')),
    message TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME NOT NULL
);

-- 系统状态表
CREATE TABLE IF NOT EXISTS system_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    timestamp DATETIME NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_alarm_history_triggered_at ON alarm_history(triggered_at);
CREATE INDEX IF NOT EXISTS idx_alarm_history_point_id ON alarm_history(point_id);
CREATE INDEX IF NOT EXISTS idx_alarm_history_rule_id ON alarm_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_monitor_points_plc_id ON monitor_points(plc_id);
CREATE INDEX IF NOT EXISTS idx_alarm_rules_point_id ON alarm_rules(point_id);
CREATE INDEX IF NOT EXISTS idx_data_records_timestamp ON data_records(timestamp);
CREATE INDEX IF NOT EXISTS idx_data_records_point_id ON data_records(point_id);
CREATE INDEX IF NOT EXISTS idx_data_records_compressed_timestamp ON data_records_compressed(timestamp);
CREATE INDEX IF NOT EXISTS idx_data_records_compressed_point_id ON data_records_compressed(point_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_logs_type ON system_logs(type);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_status_timestamp ON system_status(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_status_type ON system_status(type);

-- 创建视图
CREATE VIEW IF NOT EXISTS v_latest_values AS
SELECT 
    mp.id as point_id,
    mp.name as point_name,
    mp.type,
    mp.unit,
    dr.value,
    dr.quality,
    dr.timestamp
FROM monitor_points mp
LEFT JOIN (
    SELECT point_id, value, quality, timestamp
    FROM data_records
    WHERE (point_id, timestamp) IN (
        SELECT point_id, MAX(timestamp)
        FROM data_records
        GROUP BY point_id
    )
) dr ON mp.id = dr.point_id;

CREATE VIEW IF NOT EXISTS v_alarm_summary AS
SELECT 
    ar.id as rule_id,
    mp.name as point_name,
    ar.condition,
    ar.threshold,
    ar.priority,
    COUNT(ah.id) as trigger_count,
    MAX(ah.triggered_at) as last_triggered,
    SUM(CASE WHEN ah.acknowledged_at IS NULL THEN 1 ELSE 0 END) as unacknowledged_count
FROM alarm_rules ar
JOIN monitor_points mp ON ar.point_id = mp.id
LEFT JOIN alarm_history ah ON ar.id = ah.rule_id
GROUP BY ar.id;

CREATE VIEW IF NOT EXISTS v_system_health AS
SELECT 
    type,
    value,
    unit,
    timestamp,
    LAG(value) OVER (PARTITION BY type ORDER BY timestamp) as prev_value,
    AVG(value) OVER (PARTITION BY type ORDER BY timestamp ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) as moving_avg
FROM system_status
WHERE timestamp >= datetime('now', '-1 hour');
