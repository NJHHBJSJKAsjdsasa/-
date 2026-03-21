export type PlayerStatus = 'online' | 'away' | 'offline';

export interface MapLocation {
  x: number;
  y: number;
  mapId: string;
}

export interface PlayerData {
  id: string;
  nickname: string;
  socketId: string;
  status: PlayerStatus;
  lastActive: Date;
  mapLocation: MapLocation;
}

export interface IPlayer {
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
