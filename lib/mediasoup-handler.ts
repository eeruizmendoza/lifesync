/**
 * Mediasoup SFU Handler
 * Selective Forwarding Unit for efficient WebRTC media routing
 * Handles: transports, producers (mic/camera), consumers (speakers/display)
 */

import * as mediasoup from 'mediasoup';

// Types
export interface WorkerSettings {
  logLevel: mediasoup.types.WorkerLogLevel;
  logTags: mediasoup.types.WorkerLogTag[];
  rtcMinPort: number;
  rtcMaxPort: number;
}

export interface RouterSettings {
  mediaCodecs: mediasoup.types.RtpCodecCapability[];
}

export interface TransportSettings {
  listenIps: mediasoup.types.TransportListenIp[];
  enableUdp: boolean;
  enableTcp: boolean;
  preferUdp: boolean;
}

export interface ProduceOptions {
  kind: 'audio' | 'video';
  rtpParameters: mediasoup.types.RtpParameters;
  appData?: Record<string, any>;
}

export interface ConsumeOptions {
  producerId: string;
  rtpCapabilities: mediasoup.types.RtpCapabilities;
  appData?: Record<string, any>;
}

export interface PeerConnection {
  peerId: string;
  transport: mediasoup.types.WebRtcTransport;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
}

export interface CallRoom {
  roomId: string;
  peers: Map<string, PeerConnection>;
  createdAt: number;
  isActive: boolean;
}

// ============================================================================
// MEDIASOUP SFU HANDLER
// ============================================================================

class MediasoupSFUHandler {
  private worker: mediasoup.types.Worker | null = null;
  private router: mediasoup.types.Router | null = null;
  private rooms: Map<string, CallRoom> = new Map();
  private peerConnections: Map<string, PeerConnection> = new Map();

  /**
   * Initialize Mediasoup worker
   * Should be called once at startup
   */
  async initializeWorker(settings: WorkerSettings): Promise<void> {
    try {
      console.log('🚀 Initializing Mediasoup worker...');

      this.worker = await mediasoup.createWorker({
        logLevel: settings.logLevel,
        logTags: settings.logTags,
        rtcMinPort: settings.rtcMinPort,
        rtcMaxPort: settings.rtcMaxPort,
      });

      console.log(`✅ Worker created (PID: ${this.worker.pid})`);

      // Handle worker errors
      this.worker.on('died', () => {
        console.error('❌ Mediasoup worker died! Restarting...');
        this.initializeWorker(settings);
      });
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      throw error;
    }
  }

  /**
   * Create router
   * Each call gets its own router for media routing
   */
  async createRouter(settings: RouterSettings): Promise<mediasoup.types.Router> {
    if (!this.worker) {
      throw new Error('Worker not initialized. Call initializeWorker() first.');
    }

    try {
      console.log('📡 Creating router...');

      const router = await this.worker.createRouter({
        mediaCodecs: settings.mediaCodecs,
      });

      console.log('✅ Router created');
      return router;
    } catch (error) {
      console.error('Failed to create router:', error);
      throw error;
    }
  }

