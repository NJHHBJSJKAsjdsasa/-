import { Server } from 'socket.io';
import { logger } from '../utils/logger.js';

export interface ServerStats {
  onlinePlayers: number;
  roomCount: number;
  websocketConnections: number;
  timestamp: Date;
}

export class ServerMonitor {
  private io: Server;
  private statsInterval: NodeJS.Timeout | null = null;
  private readonly STATS_INTERVAL_MS = 30000;

  constructor(io: Server) {
    this.io = io;
  }

  public start(): void {
    if (this.statsInterval) {
      return;
    }

    logger.info('服务器监控器已启动');
    
    this.statsInterval = setInterval(() => {
      this.logStats();
    }, this.STATS_INTERVAL_MS);

    this.logStats();
  }

  public stop(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
      logger.info('服务器监控器已停止');
    }
  }

  public getStats(): ServerStats {
    return {
      onlinePlayers: this.getOnlinePlayerCount(),
      roomCount: this.getRoomCount(),
      websocketConnections: this.getWebsocketConnectionCount(),
      timestamp: new Date(),
    };
  }

  private getOnlinePlayerCount(): number {
    return this.io.engine.clientsCount;
  }

  private getRoomCount(): number {
    const rooms = this.io.sockets.adapter.rooms;
    let roomCount = 0;
    
    for (const [roomId, sockets] of rooms) {
      if (!sockets.has(roomId)) {
        roomCount++;
      }
    }
    
    return roomCount;
  }

  private getWebsocketConnectionCount(): number {
    return this.io.engine.clientsCount;
  }

  private logStats(): void {
    const stats = this.getStats();
    logger.info(
      `服务器统计 - 在线玩家: ${stats.onlinePlayers}, 房间数: ${stats.roomCount}, WebSocket连接: ${stats.websocketConnections}`
    );
  }
}

export default ServerMonitor;
