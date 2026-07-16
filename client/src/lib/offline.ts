// Offline message queue + WebRTC P2P module
// Allows the app to function without internet via Service Worker caching
// and enables P2P messaging via WebRTC when both peers are on the same network

const DB_NAME = 'campus-mafia-offline';
const DB_VERSION = 1;
const MESSAGES_STORE = 'pending_messages';
const PEERS_STORE = 'peers';

// ─── IndexedDB helpers ───

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        db.createObjectStore(MESSAGES_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(PEERS_STORE)) {
        db.createObjectStore(PEERS_STORE, { keyPath: 'peerId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type OfflineMessage = {
  id?: number;
  to: string;
  content: string;
  reply_to_id?: string | null;
  created_at: string;
  sent: boolean;
};

export type PeerConnection = {
  peerId: string;
  username: string;
  connected: boolean;
  lastSeen: number;
};

// Queue a message to be sent when online
export async function queueOfflineMessage(msg: Omit<OfflineMessage, 'id' | 'sent'>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MESSAGES_STORE, 'readwrite');
    tx.objectStore(MESSAGES_STORE).add({ ...msg, sent: false });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Get all pending (unsent) messages
export async function getPendingMessages(): Promise<OfflineMessage[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const req = tx.objectStore(MESSAGES_STORE).getAll();
    req.onsuccess = () => resolve(req.result.filter(m => !m.sent));
    req.onerror = () => reject(req.error);
  });
}

// Mark a message as sent (remove from queue)
export async function markMessageSent(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MESSAGES_STORE, 'readwrite');
    tx.objectStore(MESSAGES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Save a peer connection
export async function savePeer(peer: PeerConnection): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PEERS_STORE, 'readwrite');
    tx.objectStore(PEERS_STORE).put(peer);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Get known peers (for reconnecting)
