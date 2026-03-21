import { RoomType, RoomInfo, RoomEventCallback } from './types.js';

export class Room {
  public readonly id: string;
  public readonly name: string;
  public readonly type: RoomType;
  public readonly maxPlayers: number;
  public readonly createdAt: number;
  private _players: Set<string>;
  private eventListeners: Map<string, Set<RoomEventCallback>>;

  constructor(id: string, name: string, type: RoomType, maxPlayers: number = 100) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.maxPlayers = maxPlayers;
    this.createdAt = Date.now();
    this._players = new Set();
    this.eventListeners = new Map();
  }

  get players(): string[] {
    return Array.from(this._players);
  }

  get playerCount(): number {
    return this._players.size;
  }

  get isFull(): boolean {
    return this._players.size >= this.maxPlayers;
  }

  get isEmpty(): boolean {
    return this._players.size === 0;
  }

  addPlayer(playerId: string): boolean {
    if (this.isFull) {
      return false;
    }
    this._players.add(playerId);
    return true;
  }

  removePlayer(playerId: string): boolean {
    return this._players.delete(playerId);
  }

  hasPlayer(playerId: string): boolean {
    return this._players.has(playerId);
  }

  on(event: string, callback: RoomEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: RoomEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in room ${this.id} event listener:`, error);
        }
      });
    }
  }

  toJSON(): RoomInfo {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      players: this.players,
      maxPlayers: this.maxPlayers,
      createdAt: this.createdAt,
    };
  }
}
