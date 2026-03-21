import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { SignalNode, SignalNodeStatus } from './types.js';

export class SignalNodeManager {
  private nodes: Map<string, SignalNode> = new Map();
  private logger: winston.Logger;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_CHECK_INTERVAL = 30000;
  private readonly NODE_OFFLINE_THRESHOLD = 5 * 60 * 1000;

  constructor(logger?: winston.Logger) {
    this.logger = logger || this.createDefaultLogger();
    this.startHeartbeatCheck();
  }

  private createDefaultLogger(): winston.Logger {
    return winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/signaling.log' })
      ]
    });
  }

  public async addNode(address: string): Promise<SignalNode | null> {
    const isValid = await this.validateNode(address);
    if (!isValid) {
      this.logger.warn(`节点验证失败: ${address}`);
      return null;
    }

    const existingNode = this.findNodeByAddress(address);
    if (existingNode) {
      existingNode.lastSeen = Date.now();
      existingNode.status = 'online';
      this.logger.info(`节点已更新: ${address}`);
      return existingNode;
    }

    const node: SignalNode = {
      id: uuidv4(),
      address,
      lastSeen: Date.now(),
      status: 'online'
    };

    this.nodes.set(node.id, node);
    this.logger.info(`新节点已注册: ${address} (${node.id})`);
    return node;
  }

  public removeNode(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.delete(nodeId);
      this.logger.info(`节点已移除: ${node.address} (${nodeId})`);
      return true;
    }
    return false;
  }

  public getNodes(status?: SignalNodeStatus): SignalNode[] {
    const nodes = Array.from(this.nodes.values());
    if (status) {
      return nodes.filter(node => node.status === status);
    }
    return nodes;
  }

  public getNodeById(nodeId: string): SignalNode | undefined {
    return this.nodes.get(nodeId);
  }

  public findNodeByAddress(address: string): SignalNode | undefined {
    return Array.from(this.nodes.values()).find(
      node => node.address === address
    );
  }

  public updateHeartbeat(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.lastSeen = Date.now();
      if (node.status !== 'online') {
        node.status = 'online';
        this.logger.info(`节点恢复在线: ${node.address}`);
      }
      return true;
    }
    return false;
  }

  public async validateNode(address: string): Promise<boolean> {
    try {
      const httpUrl = address.replace(/^ws/, 'http');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${httpUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      this.logger.debug(`HTTP探测失败: ${address}`, error);
    }

    try {
      const WebSocketClient = (await import('ws')).default;
      return await new Promise<boolean>((resolve) => {
        const ws = new WebSocketClient(address);
        const timeout = setTimeout(() => {
          ws.terminate();
          resolve(false);
        }, 5000);

        ws.on('open', () => {
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        });

        ws.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });
    } catch (error) {
      this.logger.debug(`WS探测失败: ${address}`, error);
      return false;
    }
  }

  private startHeartbeatCheck(): void {
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, this.HEARTBEAT_CHECK_INTERVAL);

    this.logger.info('心跳检测已启动');
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    let offlineCount = 0;

    for (const node of this.nodes.values()) {
      if (node.status === 'online' && now - node.lastSeen > this.NODE_OFFLINE_THRESHOLD) {
        node.status = 'offline';
        offlineCount++;
        this.logger.warn(`节点离线: ${node.address} (${node.id})`);
      }
    }

    if (offlineCount > 0) {
      this.logger.info(`心跳检测完成，${offlineCount} 个节点标记为离线`);
    }
  }

  public stopHeartbeatCheck(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.logger.info('心跳检测已停止');
    }
  }

  public dispose(): void {
    this.stopHeartbeatCheck();
    this.nodes.clear();
  }
}
