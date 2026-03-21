import { Player } from './Player.js';
export class PlayerManager {
    players;
    socketToPlayer;
    constructor() {
        this.players = new Map();
        this.socketToPlayer = new Map();
    }
    registerPlayer(socketId, nickname) {
        const existingPlayerId = this.socketToPlayer.get(socketId);
        if (existingPlayerId) {
            const existingPlayer = this.players.get(existingPlayerId);
            if (existingPlayer) {
                existingPlayer.setSocketId(socketId);
                existingPlayer.setStatus('online');
                return existingPlayer;
            }
        }
        const player = new Player(nickname, socketId);
        this.players.set(player.getId(), player);
        this.socketToPlayer.set(socketId, player.getId());
        return player;
    }
    unregisterPlayer(playerId) {
        const player = this.players.get(playerId);
        if (!player) {
            return false;
        }
        this.socketToPlayer.delete(player.getSocketId());
        this.players.delete(playerId);
        return true;
    }
    getPlayer(playerId) {
        return this.players.get(playerId);
    }
    getPlayerBySocketId(socketId) {
        const playerId = this.socketToPlayer.get(socketId);
        if (!playerId) {
            return undefined;
        }
        return this.players.get(playerId);
    }
    getOnlinePlayers() {
        const onlinePlayers = [];
        for (const player of this.players.values()) {
            if (player.getStatus() === 'online') {
                onlinePlayers.push(player.toJSON());
            }
        }
        return onlinePlayers;
    }
    getAllPlayers() {
        const allPlayers = [];
        for (const player of this.players.values()) {
            allPlayers.push(player.toJSON());
        }
        return allPlayers;
    }
    updatePlayerStatus(playerId, status) {
        const player = this.players.get(playerId);
        if (!player) {
            return false;
        }
        player.setStatus(status);
        return true;
    }
    updatePlayerLocation(playerId, location) {
        const player = this.players.get(playerId);
        if (!player) {
            return false;
        }
        player.setMapLocation(location);
        return true;
    }
    updatePlayerSocketId(playerId, socketId) {
        const player = this.players.get(playerId);
        if (!player) {
            return false;
        }
        this.socketToPlayer.delete(player.getSocketId());
        player.setSocketId(socketId);
        this.socketToPlayer.set(socketId, playerId);
        return true;
    }
    getPlayerCount() {
        return this.players.size;
    }
    getOnlinePlayerCount() {
        let count = 0;
        for (const player of this.players.values()) {
            if (player.getStatus() === 'online') {
                count++;
            }
        }
        return count;
    }
}
//# sourceMappingURL=PlayerManager.js.map