import { PlayerStatus, MapLocation, PlayerData, IPlayer } from './types.js';
export declare class Player implements IPlayer {
    private id;
    private nickname;
    private socketId;
    private status;
    private lastActive;
    private mapLocation;
    constructor(nickname: string, socketId: string);
    getId(): string;
    getNickname(): string;
    getSocketId(): string;
    getStatus(): PlayerStatus;
    getLastActive(): Date;
    getMapLocation(): MapLocation;
    setSocketId(socketId: string): void;
    setStatus(status: PlayerStatus): void;
    setMapLocation(location: MapLocation): void;
    updateLastActive(): void;
    toJSON(): PlayerData;
}
//# sourceMappingURL=Player.d.ts.map