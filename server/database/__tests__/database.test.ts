import { DatabaseManager } from '../';
import { DatabaseService } from '../database-service';
import path from 'path';
import fs from 'fs';

describe('Database Tests', () => {
    let dbService: DatabaseService;
    const testDataDir = path.join(__dirname, 'test-data');
    const backupDir = path.join(testDataDir, 'backups');

    beforeAll(async () => {
        // 创建测试目录
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        // 初始化数据库服务
        dbService = DatabaseService.getInstance();
        await dbService.initialize();
    });

    afterAll(async () => {
        await dbService.close();
        // 清理测试数据
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true });
        }
    });

    beforeEach(async () => {
        // 清理数据库
        await dbService.cleanup();
    });

    describe('PLC Configuration', () => {
        it('should add and retrieve PLC config', async () => {
            const testConfig = {
                name: 'Test PLC',
                ip: '192.168.1.100',
                port: 502,
                enabled: true
            };

            await dbService.updatePLCConfig(testConfig);
            const configs = await dbService.getPLCConfigs();

            expect(configs).toHaveLength(1);
            expect(configs[0]).toMatchObject(testConfig);
        });

        it('should validate PLC config', async () => {
            const invalidConfig = {
                name: '',
                ip: 'invalid-ip',
                port: -1,
                enabled: true
            };

            await expect(dbService.updatePLCConfig(invalidConfig)).rejects.toThrow();
        });
    });

    describe('Monitor Points', () => {
        it('should add and retrieve monitor points', async () => {
            const testPoint = {
                name: 'Test Point',
                address: 'D100',
                type: 'AI',
                description: 'Test Description',
                unit: 'mm',
                scale: 1.0
            };

            await dbService.updateTagConfigs([testPoint]);
            const points = await dbService.getTagConfigs();

            expect(points).toHaveLength(1);
            expect(points[0]).toMatchObject(testPoint);
        });
    });

    describe('Backup and Restore', () => {
        it('should backup and restore database', async () => {
            // 添加测试数据
            const testConfig = {
                name: 'Test PLC',
                ip: '192.168.1.100',
                port: 502,
                enabled: true
            };
            await dbService.updatePLCConfig(testConfig);

            // 创建备份
            const backupPath = await dbService.backup(true);
            expect(fs.existsSync(backupPath)).toBe(true);

            // 清理数据
            await dbService.cleanup();
            let configs = await dbService.getPLCConfigs();
            expect(configs).toHaveLength(0);

            // 恢复备份
            await dbService.restore(backupPath);
            configs = await dbService.getPLCConfigs();
            expect(configs).toHaveLength(1);
            expect(configs[0]).toMatchObject(testConfig);
        });
    });

    describe('Data Migration', () => {
        it('should migrate old data format', async () => {
            // 模拟旧数据格式
            const oldData = {
                plc_config: [{
                    id: 1,
                    name: 'Old PLC',
                    ip: '192.168.1.1',
                    port: 502,
                    enabled: 1
                }]
            };

            // 写入旧数据
            const oldDataPath = path.join(testDataDir, 'old-data.json');
            fs.writeFileSync(oldDataPath, JSON.stringify(oldData));

            // 执行迁移
            await DatabaseManager.migrate(oldDataPath);

            // 验证迁移结果
            const configs = await dbService.getPLCConfigs();
            expect(configs).toHaveLength(1);
            expect(configs[0]).toMatchObject({
                name: 'Old PLC',
                ip: '192.168.1.1',
                port: 502,
                enabled: true
            });
        });
    });
});
