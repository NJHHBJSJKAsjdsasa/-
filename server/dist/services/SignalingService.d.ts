import { Server } from 'socket.io';
import { ServerMonitor } from '../monitoring/ServerMonitor';
export declare class SignalingService {
    private io;
    private players;
    private rooms;
    private monitor;
    constructor(io: Server);
    getMonitor(): ServerMonitor;
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
}
//# sourceMappingURL=SignalingService.d.ts.map