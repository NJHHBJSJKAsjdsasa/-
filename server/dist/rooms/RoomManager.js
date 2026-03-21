import { Room } from './Room.js';
export class RoomManager {
    rooms;
    playerRoomMap;
    static instance = null;
    constructor() {
        this.rooms = new Map();
        this.playerRoomMap = new Map();
        this.initDefaultRooms();
    }
    static getInstance() {
        if (!RoomManager.instance) {
            RoomManager.instance = new RoomManager();
        }
        return RoomManager.instance;
    }
    static destroyInstance() {
        RoomManager.instance = null;
    }
    initDefaultRooms() {
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
    generateRoomId() {
        return `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    createRoom(options) {
        const id = this.generateRoomId();
        const room = new Room(id, options.name, options.type, options.maxPlayers || 100);
        this.rooms.set(id, room);
        console.log(`Room created: ${options.name} (${id})`);
        return room;
    }
    deleteRoom(roomId) {
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
    joinRoom(playerId, roomId) {
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
        }
        else {
            console.error(`Room ${roomId} is full`);
        }
        return success;
    }
    leaveRoom(playerId, roomId) {
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
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    getRoomInfo(roomId) {
        const room = this.rooms.get(roomId);
        return room?.toJSON();
    }
    getRoomsByType(type) {
        return Array.from(this.rooms.values()).filter(room => room.type === type);
    }
    getRoomsInfoByType(type) {
        return this.getRoomsByType(type).map(room => room.toJSON());
    }
    getPlayerRoom(playerId) {
        const roomId = this.playerRoomMap.get(playerId);
        if (roomId) {
            return this.rooms.get(roomId);
        }
        return undefined;
    }
    getPlayerRoomInfo(playerId) {
        return this.getPlayerRoom(playerId)?.toJSON();
    }
    getPlayerRoomId(playerId) {
        return this.playerRoomMap.get(playerId);
    }
    broadcastToRoom(roomId, event, data, excludePlayerId) {
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
    getAllRooms() {
        return Array.from(this.rooms.values());
    }
    getAllRoomsInfo() {
        return this.getAllRooms().map(room => room.toJSON());
    }
    getPlayerCount() {
        return this.playerRoomMap.size;
    }
    getRoomCount() {
        return this.rooms.size;
    }
    autoJoinMapRoom(playerId, mapName) {
        const mapRoom = Array.from(this.rooms.values()).find(room => room.type === 'map' && room.name === mapName);
        if (mapRoom) {
            return this.joinRoom(playerId, mapRoom.id);
        }
        console.error(`Map room not found: ${mapName}`);
        return false;
    }
    onPlayerDisconnect(playerId) {
        const roomId = this.playerRoomMap.get(playerId);
        if (roomId) {
            this.leaveRoom(playerId, roomId);
        }
    }
}
//# sourceMappingURL=RoomManager.js.map