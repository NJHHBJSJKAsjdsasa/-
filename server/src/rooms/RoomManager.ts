import { Room } from './Room.js';
import { RoomType, RoomInfo, CreateRoomOptions } from './types.js';

export class RoomManager {
  private rooms: Map<string, Room>;
  private playerRoomMap: Map<string, string>;
  private static instance: RoomManager | null = null;

  constructor() {
    this.rooms = new Map();
    this.playerRoomMap = new Map();
    this.initDefaultRooms();
  }

  static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager();
    }
    return RoomManager.instance;
  }

  static destroyInstance(): void {
    RoomManager.instance = null;
  }

  private initDefaultRooms(): void {
    const defaultMaps = [
      { name: '新手村', maxPlayers: 200 },
      { name: '青云山脉', maxPlayers: 150 },
      { name: '万妖森林', maxPlayers: 150 },
    ];

    defaultMaps.forEach(map => {
      this.createRoom({
        name: map.name,
        type: 'map',
        maxPlayers: map.maxPlayers,
      });
    });
  }

  private generateRoomId(): string {
    return `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  createRoom(options: CreateRoomOptions): Room {
    const id = this.generateRoomId();
    const room = new Room(
      id,
      options.name,
      options.type,
      options.maxPlayers || 100
    );
    this.rooms.set(id, room);
    console.log(`Room created: ${options.name} (${id})`);
    return room;
  }

  deleteRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    room.players.forEach(playerId => {
      this.playerRoomMap.delete(playerId);
    });

    this.rooms.delete(roomId);
    console.log(`Room deleted: ${room.name} (${roomId})`);
    return true;
  }

  joinRoom(playerId: string, roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.error(`Room not found: ${roomId}`);
      return false;
    }

    const currentRoomId = this.playerRoomMap.get(playerId);
    if (currentRoomId) {
      if (currentRoomId === roomId) {
        console.log(`Player ${playerId} is already in room ${roomId}`);
        return true;
      }
      this.leaveRoom(playerId, currentRoomId);
    }

    const success = room.addPlayer(playerId);
    if (success) {
      this.playerRoomMap.set(playerId, roomId);
      console.log(`Player ${playerId} joined room ${room.name} (${roomId})`);
      room.emit('playerJoined', { playerId, roomId });
    } else {
      console.error(`Room ${roomId} is full`);
    }
    return success;
  }

  leaveRoom(playerId: string, roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    const success = room.removePlayer(playerId);
    if (success) {
      this.playerRoomMap.delete(playerId);
      console.log(`Player ${playerId} left room ${room.name} (${roomId})`);
      room.emit('playerLeft', { playerId, roomId });

      if (room.isEmpty && room.type === 'zone') {
        this.deleteRoom(roomId);
      }
    }
    return success;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomInfo(roomId: string): RoomInfo | undefined {
    const room = this.rooms.get(roomId);
    return room?.toJSON();
  }

  getRoomsByType(type: RoomType): Room[] {
    return Array.from(this.rooms.values()).filter(room => room.type === type);
  }

  getRoomsInfoByType(type: RoomType): RoomInfo[] {
    return this.getRoomsByType(type).map(room => room.toJSON());
  }

  getPlayerRoom(playerId: string): Room | undefined {
    const roomId = this.playerRoomMap.get(playerId);
    if (roomId) {
      return this.rooms.get(roomId);
    }
    return undefined;
  }

  getPlayerRoomInfo(playerId: string): RoomInfo | undefined {
    return this.getPlayerRoom(playerId)?.toJSON();
  }

  getPlayerRoomId(playerId: string): string | undefined {
    return this.playerRoomMap.get(playerId);
  }

  broadcastToRoom(
    roomId: string,
    event: string,
    data: unknown,
    excludePlayerId?: string
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.error(`Cannot broadcast: Room ${roomId} not found`);
      return false;
    }

    const targetPlayers = excludePlayerId
      ? room.players.filter(id => id !== excludePlayerId)
      : room.players;

    room.emit(event, {
      data,
      targetPlayers,
      timestamp: Date.now(),
    });

    return true;
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  getAllRoomsInfo(): RoomInfo[] {
    return this.getAllRooms().map(room => room.toJSON());
  }

  getPlayerCount(): number {
    return this.playerRoomMap.size;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  autoJoinMapRoom(playerId: string, mapName: string): boolean {
    const mapRoom = Array.from(this.rooms.values()).find(
      room => room.type === 'map' && room.name === mapName
    );

    if (mapRoom) {
      return this.joinRoom(playerId, mapRoom.id);
    }

    console.error(`Map room not found: ${mapName}`);
    return false;
  }

  onPlayerDisconnect(playerId: string): void {
    const roomId = this.playerRoomMap.get(playerId);
    if (roomId) {
      this.leaveRoom(playerId, roomId);
    }
  }
}
