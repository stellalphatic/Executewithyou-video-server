'use client';

/**
 * Single Session Manager - WhatsApp Web-style Session Enforcement
 * 
 * Ensures only ONE active studio/meeting session per user at a time.
 * If a user opens a new tab with the same room, the previous session is disconnected.
 * 
 * Uses BroadcastChannel API + localStorage heartbeat for cross-tab communication.
 */

export interface SessionInfo {
  sessionId: string;
  roomId: string;
  userId: string;
  tabId: string;
  timestamp: number;
}

export type SessionEvent = 
  | { type: 'SESSION_CLAIM'; payload: SessionInfo }
  | { type: 'SESSION_RELEASE'; payload: { sessionId: string } }
  | { type: 'SESSION_PING'; payload: { sessionId: string } }
  | { type: 'SESSION_PONG'; payload: { sessionId: string; tabId: string } }
  | { type: 'SESSION_TAKEOVER'; payload: SessionInfo };

type SessionEventHandler = (event: SessionEvent) => void;

const SESSION_CHANNEL = 'allstrm-session';
const SESSION_STORAGE_KEY = 'allstrm-active-session';
const HEARTBEAT_INTERVAL = 2000; // 2 seconds
const SESSION_TIMEOUT = 6000; // 6 seconds - if no heartbeat, session is stale

class SessionManager {
  private channel: BroadcastChannel | null = null;
  private sessionId: string | null = null;
  private tabId: string;
  private roomId: string | null = null;
  private userId: string | null = null;
  private heartbeatInterval: number | null = null;
  private listeners: Set<SessionEventHandler> = new Set();
  private isActive: boolean = false;
  private onTakeoverCallback: (() => void) | null = null;

  constructor() {
    this.tabId = this.generateTabId();
    this.initChannel();
  }

