import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PLCService } from './plc-service';
import { PLCTags } from './plc-tags';
import path from 'path';

const app = express();
const httpServer = createServer(app);

// 配置CORS和Socket.IO选项
const io = new Server(httpServer, {
    cors: {
        origin: true,  // 允许所有源
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],  // 允许轮询作为备选
    allowUpgrades: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));
console.log('Static files served from:', path.join(__dirname, '../public'));

// 配置CORS中间件
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// PLC配置
const plcConfig = {
    ip: '192.168.0.1',    // 修改为您的PLC IP地址
    port: 502,            // Modbus TCP默认端口
    simulation: true      // 开发测试时使用模拟模式
};

console.log('Starting server with PLC config:', plcConfig);

// 创建PLC服务实例
const plcService = new PLCService(io, plcConfig);

// 添加PLC变量配置
plcService.addTags(PLCTags);

// WebSocket连接处理
io.on('connection', (socket) => {
    console.log('Client connected');
    
    // 发送当前连接状态和所有值
    socket.emit('plc-connection-status', plcService.getConnectionStatus());
    const values = plcService.getAllValues();
    const initialValues = Object.entries(values).map(([name, value]) => ({ name, value }));
    socket.emit('values-changed', initialValues);

    // 写入请求处理
    socket.on('write-value', async (request: { name: string; value: boolean | number }) => {
        console.log('Write request:', request);
        try {
            const success = await plcService.writeValue(request.name, request.value);
            if (!success) {
                socket.emit('write-error', { 
                    name: request.name, 
                    error: 'Write operation failed' 
                });
            }
        } catch (error) {
            console.error('Write error:', error);
            socket.emit('write-error', { 
                name: request.name, 
                error: error instanceof Error ? error.message : 'Unknown error' 
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// 错误处理中间件
app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('Server error:', err);
    res.status(500).send('Something broke!');
});

// 启动服务器
const port = process.env.PORT || 3000;
httpServer.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log('Socket.IO configuration:', io.engine.opts);
});

// 优雅关闭处理
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server...');
    plcService.dispose();
    httpServer.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
