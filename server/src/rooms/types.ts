export type RoomType = 'map' | 'zone';

export interface RoomInfo {
  id: string;
  name: string;
  type: RoomType;
  players: string[];
  maxPlayers: number;
  createdAt: number;
}

export interface CreateRoomOptions {
  name: string;
  type: RoomType;
  maxPlayers?: number;
}

export interface BroadcastOptions {
  excludePlayerId?: string;
}

export type RoomEventCallback = (data: unknown) => void;
