import { Server } from 'socket.io';
import winston from 'winston';
import { RegisterMessage, HeartbeatMessage, NodeListMessage, SignalNode } from './types.js';
import { SignalNodeManager } from './SignalNodeManager.js';
export declare class SignalingServer {
    private io;
    private logger;
    private players;
    private rooms;
    private nodeManager;
    private nodeId;
    private serverAddress;
    constructor(io: Server, logger?: winston.Logger, serverAddress?: string);
    private getDefaultServerAddress;
    private createDefaultLogger;
    private registerToBootstrap;
    handleRegister(data: RegisterMessage): Promise<{
        success: boolean;
        nodeId?: string;
        nodes?: SignalNode[];
    }>;
    handleHeartbeat(data: HeartbeatMessage): boolean;
    syncNodeList(): Promise<void>;
    handleNodeListSync(data: NodeListMessage): void;
    private setupSocketHandlers;
    private handlePlayerJoin;
    private handleCreateRoom;
    private handleJoinRoom;
    private handleLeaveRoom;
    private handleListRooms;
    private handleSignalOffer;
    private handleSignalAnswer;
    private handleIceCandidate;
    private handleDisconnect;
    private getRoomInfo;
    getPlayerCount(): number;
    getRoomCount(): number;
    getNodeManager(): SignalNodeManager;
    getNodeId(): string;
    dispose(): void;
}
//# sourceMappingURL=SignalingServer.d.ts.map