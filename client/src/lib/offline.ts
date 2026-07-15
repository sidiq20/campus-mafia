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

export class P2PManager {
  private connections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private ws: WebSocket | null = null;
  private onMessageCallback: ((from: string, content: string) => void) | null = null;
  private onConnectionCallback: ((username: string, connected: boolean) => void) | null = null;
  private onLocalMessageCallback: ((from: string, content: string) => void) | null = null;
  private localMessages: { from: string; content: string; created_at: string }[] = [];
  private username: string = '';
  private online: boolean = false;
  private peerPositions: Map<string, PeerPosition> = new Map();
  private myPosition: { lat: number; lng: number } | null = null;
  private positionWatchId: number | null = null;
  private onPeerPositionUpdate: ((positions: PeerPosition[]) => void) | null = null;

  // ICE servers for NAT traversal
  private iceServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

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

    if (this.online) {
      this.connectSignaling(wsUrl);
    }
  }

  onMessage(cb: (from: string, content: string) => void) {
    this.onMessageCallback = cb;
  }

  onConnection(cb: (username: string, connected: boolean) => void) {
    this.onConnectionCallback = cb;
  }

  // Callback for local group broadcast messages
  onLocalMessage(cb: (from: string, content: string) => void) {
    this.onLocalMessageCallback = cb;
  }

  // Get local group message history
  getLocalMessages(): { from: string; content: string; created_at: string }[] {
    return this.localMessages;
  }

  // Clear local message history
  clearLocalMessages() {
    this.localMessages = [];
  }

  // Broadcast a message to ALL connected P2P peers (local group chat)
  broadcastToPeers(content: string): number {
    let sentCount = 0;
    const message = {
      type: 'local-broadcast',
      from: this.username,
      content,
      created_at: new Date().toISOString(),
    };
    this.dataChannels.forEach((dc, username) => {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify(message));
          sentCount++;
        } catch {}
      }
    });
    // Also record our own message
    this.localMessages.push(message);
    return sentCount;
  }

  isOnline(): boolean {
    return this.online;
  }

  private connectSignaling(wsUrl: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(`${wsUrl}/api/ws/p2p`);

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
          this.localMessages.push({ from: data.from, content: data.content, created_at: data.created_at });
          if (this.localMessages.length > 200) {
            this.localMessages = this.localMessages.slice(-200);
          }
          this.onLocalMessageCallback?.(data.from, data.content);
        } else if (data.type === 'location-update') {
          this.handleLocationUpdate(data.from, data.lat, data.lng);
        }
      } catch {}
    };
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
