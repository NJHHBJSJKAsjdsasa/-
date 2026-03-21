import { Room } from './Room.js';
import { RoomType, RoomInfo, CreateRoomOptions } from './types.js';
export declare class RoomManager {
    private rooms;
    private playerRoomMap;
    private static instance;
    constructor();
    static getInstance(): RoomManager;
    static destroyInstance(): void;
    private initDefaultRooms;
    private generateRoomId;
    createRoom(options: CreateRoomOptions): Room;
    deleteRoom(roomId: string): boolean;
    joinRoom(playerId: string, roomId: string): boolean;
    leaveRoom(playerId: string, roomId: string): boolean;
    getRoom(roomId: string): Room | undefined;
    getRoomInfo(roomId: string): RoomInfo | undefined;
    getRoomsByType(type: RoomType): Room[];
    getRoomsInfoByType(type: RoomType): RoomInfo[];
    getPlayerRoom(playerId: string): Room | undefined;
    getPlayerRoomInfo(playerId: string): RoomInfo | undefined;
    getPlayerRoomId(playerId: string): string | undefined;
    broadcastToRoom(roomId: string, event: string, data: unknown, excludePlayerId?: string): boolean;
    getAllRooms(): Room[];
    getAllRoomsInfo(): RoomInfo[];
    getPlayerCount(): number;
    getRoomCount(): number;
    autoJoinMapRoom(playerId: string, mapName: string): boolean;
    onPlayerDisconnect(playerId: string): void;
}
//# sourceMappingURL=RoomManager.d.ts.map