  /**
   * Initialize call room
   */
  async initializeRoom(roomId: string): Promise<CallRoom> {
    try {
      // Create router for this room
      const router = await this.createRouter({
        mediaCodecs: this.getDefaultMediaCodecs(),
      });

      const room: CallRoom = {
        roomId,
        peers: new Map(),
        createdAt: Date.now(),
        isActive: true,
      };

      this.rooms.set(roomId, room);
      console.log(`✅ Room initialized: ${roomId}`);

      return room;
    } catch (error) {
      console.error(`Failed to initialize room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Create WebRTC transport for peer
   * Each peer needs a transport for sending and receiving media
   */
  async createTransport(
    roomId: string,
    peerId: string,
    transportSettings: TransportSettings
  ): Promise<{
    transportId: string;
    iceParameters: mediasoup.types.IceParameters;
    iceCandidates: mediasoup.types.IceCandidate[];
    dtlsParameters: mediasoup.types.DtlsParameters;
  }> {
    const router = this.router;
    if (!router) {
      throw new Error('Router not initialized');
    }

    try {
      console.log(`🔌 Creating transport for peer ${peerId} in room ${roomId}`);

      const transport = await router.createWebRtcTransport({
        listenIps: transportSettings.listenIps,
        enableUdp: transportSettings.enableUdp,
        enableTcp: transportSettings.enableTcp,
        preferUdp: transportSettings.preferUdp,
      });

      // Store peer connection
      const peerConnection: PeerConnection = {
        peerId,
        transport,
        producers: new Map(),
        consumers: new Map(),
      };

      this.peerConnections.set(peerId, peerConnection);

      // Add to room
      const room = this.rooms.get(roomId);
      if (room) {
        room.peers.set(peerId, peerConnection);
      }

      console.log(`✅ Transport created for ${peerId}`);

      return {
        transportId: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    } catch (error) {
      console.error(`Failed to create transport for ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Connect transport (DTLS handshake)
   */
  async connectTransport(
    peerId: string,
    dtlsParameters: mediasoup.types.DtlsParameters
  ): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      throw new Error(`Peer connection not found: ${peerId}`);
    }

    try {
      await peerConnection.transport.connect({ dtlsParameters });
      console.log(`✅ Transport connected for ${peerId}`);
    } catch (error) {
      console.error(`Failed to connect transport for ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Produce (send) media
   * Peer sends audio/video to SFU
   */
  async produce(
    peerId: string,
    options: ProduceOptions
  ): Promise<{
    producerId: string;
    kind: 'audio' | 'video';
  }> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      throw new Error(`Peer connection not found: ${peerId}`);
    }

    try {
      console.log(`🎤 Producer creating for ${peerId} (${options.kind})`);

      const producer = await peerConnection.transport.produce({
        kind: options.kind,
        rtpParameters: options.rtpParameters,
        appData: options.appData || { mediaTag: options.kind },
      });

      peerConnection.producers.set(producer.id, producer);

      console.log(`✅ Producer created: ${producer.id}`);

      return {
        producerId: producer.id,
        kind: options.kind,
      };
    } catch (error) {
      console.error(`Failed to produce media for ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Consume (receive) media
   * Peer receives audio/video from SFU
   */
  async consume(
    peerId: string,
    producerId: string,
    rtpCapabilities: mediasoup.types.RtpCapabilities,
    appData?: Record<string, any>
  ): Promise<{
    consumerId: string;
    producerId: string;
    kind: 'audio' | 'video';
    rtpParameters: mediasoup.types.RtpParameters;
  }> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      throw new Error(`Peer connection not found: ${peerId}`);
    }

    if (!this.router) {
      throw new Error('Router not initialized');
    }

    try {
      console.log(`📻 Consumer creating for ${peerId} from producer ${producerId}`);

      // Get producer from peer connections
      let producer: any = null;
      for (const peerConnection of this.peerConnections.values()) {
        if (peerConnection.producers.has(producerId)) {
          producer = peerConnection.producers.get(producerId);
          break;
        }
      }

      if (!producer) {
        throw new Error(`Producer not found: ${producerId}`);
      }

      const consumer = await peerConnection.transport.consume({
        producerId,
        rtpCapabilities,
        paused: false,
        appData: appData || { mediaTag: producer.kind },
      });

      peerConnection.consumers.set(consumer.id, consumer);

      console.log(`✅ Consumer created: ${consumer.id}`);

      return {
        consumerId: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      };
    } catch (error) {
      console.error(`Failed to consume media for ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Pause/unpause producer or consumer
   */
  async pauseProducer(peerId: string, producerId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) throw new Error(`Peer not found: ${peerId}`);

    const producer = peerConnection.producers.get(producerId);
    if (!producer) throw new Error(`Producer not found: ${producerId}`);

    await producer.pause();
  }

  async resumeProducer(peerId: string, producerId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) throw new Error(`Peer not found: ${peerId}`);

    const producer = peerConnection.producers.get(producerId);
    if (!producer) throw new Error(`Producer not found: ${producerId}`);

    await producer.resume();
  }

  /**
   * Close producer
   */
  async closeProducer(peerId: string, producerId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) throw new Error(`Peer not found: ${peerId}`);

    const producer = peerConnection.producers.get(producerId);
    if (!producer) throw new Error(`Producer not found: ${producerId}`);

    producer.close();
    peerConnection.producers.delete(producerId);
  }

  /**
   * Close consumer
   */
  async closeConsumer(peerId: string, consumerId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) throw new Error(`Peer not found: ${peerId}`);

    const consumer = peerConnection.consumers.get(consumerId);
    if (!consumer) throw new Error(`Consumer not found: ${consumerId}`);

    consumer.close();
    peerConnection.consumers.delete(consumerId);
  }

  /**
   * Close peer connection
   */
  async closePeer(peerId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return;

    // Close all producers
    for (const producer of peerConnection.producers.values()) {
      producer.close();
    }

    // Close all consumers
    for (const consumer of peerConnection.consumers.values()) {
      consumer.close();
    }

    // Close transport
    peerConnection.transport.close();

    this.peerConnections.delete(peerId);
    console.log(`✅ Peer closed: ${peerId}`);
  }

  /**
   * Close room
   */
  async closeRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Close all peers in room
    for (const peerId of room.peers.keys()) {
      await this.closePeer(peerId);
    }

    // Close router
    if (this.router) {
      this.router.close();
    }

    room.isActive = false;
    this.rooms.delete(roomId);
    console.log(`✅ Room closed: ${roomId}`);
  }

  /**
   * Get router RTP capabilities
   * Client needs this to create valid RTP parameters
   */
  getRouterRtpCapabilities(): mediasoup.types.RtpCapabilities | null {
    if (!this.router) return null;
    return this.router.rtpCapabilities;
  }

  /**
   * Get peer connection stats
   */
  async getPeerStats(
    peerId: string
  ): Promise<{
    producers: Array<{ id: string; kind: 'audio' | 'video'; stats: any[] }>;
    consumers: Array<{ id: string; kind: 'audio' | 'video'; stats: any[] }>;
  }> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      throw new Error(`Peer not found: ${peerId}`);
    }

    const producers = [];
    for (const [id, producer] of peerConnection.producers) {
      const stats = await producer.getStats();
      producers.push({ id, kind: producer.kind, stats });
    }

    const consumers = [];
    for (const [id, consumer] of peerConnection.consumers) {
      const stats = await consumer.getStats();
      consumers.push({ id, kind: consumer.kind, stats });
    }

    return { producers, consumers };
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    return this.worker !== null && (this.worker as any).alive !== false;
  }

  /**
   * Get default media codecs
   */
  private getDefaultMediaCodecs(): mediasoup.types.RtpCodecCapability[] {
    return [
      // Audio codecs
      {
        kind: 'audio' as const,
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        preferredPayloadType: 111,
      },
      // Video codecs
      {
        kind: 'video' as const,
        mimeType: 'video/VP8',
        clockRate: 90000,
        preferredPayloadType: 96,
      },
      {
        kind: 'video' as const,
        mimeType: 'video/VP9',
        clockRate: 90000,
        preferredPayloadType: 98,
      },
      {
        kind: 'video' as const,
        mimeType: 'video/H264',
        clockRate: 90000,
        preferredPayloadType: 100,
        parameters: {
          'level-asymmetry-allowed': 1,
          'packetization-mode': 1,
          'profile-level-id': '42001f',
        },
      },
    ];
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let sfuInstance: MediasoupSFUHandler | null = null;

export function getMediasoupSFU(): MediasoupSFUHandler {
  if (!sfuInstance) {
    sfuInstance = new MediasoupSFUHandler();
  }
  return sfuInstance;
}

/**
 * Initialize SFU (should be called in app startup)
 */
export async function initializeMediasoupSFU(): Promise<void> {
  const sfu = getMediasoupSFU();

  const publicIp = process.env.MACHINE_PUBLIC_IP || 'localhost';
  const machineIp = process.env.MACHINE_IP || '127.0.0.1';

  await sfu.initializeWorker({
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  });

  console.log(`✅ Mediasoup SFU initialized (${publicIp}:40000-49999)`);
}

export default getMediasoupSFU;
