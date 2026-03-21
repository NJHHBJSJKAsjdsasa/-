import { v4 as uuidv4 } from 'uuid';
import { PlayerStatus, MapLocation, PlayerData, IPlayer } from './types.js';

export class Player implements IPlayer {
  private id: string;
  private nickname: string;
  private socketId: string;
  private status: PlayerStatus;
  private lastActive: Date;
  private mapLocation: MapLocation;

  constructor(nickname: string, socketId: string) {
    this.id = uuidv4();
    this.nickname = nickname;
    this.socketId = socketId;
    this.status = 'online';
    this.lastActive = new Date();
    this.mapLocation = {
      x: 0,
      y: 0,
      mapId: 'default'
    };
  }

  getId(): string {
    return this.id;
  }

  getNickname(): string {
    return this.nickname;
  }

  getSocketId(): string {
    return this.socketId;
  }

  getStatus(): PlayerStatus {
    return this.status;
  }

  getLastActive(): Date {
    return this.lastActive;
  }

  getMapLocation(): MapLocation {
    return this.mapLocation;
  }

  setSocketId(socketId: string): void {
    this.socketId = socketId;
    this.updateLastActive();
  }

  setStatus(status: PlayerStatus): void {
    this.status = status;
    this.updateLastActive();
  }

  setMapLocation(location: MapLocation): void {
    this.mapLocation = location;
    this.updateLastActive();
  }

  updateLastActive(): void {
    this.lastActive = new Date();
  }

  toJSON(): PlayerData {
    return {
      id: this.id,
      nickname: this.nickname,
      socketId: this.socketId,
      status: this.status,
      lastActive: this.lastActive,
      mapLocation: this.mapLocation
    };
  }
}