  private generateTabId(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  private initChannel(): void {
    if (typeof window === 'undefined') return;
    
    try {
      this.channel = new BroadcastChannel(SESSION_CHANNEL);
      this.channel.onmessage = (event: MessageEvent<SessionEvent>) => {
        this.handleMessage(event.data);
      };
    } catch (e) {
      // BroadcastChannel not supported - fall back to storage events
      console.warn('[SessionManager] BroadcastChannel not supported, using storage fallback');
      window.addEventListener('storage', this.handleStorageEvent.bind(this));
    }
  }

  private handleStorageEvent(event: StorageEvent): void {
    if (event.key !== SESSION_STORAGE_KEY || !event.newValue) return;
    
    try {
      const sessionInfo: SessionInfo = JSON.parse(event.newValue);
      // If another tab claimed the session for the same room/user, we're being taken over
      if (
        this.isActive && 
        sessionInfo.roomId === this.roomId && 
        sessionInfo.userId === this.userId &&
        sessionInfo.tabId !== this.tabId
      ) {
        this.handleTakeover(sessionInfo);
      }
    } catch (e) {
      // Invalid JSON, ignore
    }
  }

  private handleMessage(event: SessionEvent): void {
    switch (event.type) {
      case 'SESSION_CLAIM':
        // Another tab is claiming a session for the same room/user
        if (
          this.isActive && 
          event.payload.roomId === this.roomId && 
          event.payload.userId === this.userId &&
          event.payload.tabId !== this.tabId
        ) {
          this.handleTakeover(event.payload);
        }
        break;

      case 'SESSION_TAKEOVER':
        // We're being forcefully disconnected
        if (event.payload.tabId !== this.tabId && event.payload.sessionId === this.sessionId) {
          this.handleTakeover(event.payload);
        }
        break;

      case 'SESSION_PING':
        // Another tab is checking if we're alive
        if (this.isActive && event.payload.sessionId !== this.sessionId) {
          this.sendPong();
        }
        break;

      case 'SESSION_RELEASE':
        // A session was released - we could potentially reclaim
        break;
    }

    // Notify listeners
    this.listeners.forEach(handler => handler(event));
  }

  private handleTakeover(newSessionInfo: SessionInfo): void {
    console.log('[SessionManager] Session taken over by another tab:', newSessionInfo.tabId);
    this.isActive = false;
    this.stopHeartbeat();
    
    if (this.onTakeoverCallback) {
      this.onTakeoverCallback();
    }
  }

  private sendPong(): void {
    const event: SessionEvent = {
      type: 'SESSION_PONG',
      payload: { sessionId: this.sessionId!, tabId: this.tabId }
    };
    this.broadcast(event);
  }

  private broadcast(event: SessionEvent): void {
    if (this.channel) {
      this.channel.postMessage(event);
    }
    
    // Also update localStorage for cross-tab sync (fallback and persistence)
    if (event.type === 'SESSION_CLAIM') {
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(event.payload));
      } catch (e) {
        // Storage might be full or disabled
      }
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    
    this.heartbeatInterval = window.setInterval(() => {
      if (this.isActive && this.sessionId) {
        const sessionInfo: SessionInfo = {
          sessionId: this.sessionId,
          roomId: this.roomId!,
          userId: this.userId!,
          tabId: this.tabId,
          timestamp: Date.now()
        };
        
        try {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionInfo));
        } catch (e) {
          // Storage error
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Check if there's an existing active session for this room/user
   */
  public checkExistingSession(roomId: string, userId: string): SessionInfo | null {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) return null;
      
      const sessionInfo: SessionInfo = JSON.parse(stored);
      
      // Check if it's for the same room/user and not stale
      if (
        sessionInfo.roomId === roomId && 
        sessionInfo.userId === userId &&
        Date.now() - sessionInfo.timestamp < SESSION_TIMEOUT
      ) {
        return sessionInfo;
      }
    } catch (e) {
      // Invalid or no stored session
    }
    return null;
  }

  /**
   * Claim a session - this will notify other tabs and take over
   */
  public claimSession(roomId: string, userId: string, onTakeover: () => void): string {
    // Check for existing session first
    const existing = this.checkExistingSession(roomId, userId);
    
    // Generate new session
    this.sessionId = this.generateSessionId();
    this.roomId = roomId;
    this.userId = userId;
    this.isActive = true;
    this.onTakeoverCallback = onTakeover;

    const sessionInfo: SessionInfo = {
      sessionId: this.sessionId,
      roomId,
      userId,
      tabId: this.tabId,
      timestamp: Date.now()
    };

    // Broadcast takeover event if there was an existing session
    if (existing && existing.tabId !== this.tabId) {
      console.log('[SessionManager] Taking over existing session:', existing.sessionId);
      this.broadcast({ type: 'SESSION_TAKEOVER', payload: sessionInfo });
    }

    // Claim the session
    this.broadcast({ type: 'SESSION_CLAIM', payload: sessionInfo });
    this.startHeartbeat();

    return this.sessionId;
  }

  /**
   * Release the current session
   */
  public releaseSession(): void {
    if (!this.sessionId) return;
    
    this.broadcast({ type: 'SESSION_RELEASE', payload: { sessionId: this.sessionId } });
    this.stopHeartbeat();
    
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      // Storage error
    }

    this.sessionId = null;
    this.roomId = null;
    this.userId = null;
    this.isActive = false;
    this.onTakeoverCallback = null;
  }

  /**
   * Check if this tab has the active session
   */
  public isSessionActive(): boolean {
    return this.isActive;
  }

  /**
   * Get current session info
   */
  public getSessionInfo(): SessionInfo | null {
    if (!this.isActive || !this.sessionId) return null;
    
    return {
      sessionId: this.sessionId,
      roomId: this.roomId!,
      userId: this.userId!,
      tabId: this.tabId,
      timestamp: Date.now()
    };
  }

  /**
   * Subscribe to session events
   */
  public subscribe(handler: SessionEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /**
   * Cleanup - call on component unmount
   */
  public destroy(): void {
    this.releaseSession();
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
  }
}

// Singleton instance
export const sessionManager = typeof window !== 'undefined' ? new SessionManager() : null;

// React hook for session management
export function useSessionManager() {
  return sessionManager;
}
