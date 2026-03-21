import { Player } from './Player.js';
import { PlayerStatus, MapLocation, PlayerData } from './types.js';
export declare class PlayerManager {
    private players;
    private socketToPlayer;
    constructor();
    registerPlayer(socketId: string, nickname: string): Player;
    unregisterPlayer(playerId: string): boolean;
    getPlayer(playerId: string): Player | undefined;
    getPlayerBySocketId(socketId: string): Player | undefined;
    getOnlinePlayers(): PlayerData[];
    getAllPlayers(): PlayerData[];
    updatePlayerStatus(playerId: string, status: PlayerStatus): boolean;
    updatePlayerLocation(playerId: string, location: MapLocation): boolean;
    updatePlayerSocketId(playerId: string, socketId: string): boolean;
    getPlayerCount(): number;
    getOnlinePlayerCount(): number;
}
//# sourceMappingURL=PlayerManager.d.ts.map