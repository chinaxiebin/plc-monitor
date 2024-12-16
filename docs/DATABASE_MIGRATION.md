# 数据库迁移指南

## 概述

本文档描述了从旧版本数据库迁移到新版本的过程。新版本使用基于 JSON 的 LowDB 替代了原有的 SQLite 数据库，提供了更好的可移植性和更简单的部署方式。

## 迁移步骤

1. **备份数据**
   ```typescript
   const backupPath = await DatabaseService.getInstance().backup(true);
   ```
   - 备份文件会保存在 `backups` 目录下
   - 文件名格式：`backup-YYYY-MM-DD-HH-mm-ss.json.gz`
   - 默认使用 GZIP 压缩以节省空间

2. **执行迁移**
   ```typescript
   await DatabaseManager.migrate();
   ```
   - 自动检测并迁移旧数据
   - 保持原有数据结构
   - 自动修复无效数据

3. **验证迁移**
   ```typescript
   const dbService = DatabaseService.getInstance();
   const plcs = await dbService.getPLCConfigs();
   const points = await dbService.getTagConfigs();
   const alarms = await dbService.getAlarmConfigs();
   ```

## 数据结构变更

### PLC 配置
```typescript
// 旧结构
interface OldPLCConfig {
    id: number;
    name: string;
    ip: string;
    port: number;
    enabled: number; // 0 或 1
}

// 新结构
interface PLCConfig {
    id: string;      // UUID
    name: string;
    ip: string;
    port: number;
    enabled: boolean;
}
```

### 监控点位
```typescript
// 旧结构
interface OldMonitorPoint {
    id: number;
    plc_id: number;
    name: string;
    address: string;
    type: string;
    description: string;
    unit: string;
    scale: number;
}

// 新结构
interface MonitorPoint {
    id: string;      // UUID
    plcId: string;   // 关联的 PLC UUID
    name: string;
    address: string;
    type: string;
    description: string;
    unit: string;
    scale: number;
}
```

### 报警配置
```typescript
// 旧结构
interface OldAlarmConfig {
    id: number;
    point_id: number;
    condition: string;
    threshold: number;
    priority: number;
    description: string;
}

// 新结构
interface AlarmConfig {
    id: string;       // UUID
    pointId: string;  // 关联的监控点 UUID
    condition: string;
    threshold: number;
    priority: number;
    description: string;
}
```

## 故障排除

1. **迁移失败**
   - 检查旧数据库文件是否完整
   - 验证数据格式是否正确
   - 查看日志文件了解详细错误信息

2. **数据验证错误**
   - 检查数据格式是否符合新的验证规则
   - 使用修复工具修复无效数据
   ```typescript
   await DatabaseManager.repair();
   ```

3. **性能问题**
   - 对大型数据库进行分批迁移
   - 使用压缩功能减少磁盘使用
   - 优化索引和查询性能

## 最佳实践

1. **迁移前准备**
   - 备份所有数据
   - 验证备份的完整性
   - 准备足够的磁盘空间

2. **迁移过程**
   - 停止所有数据库操作
   - 执行迁移
   - 验证迁移结果

3. **迁移后**
   - 更新应用程序代码
   - 测试所有功能
   - 保留旧数据备份

## 注意事项

1. 迁移过程不可逆，请确保备份
2. 所有 ID 都会更新为 UUID
3. 需要更新相关的应用程序代码
4. 建议在测试环境中先进行迁移测试
