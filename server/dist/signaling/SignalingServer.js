import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { SignalNodeManager } from './SignalNodeManager.js';
const BOOTSTRAP_SIGNALS = process.env.BOOTSTRAP_SIGNALS
    ? process.env.BOOTSTRAP_SIGNALS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
export class SignalingServer {
    io;
    logger;
    players = new Map();
    rooms = new Map();
    nodeManager;
    nodeId;
    serverAddress;
    constructor(io, logger, serverAddress) {
        this.io = io;
        this.logger = logger || this.createDefaultLogger();
        this.nodeManager = new SignalNodeManager(this.logger);
        this.nodeId = uuidv4();
        this.serverAddress = serverAddress || this.getDefaultServerAddress();
        this.setupSocketHandlers();
        this.registerToBootstrap();
    }
    getDefaultServerAddress() {
        const port = process.env.PORT || '5050';
        const host = process.env.HOST || 'localhost';
        return `http://${host}:${port}`;
    }
    createDefaultLogger() {
        return winston.createLogger({
            level: 'info',
            format: winston.format.combine(winston.format.timestamp(), winston.format.printf(({ timestamp, level, message }) => {
                return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
            })),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'logs/signaling.log' })
            ]
        });
    }
    async registerToBootstrap() {
        if (BOOTSTRAP_SIGNALS.length === 0) {
            this.logger.info('未配置Bootstrap节点');
            return;
        }
        this.logger.info(`开始向 ${BOOTSTRAP_SIGNALS.length} 个Bootstrap节点注册`);
        for (const bootstrapAddress of BOOTSTRAP_SIGNALS) {
            try {
                const registerData = {
                    type: 'register',
                    address: this.serverAddress,
                    timestamp: Date.now()
                };
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                const response = await fetch(`${bootstrapAddress}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(registerData),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (response.ok) {
                    const result = await response.json();
                    this.logger.info(`成功注册到Bootstrap节点: ${bootstrapAddress}`);
                    if (result.nodes && Array.isArray(result.nodes)) {
                        for (const node of result.nodes) {
                            if (node.address !== this.serverAddress) {
                                await this.nodeManager.addNode(node.address);
                            }
                        }
                    }
                }
                else {
                    this.logger.warn(`注册到Bootstrap节点失败: ${bootstrapAddress} - ${response.status}`);
                }
            }
            catch (error) {
                this.logger.error(`注册到Bootstrap节点出错: ${bootstrapAddress}`, error);
            }
        }
    }
    async handleRegister(data) {
        this.logger.info(`收到注册请求: ${data.address}`);
        const node = await this.nodeManager.addNode(data.address);
        if (!node) {
            return { success: false };
        }
        await this.syncNodeList();
        return {
            success: true,
            nodeId: node.id,
            nodes: this.nodeManager.getNodes('online')
        };
    }
    handleHeartbeat(data) {
        const success = this.nodeManager.updateHeartbeat(data.nodeId);
        if (success) {
            this.logger.debug(`收到心跳: ${data.nodeId}`);
        }
        return success;
    }
    async syncNodeList() {
        const onlineNodes = this.nodeManager.getNodes('online');
        const nodeListMessage = {
            type: 'node-list',
            nodes: onlineNodes,
            timestamp: Date.now()
        };
        this.io.emit('signal:nodes', nodeListMessage);
        for (const node of onlineNodes) {
            if (node.address === this.serverAddress)
                continue;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                await fetch(`${node.address}/nodes/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nodeListMessage),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
            }
            catch (error) {
                this.logger.debug(`同步节点列表失败: ${node.address}`);
            }
        }
    }
    handleNodeListSync(data) {
        this.logger.debug(`收到节点列表同步，包含 ${data.nodes.length} 个节点`);
        for (const node of data.nodes) {
            if (node.address !== this.serverAddress && !this.nodeManager.findNodeByAddress(node.address)) {
                this.nodeManager.addNode(node.address);
            }
        }
    }
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            this.logger.info(`客户端连接: ${socket.id}`);
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
            socket.on('signal:register', (data, callback) => {
                this.handleRegister(data).then(result => {
                    if (callback && typeof callback === 'function') {
                        callback(result);
                    }
                });
            });
            socket.on('signal:heartbeat', (data, callback) => {
                const success = this.handleHeartbeat(data);
                if (callback && typeof callback === 'function') {
                    callback({ success });
                }
            });
            socket.on('signal:nodes', (callback) => {
                const nodes = this.nodeManager.getNodes('online');
                const message = {
                    type: 'node-list',
                    nodes,
                    timestamp: Date.now()
                };
                if (callback && typeof callback === 'function') {
                    callback(message);
                }
            });
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });
        });
    }
    handlePlayerJoin(socket, data) {
        const player = {
            id: uuidv4(),
            socketId: socket.id,
            name: data.name
        };
        this.players.set(socket.id, player);
        socket.emit('player:joined', { player });
        this.logger.info(`玩家加入: ${data.name} (${player.id})`);
    }
    handleCreateRoom(socket, data) {
        const player = this.players.get(socket.id);
        if (!player) {
            socket.emit('error', { message: '玩家未登录' });
            return;
        }
        const roomId = uuidv4();
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
        this.logger.info(`房间创建: ${data.name} (${roomId})`);
    }
    handleJoinRoom(socket, data) {
        const player = this.players.get(socket.id);
        if (!player) {
            socket.emit('error', { message: '玩家未登录' });
            return;
        }
        const room = this.rooms.get(data.roomId);
        if (!room) {
            socket.emit('error', { message: '房间不存在' });
            return;
        }
        if (room.players.size >= room.maxPlayers) {
            socket.emit('error', { message: '房间已满' });
            return;
        }
        room.players.set(socket.id, player);
        player.roomId = data.roomId;
        socket.join(data.roomId);
        socket.to(data.roomId).emit('player:joined-room', { player });
        socket.emit('room:joined', { room: this.getRoomInfo(room) });
        this.logger.info(`玩家 ${player.name} 加入房间 ${room.name}`);
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
                this.logger.info(`房间删除: ${room.name}`);
            }
        }
        socket.leave(player.roomId);
        player.roomId = undefined;
        socket.emit('room:left');
    }
    handleListRooms(socket) {
        const roomList = Array.from(this.rooms.values()).map(room => this.getRoomInfo(room));
        socket.emit('room:list', { rooms: roomList });
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
        this.logger.debug(`转发 offer 从 ${player.name} 到 ${data.targetId}`);
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
        this.logger.debug(`转发 answer 从 ${player.name} 到 ${data.targetId}`);
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
            this.logger.info(`玩家断开连接: ${player.name}`);
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
    getPlayerCount() {
        return this.players.size;
    }
    getRoomCount() {
        return this.rooms.size;
    }
    getNodeManager() {
        return this.nodeManager;
    }
    getNodeId() {
        return this.nodeId;
    }
    dispose() {
        this.nodeManager.dispose();
    }
}
//# sourceMappingURL=SignalingServer.js.map