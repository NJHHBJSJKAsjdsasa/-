declare module 'bittorrent-dht' {
  import { EventEmitter } from 'events';

  interface DHTNode {
    id: Buffer;
    host: string;
    port: number;
  }

  interface DHTPeer {
    host: string;
    port: number;
    id?: Buffer;
  }

  interface DHTQuery {
    q: string;
    a?: any;
  }

  interface DHTPeerInfo {
    address: string;
    port: number;
  }

  interface DHTAddress {
    port: number;
    family: string;
    address: string;
  }

  class DHT extends EventEmitter {
    constructor(options?: {
      bootstrap?: string[];
      nodeId?: Buffer;
      [key: string]: any;
    });

    nodeId: Buffer;
    nodes: {
      toArray(): DHTNode[];
      closest(id: Buffer, n: number): DHTNode[];
    };
    ready: boolean;

    listen(port: number | string, callback?: (err?: Error) => void): void;
    address(): DHTAddress;
    destroy(callback?: () => void): void;

    announce(infoHash: Buffer, port: number, callback?: (err?: Error) => void): void;
    lookup(infoHash: Buffer, callback?: (err: Error | null, peers: DHTPeer[]) => void): void;

    on(event: 'ready', listener: () => void): this;
    on(event: 'node', listener: (node: DHTNode) => void): this;
    on(event: 'announce', listener: (peer: DHTPeer, infoHash: Buffer) => void): this;
    on(event: 'get_peers', listener: (infoHash: Buffer, peer: DHTPeerInfo) => void): this;
    on(event: 'query', listener: (query: DHTQuery, peer: DHTPeerInfo) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'warning', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export default DHT;
}
