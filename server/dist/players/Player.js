import { v4 as uuidv4 } from 'uuid';
export class Player {
    id;
    nickname;
    socketId;
    status;
    lastActive;
    mapLocation;
    constructor(nickname, socketId) {
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
    getId() {
        return this.id;
    }
    getNickname() {
        return this.nickname;
    }
    getSocketId() {
        return this.socketId;
    }
    getStatus() {
        return this.status;
    }
    getLastActive() {
        return this.lastActive;
    }
    getMapLocation() {
        return this.mapLocation;
    }
    setSocketId(socketId) {
        this.socketId = socketId;
        this.updateLastActive();
    }
    setStatus(status) {
        this.status = status;
        this.updateLastActive();
    }
    setMapLocation(location) {
        this.mapLocation = location;
        this.updateLastActive();
    }
    updateLastActive() {
        this.lastActive = new Date();
    }
    toJSON() {
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
//# sourceMappingURL=Player.js.map