"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalingService = void 0;
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
const ServerMonitor_1 = require("../monitoring/ServerMonitor");
class SignalingService {
    constructor(io) {
        this.players = new Map();
        this.rooms = new Map();
        this.io = io;
        this.monitor = new ServerMonitor_1.ServerMonitor(io);
        this.setupSocketHandlers();
        this.monitor.start();
        logger_1.logger.info('SignalingService 初始化完成');
    }
    getMonitor() {
        return this.monitor;
    }
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            logger_1.logger.info(`玩家连接: ${socket.id}`);
            socket.on('player:join', (data) => {
                this.handlePlayerJoin(socket, data);
            });
            socket.on('room:create', (data) => {
                this.handleCreateRoom(socket, data);
            });
            socket.on('room:join', (data) => {
                this.handleJoinRoom(socket, data);
            });
            socket.on('room:leave', () => {
                this.handleLeaveRoom(socket);
            });
            socket.on('room:list', () => {
                this.handleListRooms(socket);
            });
            socket.on('signal:offer', (data) => {
                this.handleSignalOffer(socket, data);
            });
            socket.on('signal:answer', (data) => {
                this.handleSignalAnswer(socket, data);
            });
            socket.on('signal:ice-candidate', (data) => {
                this.handleIceCandidate(socket, data);
            });
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });
        });
    }
    handlePlayerJoin(socket, data) {
        const player = {
            id: (0, uuid_1.v4)(),
            socketId: socket.id,
            name: data.name
        };
        this.players.set(socket.id, player);
        socket.emit('player:joined', { player });
        logger_1.logger.info(`玩家加入: ${data.name} (${player.id})`);
    }
    handleCreateRoom(socket, data) {
        const player = this.players.get(socket.id);
        if (!player) {
            socket.emit('error', { message: '玩家未登录' });
            logger_1.logger.warn(`创建房间失败: 玩家未登录 (${socket.id})`);
            return;
        }
        const roomId = (0, uuid_1.v4)();
        const room = {
            id: roomId,
            name: data.name,
            players: new Map(),
            maxPlayers: data.maxPlayers || 4,
            createdAt: new Date()
        };
        room.players.set(socket.id, player);
        player.roomId = roomId;
        this.rooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('room:created', { room: this.getRoomInfo(room) });
        logger_1.logger.info(`房间创建: ${data.name} (${roomId})`);
    }
    handleJoinRoom(socket, data) {
        const player = this.players.get(socket.id);
        if (!player) {
            socket.emit('error', { message: '玩家未登录' });
            logger_1.logger.warn(`加入房间失败: 玩家未登录 (${socket.id})`);
            return;
        }
        const room = this.rooms.get(data.roomId);
        if (!room) {
            socket.emit('error', { message: '房间不存在' });
            logger_1.logger.warn(`加入房间失败: 房间不存在 (${data.roomId})`);
            return;
        }
        if (room.players.size >= room.maxPlayers) {
            socket.emit('error', { message: '房间已满' });
            logger_1.logger.warn(`加入房间失败: 房间已满 (${data.roomId})`);
            return;
        }
        room.players.set(socket.id, player);
        player.roomId = data.roomId;
        socket.join(data.roomId);
        socket.to(data.roomId).emit('player:joined-room', { player });
        socket.emit('room:joined', { room: this.getRoomInfo(room) });
        logger_1.logger.info(`玩家 ${player.name} 加入房间 ${room.name}`);
    }
    handleLeaveRoom(socket) {
        const player = this.players.get(socket.id);
        if (!player || !player.roomId)
            return;
        const room = this.rooms.get(player.roomId);
        if (room) {
            room.players.delete(socket.id);
            socket.to(player.roomId).emit('player:left-room', { playerId: player.id });
            if (room.players.size === 0) {
                this.rooms.delete(room.id);
                logger_1.logger.info(`房间删除: ${room.name}`);
            }
        }
        socket.leave(player.roomId);
        player.roomId = undefined;
        socket.emit('room:left');
        logger_1.logger.info(`玩家 ${player?.name} 离开房间`);
    }
    handleListRooms(socket) {
        const roomList = Array.from(this.rooms.values()).map(room => this.getRoomInfo(room));
        socket.emit('room:list', { rooms: roomList });
        logger_1.logger.debug(`房间列表请求: 共 ${roomList.length} 个房间`);
    }
    handleSignalOffer(socket, data) {
        const player = this.players.get(socket.id);
        if (!player)
            return;
        this.io.to(data.targetId).emit('signal:offer', {
            fromId: socket.id,
            fromName: player.name,
            offer: data.offer
        });
        logger_1.logger.debug(`信号: offer 从 ${player.name} 到 ${data.targetId}`);
    }
    handleSignalAnswer(socket, data) {
        const player = this.players.get(socket.id);
        if (!player)
            return;
        this.io.to(data.targetId).emit('signal:answer', {
            fromId: socket.id,
            fromName: player.name,
            answer: data.answer
        });
        logger_1.logger.debug(`信号: answer 从 ${player.name} 到 ${data.targetId}`);
    }
    handleIceCandidate(socket, data) {
        this.io.to(data.targetId).emit('signal:ice-candidate', {
            fromId: socket.id,
            candidate: data.candidate
        });
    }
    handleDisconnect(socket) {
        const player = this.players.get(socket.id);
        if (player) {
            if (player.roomId) {
                this.handleLeaveRoom(socket);
            }
            this.players.delete(socket.id);
            logger_1.logger.info(`玩家断开连接: ${player.name}`);
        }
    }
    getRoomInfo(room) {
        return {
            id: room.id,
            name: room.name,
            playerCount: room.players.size,
            maxPlayers: room.maxPlayers,
            players: Array.from(room.players.values()).map(p => ({
                id: p.id,
                name: p.name
            })),
            createdAt: room.createdAt
        };
    }
}
exports.SignalingService = SignalingService;
//# sourceMappingURL=SignalingService.js.map