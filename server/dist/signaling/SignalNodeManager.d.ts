import winston from 'winston';
import { SignalNode, SignalNodeStatus } from './types.js';
export declare class SignalNodeManager {
    private nodes;
    private logger;
    private heartbeatInterval;
    private readonly HEARTBEAT_CHECK_INTERVAL;
    private readonly NODE_OFFLINE_THRESHOLD;
    constructor(logger?: winston.Logger);
    private createDefaultLogger;
    addNode(address: string): Promise<SignalNode | null>;
    removeNode(nodeId: string): boolean;
    getNodes(status?: SignalNodeStatus): SignalNode[];
    getNodeById(nodeId: string): SignalNode | undefined;
    findNodeByAddress(address: string): SignalNode | undefined;
    updateHeartbeat(nodeId: string): boolean;
    validateNode(address: string): Promise<boolean>;
    private startHeartbeatCheck;
    private checkHeartbeats;
    stopHeartbeatCheck(): void;
    dispose(): void;
}
//# sourceMappingURL=SignalNodeManager.d.ts.map