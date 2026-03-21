import { Player } from './Player.js';
import { PlayerStatus, MapLocation, PlayerData } from './types.js';

export class PlayerManager {
  private players: Map<string, Player>;
  private socketToPlayer: Map<string, string>;

  constructor() {
    this.players = new Map();
    this.socketToPlayer = new Map();
  }

  registerPlayer(socketId: string, nickname: string): Player {
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

  unregisterPlayer(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) {
      return false;
    }

    this.socketToPlayer.delete(player.getSocketId());
    this.players.delete(playerId);

    return true;
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  getPlayerBySocketId(socketId: string): Player | undefined {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) {
      return undefined;
    }
    return this.players.get(playerId);
  }

  getOnlinePlayers(): PlayerData[] {
    const onlinePlayers: PlayerData[] = [];

    for (const player of this.players.values()) {
      if (player.getStatus() === 'online') {
        onlinePlayers.push(player.toJSON());
      }
    }

    return onlinePlayers;
  }

  getAllPlayers(): PlayerData[] {
    const allPlayers: PlayerData[] = [];

    for (const player of this.players.values()) {
      allPlayers.push(player.toJSON());
    }

    return allPlayers;
  }

  updatePlayerStatus(playerId: string, status: PlayerStatus): boolean {
    const player = this.players.get(playerId);
    if (!player) {
      return false;
    }

    player.setStatus(status);
    return true;
  }

  updatePlayerLocation(playerId: string, location: MapLocation): boolean {
    const player = this.players.get(playerId);
    if (!player) {
      return false;
    }

    player.setMapLocation(location);
    return true;
  }

  updatePlayerSocketId(playerId: string, socketId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) {
      return false;
    }

    this.socketToPlayer.delete(player.getSocketId());
    player.setSocketId(socketId);
    this.socketToPlayer.set(socketId, playerId);

    return true;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  getOnlinePlayerCount(): number {
    let count = 0;
    for (const player of this.players.values()) {
      if (player.getStatus() === 'online') {
        count++;
      }
    }
    return count;
  }
}