export async function getPeers(): Promise<PeerConnection[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PEERS_STORE, 'readonly');
    const req = tx.objectStore(PEERS_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type PeerPosition = {
  username: string;
  lat: number;
  lng: number;
  updated_at: number;
};

// ─── WebRTC P2P ───

type SignalingCallback = (msg: any) => void;

/** A message in the local P2P area chat. */
export type LocalMessage = {
  id: string;
  from: string;
  content: string;
  created_at: string;
  reply_to_id: string | null;
  reply_to_content: string | null;
  reactions: Record<string, string[]>; // emoji -> usernames who reacted
};

export class P2PManager {
  private connections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private ws: WebSocket | null = null;
  private onMessageCallback: ((from: string, content: string) => void) | null = null;
  private onConnectionCallback: ((username: string, connected: boolean) => void) | null = null;
  private onLocalMessageCallback: ((msg: LocalMessage) => void) | null = null;
  private localMessages: LocalMessage[] = [];
  private username: string = '';
  private online: boolean = false;
  private peerPositions: Map<string, PeerPosition> = new Map();
  private myPosition: { lat: number; lng: number } | null = null;
  private positionWatchId: number | null = null;
  private onPeerPositionUpdate: ((positions: PeerPosition[]) => void) | null = null;

  // ICE servers for NAT traversal (fetched from server on init)
  private iceServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  /**
   * Fetch TURN/STUN ICE server configuration from the server.
   * Falls back to hardcoded Google STUN servers if the request fails.
   *
   * @param wsUrl - The WebSocket URL (e.g. wss://domain.com or wss://domain.com/api/ws)
   */
  async fetchIceServers(wsUrl: string): Promise<void> {
    try {
      // Convert wss:// -> https:// and ws:// -> http:// so fetch() works
      const httpBase = wsUrl.startsWith('wss://')
        ? 'https://' + wsUrl.slice(6)
        : wsUrl.startsWith('ws://')
          ? 'http://' + wsUrl.slice(5)
          : wsUrl;
      // Strip trailing /api/ws or /api/ws/p2p to get the API root
      const base = httpBase.replace(/\/api\/ws(\/p2p)?$/, '');
      const res = await fetch(`${base}/api/ice-servers`);
      if (res.ok) {
        const data = await res.json();
        if (data.ice_servers && data.ice_servers.length > 0) {
          this.iceServers = { iceServers: data.ice_servers };
        }
      }
    } catch {
      // Keep default STUN servers
    }
  }

  init(username: string, wsUrl: string) {
    this.username = username;
    this.online = navigator.onLine;

    // Watch for online/offline changes
    window.addEventListener('online', () => {
      this.online = true;
      this.connectSignaling(wsUrl);
      this.syncPendingMessages();
    });
    window.addEventListener('offline', () => {
      this.online = false;
      this.disconnectAll();
    });

    // Fetch TURN/STUN ICE servers first, THEN connect signaling.
    // This avoids a race where RTCPeerConnection is created with only
    // default STUN servers (no TURN), breaking cross-NAT connections.
    const doConnect = () => {
      if (this.online) {
        this.connectSignaling(wsUrl);
      }
    };

    this.fetchIceServers(wsUrl).then(doConnect).catch(doConnect);
  }

  onMessage(cb: (from: string, content: string) => void) {
    this.onMessageCallback = cb;
  }

  onConnection(cb: (username: string, connected: boolean) => void) {
    this.onConnectionCallback = cb;
  }

  // Callback for local group broadcast messages (receives full LocalMessage)
  onLocalMessage(cb: (msg: LocalMessage) => void) {
    this.onLocalMessageCallback = cb;
  }

  // Get local group message history
  getLocalMessages(): LocalMessage[] {
    return this.localMessages;
  }

  // Clear local message history
  clearLocalMessages() {
    this.localMessages = [];
  }

  // Broadcast a message to ALL connected P2P peers (local group chat)
  // Returns the message id (created_at timestamp) for immediate UI updates
  broadcastToPeers(content: string, replyToId?: string | null, replyToContent?: string | null): string {
    const now = new Date().toISOString();
    const message: LocalMessage & { type: string } = {
      type: 'local-broadcast',
      id: now,
      from: this.username,
      content,
      created_at: now,
      reply_to_id: replyToId || null,
      reply_to_content: replyToContent || null,
      reactions: {},
    };
    // 1. Send via P2P data channels (direct WebRTC — fastest when it works)
    this.dataChannels.forEach((dc) => {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify(message));
        } catch {}
      }
    });

    // 2. Send via signaling WebSocket relay as fallback (always works as long as WS is up)
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'local-broadcast-relay',
          from: this.username,
          id: now,
          content,
          created_at: now,
          reply_to_id: replyToId || null,
          reply_to_content: replyToContent || null,
          reactions: {},
        }));
      } catch {}
    }

    // Remove type from stored message
    const { type: _, ...stored } = message;
    this.localMessages.push(stored);
    return now;
  }

  /**
   * Send a reaction to a local area chat message.
   * Toggles: if the current user already reacted with this emoji, remove it.
   */
  sendReaction(messageId: string, emoji: string) {
    // Check if we already reacted with this emoji
    const msg = this.localMessages.find(m => m.id === messageId);
    const alreadyReacted = msg?.reactions?.[emoji]?.includes(this.username);

    const reactionPayload = {
      type: 'local-reaction',
      from: this.username,
      message_id: messageId,
      emoji,
      remove: alreadyReacted,
    };

    // 1. Broadcast to peers via P2P data channels
    this.dataChannels.forEach((dc) => {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify(reactionPayload));
        } catch {}
      }
    });

    // 2. Send via signaling WebSocket relay as fallback
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'local-reaction-relay',
          from: this.username,
          message_id: messageId,
          emoji,
          remove: alreadyReacted,
        }));
      } catch {}
    }

    // Apply locally immediately
    this.applyReaction(this.username, messageId, emoji, !!alreadyReacted);
  }

  private applyReaction(username: string, messageId: string, emoji: string, remove: boolean) {
    const msg = this.localMessages.find(m => m.id === messageId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

    if (remove) {
      msg.reactions[emoji] = msg.reactions[emoji].filter(u => u !== username);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    } else {
      if (!msg.reactions[emoji].includes(username)) {
        msg.reactions[emoji].push(username);
      }
    }
  }

  isOnline(): boolean {
    return this.online;
  }

  private connectSignaling(wsUrl: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(`${wsUrl}/api/ws/p2p`);

      this.ws.onopen = () => {
        // Register our presence on the P2P signaling server so we
        // appear in /api/users/online and other peers see us.
        if (this.username) {
          this.ws?.send(JSON.stringify({
            type: 'p2p-presence',
            from: this.username,
          }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleSignalingMessage(data);
        } catch {}
      };

      this.ws.onclose = () => {
        this.ws = null;
        // Reconnect after delay
        setTimeout(() => this.connectSignaling(wsUrl), 5000);
      };
    } catch {
      // WebSocket failed — will retry when back online
    }
  }

  private async handleSignalingMessage(data: any) {
    if (data.type === 'p2p-offer') {
      await this.handleOffer(data.from, data.offer);
    } else if (data.type === 'p2p-answer') {
      await this.handleAnswer(data.from, data.answer);
    } else if (data.type === 'p2p-ice-candidate') {
      await this.handleIceCandidate(data.from, data.candidate);
    } else if (data.type === 'p2p-peer-available') {
      // Another user wants to connect — initiate a connection
      this.createOffer(data.from);
    } else if (data.type === 'p2p-peer-connected') {
      this.onConnectionCallback?.(data.from, true);
    } else if (data.type === 'p2p-peer-disconnected') {
      this.onConnectionCallback?.(data.from, false);
      this.connections.get(data.from)?.close();
      this.connections.delete(data.from);
      this.dataChannels.delete(data.from);
      this.peerPositions.delete(data.from);
    } else if (data.type === 'local-broadcast-relay') {
      // Relayed local broadcast from server — use when P2P data channel fails cross-device
      this.addRelayedMessage(data);
    } else if (data.type === 'local-reaction-relay') {
      // Relayed local reaction from server
      this.applyReaction(data.from, data.message_id, data.emoji, data.remove || false);
      this.onLocalMessageCallback?.(this.localMessages.find(m => m.id === data.message_id) || this.localMessages[this.localMessages.length - 1]);
    }
  }

  // Initiate connection to a peer
  async connectToPeer(peerUsername: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      type: 'p2p-request-connect',
      from: this.username,
      to: peerUsername,
    }));
  }

  private async createOffer(peerUsername: string) {
    const pc = new RTCPeerConnection(this.iceServers);
    this.connections.set(peerUsername, pc);

    const dc = pc.createDataChannel('p2p-chat');
    this.setupDataChannel(peerUsername, dc);

    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws) {
        this.ws.send(JSON.stringify({
          type: 'p2p-ice-candidate',
          from: this.username,
          to: peerUsername,
          candidate: event.candidate,
        }));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.ws?.send(JSON.stringify({
      type: 'p2p-offer',
      from: this.username,
      to: peerUsername,
      offer,
    }));
  }

  private async handleOffer(from: string, offer: RTCSessionDescriptionInit) {
    const pc = new RTCPeerConnection(this.iceServers);
    this.connections.set(from, pc);

    pc.ondatachannel = (event) => {
      this.setupDataChannel(from, event.channel);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws) {
        this.ws.send(JSON.stringify({
          type: 'p2p-ice-candidate',
          from: this.username,
          to: from,
          candidate: event.candidate,
        }));
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.ws?.send(JSON.stringify({
      type: 'p2p-answer',
      from: this.username,
      to: from,
      answer,
    }));
  }

  private async handleAnswer(from: string, answer: RTCSessionDescriptionInit) {
    const pc = this.connections.get(from);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private async handleIceCandidate(from: string, candidate: RTCIceCandidateInit) {
    const pc = this.connections.get(from);
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {}
  }

  private setupDataChannel(peerUsername: string, dc: RTCDataChannel) {
    this.dataChannels.set(peerUsername, dc);

    dc.onopen = () => {
      this.onConnectionCallback?.(peerUsername, true);
      savePeer({ peerId: peerUsername, username: peerUsername, connected: true, lastSeen: Date.now() });
    };

    dc.onclose = () => {
      this.onConnectionCallback?.(peerUsername, false);
    };

    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message') {
          this.onMessageCallback?.(peerUsername, data.content);
        } else if (data.type === 'local-broadcast') {
          // Store in local group history and notify (cap at 200)
          const newMsg: LocalMessage = {
            id: data.id || data.created_at,
            from: data.from,
            content: data.content,
            created_at: data.created_at,
            reply_to_id: data.reply_to_id || null,
            reply_to_content: data.reply_to_content || null,
            reactions: data.reactions || {},
          };
          // Avoid duplicates (same id already exists)
          const exists = this.localMessages.some(m => m.id === newMsg.id);
          if (!exists) {
            this.localMessages.push(newMsg);
            if (this.localMessages.length > 200) {
              this.localMessages = this.localMessages.slice(-200);
            }
          }
          this.onLocalMessageCallback?.(newMsg);
        } else if (data.type === 'local-reaction') {
          this.applyReaction(data.from, data.message_id, data.emoji, data.remove || false);
          // Notify so the UI refreshes
          this.onLocalMessageCallback?.(this.localMessages.find(m => m.id === data.message_id) || this.localMessages[this.localMessages.length - 1]);
        } else if (data.type === 'location-update') {
          this.handleLocationUpdate(data.from, data.lat, data.lng);
        }
      } catch {}
    };
  }

  /**
   * Add a message received from the server relay (signaling WS).
   * Used as fallback when P2P data channels fail cross-device.
   */
  private addRelayedMessage(data: any) {
    const newMsg: LocalMessage = {
      id: data.id || data.created_at,
      from: data.from,
      content: data.content,
      created_at: data.created_at,
      reply_to_id: data.reply_to_id || null,
      reply_to_content: data.reply_to_content || null,
      reactions: data.reactions || {},
    };
    // Avoid duplicates (same id already exists from P2P direct delivery or another relay)
    const exists = this.localMessages.some(m => m.id === newMsg.id);
    if (!exists) {
      this.localMessages.push(newMsg);
      if (this.localMessages.length > 200) {
        this.localMessages = this.localMessages.slice(-200);
      }
    }
    this.onLocalMessageCallback?.(newMsg);
  }

  // Send a message via P2P if connected, otherwise queue it
  async sendMessage(to: string, content: string, replyToId?: string | null): Promise<boolean> {
    const dc = this.dataChannels.get(to);
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'message', content, reply_to_id: replyToId }));
      return true; // Sent via P2P
    }

    // Queue for later
    await queueOfflineMessage({
      to,
      content,
      reply_to_id: replyToId,
      created_at: new Date().toISOString(),
    });
    return false; // Queued
  }

  // Sync pending messages when back online
  // Pass apiFetch to avoid circular dynamic imports
  async syncPendingMessages(apiFetch?: (path: string, options?: RequestInit) => Promise<Response>) {
    if (!this.online) return;
    const pending = await getPendingMessages();
    for (const msg of pending) {
      // Try P2P first, then fall back to server
      const sent = await this.sendMessage(msg.to, msg.content, msg.reply_to_id);
      if (sent && msg.id) {
        await markMessageSent(msg.id);
      } else if (apiFetch) {
        // Fallback to server API
        try {
          const res = await apiFetch('/api/chat/direct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              receiver_username: msg.to,
              content: msg.content,
              reply_to_id: msg.reply_to_id,
            }),
          });
          if (res.ok && msg.id) {
            await markMessageSent(msg.id);
          }
        } catch {}
      }
    }
  }

  disconnectAll() {
    this.connections.forEach(pc => pc.close());
    this.connections.clear();
    this.dataChannels.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getConnectedPeers(): string[] {
    return Array.from(this.dataChannels.entries())
      .filter(([_, dc]) => dc.readyState === 'open')
      .map(([username]) => username);
  }

  /** Returns true if the signaling WebSocket is connected (relay is available). */
  isRelayAvailable(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ─── Geolocation ───

  // Start sharing location with connected peers
  startLocationSharing() {
    if (!navigator.geolocation) return;
    this.positionWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.myPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Broadcast to all peers
        const msg = {
          type: 'location-update',
          from: this.username,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        this.dataChannels.forEach((dc) => {
          if (dc.readyState === 'open') {
            try { dc.send(JSON.stringify(msg)); } catch {}
          }
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  // Stop sharing location
  stopLocationSharing() {
    if (this.positionWatchId !== null) {
      navigator.geolocation.clearWatch(this.positionWatchId);
      this.positionWatchId = null;
    }
  }

  // Get my current position
  getMyPosition(): { lat: number; lng: number } | null {
    return this.myPosition;
  }

  // Get peer positions
  getPeerPositions(): PeerPosition[] {
    return Array.from(this.peerPositions.values());
  }

  // Callback for position updates
  onPeerPosition(cb: (positions: PeerPosition[]) => void) {
    this.onPeerPositionUpdate = cb;
  }

  // Handle incoming location update from a peer
  private handleLocationUpdate(from: string, lat: number, lng: number) {
    this.peerPositions.set(from, { username: from, lat, lng, updated_at: Date.now() });
    this.onPeerPositionUpdate?.(this.getPeerPositions());
  }
}

// Singleton instance
export const p2pManager = new P2PManager();
