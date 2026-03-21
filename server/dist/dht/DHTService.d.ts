import { Server as HttpServer } from 'http';
import winston from 'winston';
export declare enum DHT_MESSAGE_TYPES {
    PING = "ping",
    PONG = "pong",
    FIND_NODE = "find_node",
    FOUND_NODE = "found_node",
    GET_PEERS = "get_peers",
    GOT_PEERS = "got_peers",
    ANNOUNCE_PEER = "announce_peer",
    ANNOUNCED = "announced",
    ANNOUNCE_PLAYER = "announce_player",
    PLAYER_ANNOUNCED = "player_announced",
    GET_PLAYER = "get_player",
    PLAYER_INFO = "player_info",
    GET_ROUTING_TABLE = "get_routing_table",
    ROUTING_TABLE = "routing_table",
    ERROR = "error",
    WELCOME = "welcome"
}
export interface DHTMessage {
    type: DHT_MESSAGE_TYPES | string;
    requestId?: string;
    senderId?: string;
    [key: string]: any;
}
export interface DHTServiceConfig {
    dhtPort?: number;
    wsPath?: string;
    bootstrap?: boolean;
    bootstrapNodes?: string[];
}
/**
 * DHT 服务类
 * 整合 BitTorrent DHT 和 WebSocket 服务
 */
export declare class DHTService {
    private dht;
    private wss?;
    private logger;
    private config;
    private clients;
    private peerStore;
    private ownAnnouncements;
    private stats;
    constructor(logger: winston.Logger, config?: DHTServiceConfig);
    /**
     * 初始化 DHT 模块
     */
    private initDHT;
    /**
     * 设置 DHT 事件处理器
     */
    private setupDHTEventHandlers;
    /**
     * 启动定期任务
     */
    private startPeriodicTasks;
    /**
     * 重新发布 announcements
     */
    private republishAnnouncements;
    /**
     * 清理过期的 peers
     */
    private cleanupExpiredPeers;
    /**
     * 向 DHT 宣布 peer
     */
    private announcePeerToDHT;
    /**
     * 启动 DHT 服务
     */
    start(): Promise<void>;
    /**
     * 附加 WebSocket 服务器到现有的 HTTP 服务器
     */
    attachToHttpServer(httpServer: HttpServer): void;
    /**
     * 处理 WebSocket 消息
     */
    private handleMessage;
    /**
     * 处理 ping
     */
    private handlePing;
    /**
     * 处理 find_node
     */
    private handleFindNode;
    /**
     * 处理 get_peers
     */
    private handleGetPeers;
    /**
     * 处理 announce_peer
     */
    private handleAnnouncePeer;
    /**
     * 处理 get_routing_table
     */
    private handleGetRoutingTable;
    private playerStore;
    /**
     * 处理 announce_player
     */
    private handleAnnouncePlayer;
    /**
     * 处理 get_player
     */
    private handleGetPlayer;
    /**
     * 发送消息
     */
    private sendMessage;
    /**
     * 发送错误
     */
    private sendError;
    /**
     * 生成客户端 ID
     */
    private generateClientId;
    /**
     * 获取 DHT 状态
     */
    getStatus(): object;
    /**
     * 销毁服务
     */
    destroy(): void;
}
//# sourceMappingURL=DHTService.d.ts.map