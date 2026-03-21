import { Server } from 'socket.io';
export interface ServerStats {
    onlinePlayers: number;
    roomCount: number;
    websocketConnections: number;
    timestamp: Date;
}
export declare class ServerMonitor {
    private io;
    private statsInterval;
    private readonly STATS_INTERVAL_MS;
    constructor(io: Server);
    start(): void;
    stop(): void;
    getStats(): ServerStats;
    private getOnlinePlayerCount;
    private getRoomCount;
    private getWebsocketConnectionCount;
    private logStats;
}
export default ServerMonitor;
//# sourceMappingURL=ServerMonitor.d.ts.map