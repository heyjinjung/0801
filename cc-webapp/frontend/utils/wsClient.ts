/**
 * WebSocket 클라이언트 유틸리티
 * 실시간 전역 동기화를 위한 WebSocket 연결 관리
 */

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: string;
}

export interface SyncEventData {
  profile_update?: {
    user_id: number;
    gold?: number;
    exp?: number;
    tier?: string;
    total_spent?: number;
  };
  user_action?: {
    user_id: number;
    action_type: string;
    action_data?: Record<string, any>;
    created_at?: string; // 서버가 보낼 수 있는 경우, 없으면 클라이언트 수신 시각 사용
  };
  purchase_update?: {
    user_id: number;
    status: 'pending' | 'success' | 'failed' | 'idempotent_reuse';
    product_id?: string;
    receipt_code?: string;
    amount?: number; // cents or in-app currency depending on product
    reason_code?: string; // when failed
  };
  achievement_progress?: {
    user_id: number;
    achievement_id: number;
    progress: number;
    unlocked: boolean;
    achievement_type?: string;
  };
  streak_update?: {
    user_id: number;
    action_type: string;
    current_count: number;
    last_action_date: string;
  };
  event_progress?: {
    user_id: number;
    event_id: number;
    progress: Record<string, any>;
    completed: boolean;
  };
  reward_granted?: {
    user_id: number;
    reward_type: string;
    reward_data: Record<string, any>;
    source: string;
  };
  stats_update?: {
    user_id: number;
    game_type?: string;
    stats: Record<string, any>;
  };
}

export type SyncEventType = keyof SyncEventData;

export interface WSClientOptions {
  url: string;
  token?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (message: WebSocketMessage) => void;
  onError?: (error: Event) => void;
  onReconnecting?: (attempt: number) => void;
}

export class WSClient {
  private ws: WebSocket | null = null;
  private options: WSClientOptions & {
    reconnectInterval: number;
    maxReconnectAttempts: number;
    heartbeatInterval: number;
    onConnect: () => void;
    onDisconnect: () => void;
    onMessage: (message: WebSocketMessage) => void;
    onError: (error: Event) => void;
    onReconnecting: (attempt: number) => void;
  };
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private isConnecting = false;
  private isManualClose = false;

  constructor(options: WSClientOptions) {
    this.options = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      onConnect: () => {},
      onDisconnect: () => {},
      onMessage: () => {},
      onError: () => {},
      onReconnecting: () => {},
      ...options
    };
  }

  connect(): Promise<void> {
    if (this.isConnecting || this.isConnected()) {
      return Promise.resolve();
    }

    this.isConnecting = true;
    this.isManualClose = false;

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.buildWebSocketUrl();
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[WSClient] Connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.options.onConnect();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.options.onMessage(message);
          } catch (error) {
            console.error('[WSClient] Invalid message format:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('[WSClient] Disconnected', event.code, event.reason);
          this.isConnecting = false;
          this.cleanup();
          this.options.onDisconnect();

          // 수동 종료가 아니면 재연결 시도
          if (!this.isManualClose && this.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('[WSClient] Error:', error);
          this.isConnecting = false;
          this.options.onError(error);
          reject(error);
        };

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.isManualClose = true;
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
  }

  send(message: WebSocketMessage): boolean {
    if (!this.isConnected()) {
      console.warn('[WSClient] Cannot send message - not connected');
      return false;
    }

    try {
      this.ws!.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[WSClient] Send error:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getReadyState(): number | null {
    return this.ws?.readyState ?? null;
  }

  private buildWebSocketUrl(): string {
    const { url, token } = this.options;
    const wsUrl = url.replace(/^http/, 'ws');
    
    if (token) {
      const separator = wsUrl.includes('?') ? '&' : '?';
      return `${wsUrl}${separator}token=${encodeURIComponent(token)}`;
    }
    
    return wsUrl;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping', data: {} });
      }
    }, this.options.heartbeatInterval);
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    this.options.onReconnecting(this.reconnectAttempts);
    
    console.log(`[WSClient] Reconnecting in ${this.options.reconnectInterval}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
    
    this.reconnectTimer = window.setTimeout(() => {
      this.connect().catch(error => {
        console.error('[WSClient] Reconnection failed:', error);
      });
    }, this.options.reconnectInterval);
  }
}

/**
 * WebSocket 클라이언트 팩토리 함수
 */
export function createWSClient(options: WSClientOptions): WSClient {
  return new WSClient(options);
}
