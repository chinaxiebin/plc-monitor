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

# PLC Monitor

一个基于 Node.js 和 TypeScript 的 PLC 监控系统，支持 Modbus TCP 通信协议。

## 功能特点

- 实时监控 PLC 数据
- Web 界面实时显示
- 支持 Modbus TCP 通信
- 跨平台支持 (Windows/Linux)
- WebSocket 实时数据更新

## 技术栈

- **后端**：
  - Node.js
  - Express
  - TypeScript
  - Socket.IO
  - Modbus-serial

- **前端**：
  - HTML5
  - JavaScript
  - Socket.IO Client

## 系统要求

- Node.js >= 14.0.0
- npm >= 6.0.0

## 安装和使用

### 方式一：开发者安装（推荐）

1. 克隆仓库：
```bash
git clone [repository-url]
cd plc-monitor
```

2. 安装依赖：
```bash
npm install
```

3. 运行项目：
- 开发模式（支持热重载）：
  ```bash
  npm run server:dev
  ```
- 生产模式：
  - Windows：双击运行 `start.bat`
  - Linux：`npm run server:start`

### 方式二：发布版本安装

1. 从 [Releases](https://github.com/[username]/plc-monitor/releases) 页面下载最新版本
   - Windows 用户下载：`plc-monitor.zip`
   - Linux 用户下载：`plc-monitor.tar.gz`

2. 解压下载的文件

3. 安装依赖：
```bash
npm install
```

4. 运行项目：
- Windows：双击运行 `start.bat`
- Linux：`npm run server:start`

## 项目结构

```
plc-monitor/
├── public/          # 静态资源文件
├── server/          # 服务器端代码
│   └── index.ts     # 服务器入口文件
├── src/             # 前端源代码
├── dist/            # 构建输出目录
└── package.json     # 项目配置文件
```

## 配置

### 环境变量

- `PORT`: 服务器端口号（默认：3000）
- `NODE_ENV`: 运行环境（development/production）

### PLC 配置

在 `server/index.ts` 中配置 PLC 连接参数：
```typescript
const plcConfig = {
    ip: "127.0.0.1",  // PLC IP地址
    port: 502,        // Modbus TCP 端口
    simulation: true  // 是否启用模拟模式
};
```

## 开发说明

1. 开发模式支持热重载
2. 生产环境自动优化构建
3. 支持 TypeScript 类型检查
4. 包含完整的错误处理和日志记录

## 跨平台支持

项目支持在 Windows 和 Linux 环境下运行：
- 自动检测运行平台
- 自适应文件路径处理
- 平台特定的文件操作命令

## 发布新版本

1. 构建发布包：
- Windows：
  ```bash
  npm run package
  ```
- Linux：
  ```bash
  npm run package:linux
  ```

2. 发布包内容：
- 编译后的代码（dist 目录）
- 启动脚本（start.bat/start.sh）
- 配置文件（package.json）
- 说明文档（README.md）

## 故障排除

如果遇到问题：
1. 检查 PLC 连接配置
2. 确认服务器端口是否被占用
3. 查看控制台错误日志
4. 确保已安装所有依赖

### 常见问题

1. 无法启动服务器
   - 检查端口 3000 是否被占用
   - 确认 Node.js 版本是否符合要求

2. PLC 连接失败
   - 验证 PLC IP 地址和端口配置
   - 检查网络连接
   - 确认 PLC 是否支持 Modbus TCP

3. 页面无法加载
   - 确认服务器是否正常运行
   - 检查浏览器控制台错误信息
   - 清除浏览器缓存

## 许可证

ISC
