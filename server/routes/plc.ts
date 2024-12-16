import express from 'express';
import { PLCService } from '../plc-service';
import { DatabaseManager } from '../database';

const router = express.Router();
const db = DatabaseManager.getInstance();

// 获取模拟量输出配置
router.get('/config/analogOutputs', async (req, res) => {
    try {
        const config = await db.query(`
            SELECT * FROM monitor_points 
            WHERE type = 'AO'
            ORDER BY address
        `);
        res.json(config);
    } catch (error) {
        console.error('Failed to get analog output config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 获取数据寄存器配置
router.get('/config/registers', async (req, res) => {
    try {
        const config = await db.query(`
            SELECT * FROM monitor_points 
            WHERE type = 'REG'
            ORDER BY address
        `);
        res.json(config);
    } catch (error) {
        console.error('Failed to get register config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 写入模拟量输出
router.post('/analogOutput', async (req, res) => {
    const { address, value } = req.body;
    
    if (!address || value === undefined) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        const plcService = PLCService.getInstance();
        await plcService.writeAnalogOutput(address, value);
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to write analog output:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 写入数字量输出
router.post('/digitalOutput', async (req, res) => {
    const { address, value } = req.body;
    
    if (!address || value === undefined) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        const plcService = PLCService.getInstance();
        await plcService.writeDigitalOutput(address, value);
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to write digital output:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 写入数据寄存器
router.post('/register', async (req, res) => {
    const { address, value } = req.body;
    
    if (!address || value === undefined) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        const plcService = PLCService.getInstance();
        await plcService.writeRegister(address, value);
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to write register:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
