import express from 'express';
import cors from 'cors';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { app } from 'electron';
import path from 'path';
import getPort from 'get-port';

export class WebServer {
  private static instance: WebServer;
  private app: express.Application;
  private server: Server | null = null;
  private port: number = 0;

  private constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  public static getInstance(): WebServer {
    if (!WebServer.instance) {
      WebServer.instance = new WebServer();
    }
    return WebServer.instance;
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(app.getAppPath(), 'dist')));
  }

  private setupRoutes() {
    // API路由
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // 所有其他路由返回index.html
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(app.getAppPath(), 'dist', 'index.html'));
    });
  }

  public async start(): Promise<number> {
    if (this.server) {
      return this.port;
    }

    // 获取可用端口
    this.port = await getPort({ port: getPort.makeRange(3000, 3100) });

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        const address = this.server?.address() as AddressInfo;
        console.log(`Web服务器启动在端口: ${address.port}`);
        resolve(address.port);
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          this.server = null;
          this.port = 0;
          resolve();
        }
      });
    });
  }

  public getPort(): number {
    return this.port;
  }
}
