import { Socket } from 'socket.io';

export type SignalNodeStatus = 'online' | 'offline' | 'unreachable';

export interface SignalNode {
  id: string;
  address: string;
  lastSeen: number;
  status: SignalNodeStatus;
}

export interface RegisterMessage {
  type: 'register';
  address: string;
  timestamp: number;
  signature?: string;
}

export interface HeartbeatMessage {
  type: 'heartbeat';
  nodeId: string;
  timestamp: number;
}

export interface NodeListMessage {
  type: 'node-list';
  nodes: SignalNode[];
  timestamp: number;
}

export interface Player {
  id: string;
  socketId: string;
  name: string;
  roomId?: string;
}

export interface Room {
  id: string;
  name: string;
  players: Map<string, Player>;
  maxPlayers: number;
  createdAt: Date;
}

export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  players: { id: string; name: string }[];
  createdAt: Date;
}

export interface SignalOfferData {
  targetId: string;
  offer: RTCSessionDescriptionInit;
}

export interface SignalAnswerData {
  targetId: string;
  answer: RTCSessionDescriptionInit;
}

export interface SignalIceCandidateData {
  targetId: string;
  candidate: RTCIceCandidateInit;
}

export interface PlayerJoinData {
  name: string;
}

export interface CreateRoomData {
  name: string;
  maxPlayers?: number;
}

export interface JoinRoomData {
  roomId: string;
}

export interface SocketEvents {
  'player:join': (data: PlayerJoinData) => void;
  'room:create': (data: CreateRoomData) => void;
  'room:join': (data: JoinRoomData) => void;
  'room:leave': () => void;
  'room:list': () => void;
  'signal:offer': (data: SignalOfferData) => void;
  'signal:answer': (data: SignalAnswerData) => void;
  'signal:ice-candidate': (data: SignalIceCandidateData) => void;
  'signal:register': (data: RegisterMessage, callback: (result: { success: boolean; nodes?: SignalNode[]; message?: string }) => void) => void;
  'signal:heartbeat': (data: HeartbeatMessage, callback: (result: { success: boolean }) => void) => void;
  'signal:nodes': (callback: (message: NodeListMessage) => void) => void;
  'disconnect': () => void;
}

export interface ServerEvents {
  'player:joined': (data: { player: Player }) => void;
  'room:created': (data: { room: RoomInfo }) => void;
  'room:joined': (data: { room: RoomInfo }) => void;
  'room:left': () => void;
  'room:list': (data: { rooms: RoomInfo[] }) => void;
  'player:joined-room': (data: { player: Player }) => void;
  'player:left-room': (data: { playerId: string }) => void;
  'signal:offer': (data: { fromId: string; fromName: string; offer: RTCSessionDescriptionInit }) => void;
  'signal:answer': (data: { fromId: string; fromName: string; answer: RTCSessionDescriptionInit }) => void;
  'signal:ice-candidate': (data: { fromId: string; candidate: RTCIceCandidateInit }) => void;
  'error': (data: { message: string }) => void;
}

export type TypedSocket = Socket<SocketEvents, ServerEvents>;
