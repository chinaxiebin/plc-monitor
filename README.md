# PLC 监控系统

这是一个基于 Node.js 和 Socket.IO 的 PLC 监控系统。

## 系统要求

- Node.js >= 16.x
- npm >= 8.x

## 安装步骤

1. 解压项目文件
2. 进入项目目录
```bash
cd plc-monitor
```

3. 安装依赖
```bash
npm install
```

4. 启动开发服务器
```bash
npm run server:dev
```

5. 启动生产服务器
```bash
npm run build
npm run start
```

## 项目结构

- `/public`: 静态文件目录
  - `index.html`: 主页面
- `/server`: 服务器端代码
  - `index.ts`: 服务器入口
  - `plc-service.ts`: PLC 服务实现
  - `plc-tags.ts`: PLC 变量配置
  - `types.ts`: 类型定义
- `/src`: 源代码目录

## 配置说明

在 `server/plc-tags.ts` 中配置 PLC 变量：
- X: 输入点
- Y: 输出点
- D: 数据区

## 开发模式

默认启用模拟模式，可以在 `server/index.ts` 中修改配置：
```typescript
const plcConfig = {
    ip: '192.168.0.1',    // PLC IP 地址
    port: 502,            // Modbus TCP 端口
    simulation: true      // 模拟模式开关
};
```
