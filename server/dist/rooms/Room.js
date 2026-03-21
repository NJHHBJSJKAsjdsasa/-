export class Room {
    id;
    name;
    type;
    maxPlayers;
    createdAt;
    _players;
    eventListeners;
    constructor(id, name, type, maxPlayers = 100) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.maxPlayers = maxPlayers;
        this.createdAt = Date.now();
        this._players = new Set();
        this.eventListeners = new Map();
    }
    get players() {
        return Array.from(this._players);
    }
    get playerCount() {
        return this._players.size;
    }
    get isFull() {
        return this._players.size >= this.maxPlayers;
    }
    get isEmpty() {
        return this._players.size === 0;
    }
    addPlayer(playerId) {
        if (this.isFull) {
            return false;
        }
        this._players.add(playerId);
        return true;
    }
    removePlayer(playerId) {
        return this._players.delete(playerId);
    }
    hasPlayer(playerId) {
        return this._players.has(playerId);
    }
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(callback);
    }
    off(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.delete(callback);
        }
    }
    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(data);
                }
                catch (error) {
                    console.error(`Error in room ${this.id} event listener:`, error);
                }
            });
        }
    }
    toJSON() {
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
//# sourceMappingURL=Room.js.map