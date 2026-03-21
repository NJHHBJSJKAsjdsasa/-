import { logger } from '../utils/logger.js';
export class ServerMonitor {
    io;
    statsInterval = null;
    STATS_INTERVAL_MS = 30000;
    constructor(io) {
        this.io = io;
    }
    start() {
        if (this.statsInterval) {
            return;
        }
        logger.info('服务器监控器已启动');
        this.statsInterval = setInterval(() => {
            this.logStats();
        }, this.STATS_INTERVAL_MS);
        this.logStats();
    }
    stop() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
            logger.info('服务器监控器已停止');
        }
    }
    getStats() {
        return {
            onlinePlayers: this.getOnlinePlayerCount(),
            roomCount: this.getRoomCount(),
            websocketConnections: this.getWebsocketConnectionCount(),
            timestamp: new Date(),
        };
    }
    getOnlinePlayerCount() {
        return this.io.engine.clientsCount;
    }
    getRoomCount() {
        const rooms = this.io.sockets.adapter.rooms;
        let roomCount = 0;
        for (const [roomId, sockets] of rooms) {
            if (!sockets.has(roomId)) {
                roomCount++;
            }
        }
        return roomCount;
    }
    getWebsocketConnectionCount() {
        return this.io.engine.clientsCount;
    }
    logStats() {
        const stats = this.getStats();
        logger.info(`服务器统计 - 在线玩家: ${stats.onlinePlayers}, 房间数: ${stats.roomCount}, WebSocket连接: ${stats.websocketConnections}`);
    }
}
export default ServerMonitor;
//# sourceMappingURL=ServerMonitor.js.map