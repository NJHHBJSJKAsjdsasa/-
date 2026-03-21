import { RoomType, RoomInfo, RoomEventCallback } from './types.js';
export declare class Room {
    readonly id: string;
    readonly name: string;
    readonly type: RoomType;
    readonly maxPlayers: number;
    readonly createdAt: number;
    private _players;
    private eventListeners;
    constructor(id: string, name: string, type: RoomType, maxPlayers?: number);
    get players(): string[];
    get playerCount(): number;
    get isFull(): boolean;
    get isEmpty(): boolean;
    addPlayer(playerId: string): boolean;
    removePlayer(playerId: string): boolean;
    hasPlayer(playerId: string): boolean;
    on(event: string, callback: RoomEventCallback): void;
    off(event: string, callback: RoomEventCallback): void;
    emit(event: string, data: unknown): void;
    toJSON(): RoomInfo;
}
//# sourceMappingURL=Room.d.ts.map