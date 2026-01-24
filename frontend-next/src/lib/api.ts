import { AuthSession, Room, RoomMode, Destination, Tier } from '@/types';

// Use environment variable or default to localhost
// Next.js uses NEXT_PUBLIC_ prefix for client-side env vars
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';
// Core service URL for OAuth (OAuth routes are on core service directly)
const CORE_API_BASE = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:8081/api';

export interface OAuthProvider {
    name: string;
    display_name: string;
    icon: string;
    is_configured: boolean;
}

export interface OAuthConnection {
    id: string;
    provider: string;
    provider_user_id: string;
    provider_username?: string;
    provider_display_name?: string;
    is_active: boolean;
    created_at: string;
}

export interface StreamDestinationInfo {
    provider: string;
    channel_id: string;
    channel_name: string;
    rtmp_url: string;
    stream_key: string;
    backup_rtmp_url?: string;
    title?: string;
    is_live: boolean;
}

export interface StreamSession {
    room_id: string;
    state: 'idle' | 'connecting' | 'live' | 'stopping' | 'ended';
    stream_key: string;
    hls_enabled: boolean;
    recording_enabled: boolean;
    started_at?: string;
}

export class ApiClient {
    private static token: string | null = null;

    static setToken(token: string) {
        this.token = token;
    }

    static getToken(): string | null {
        return this.token;
    }

    private static async request<T>(endpoint: string, options: RequestInit = {}, useCore = false): Promise<T> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
        };

        const baseUrl = useCore ? CORE_API_BASE : API_BASE;
        const response = await fetch(`${baseUrl}${endpoint}`, {
            ...options,
            headers: { ...headers, ...options.headers }
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `API Error: ${response.statusText}`);
        }

        if (response.status === 204) return {} as T;
        return response.json();
    }

    // ==========================================
    // ROOMS
    // ==========================================

    static async createRoom(data: { owner_id: string; name: string; mode: RoomMode }): Promise<Room> {
        return this.request<Room>('/rooms', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async listRooms(ownerId: string, limit = 20, offset = 0): Promise<{ rooms: Room[] }> {
        return this.request(`/rooms?owner_id=${ownerId}&limit=${limit}&offset=${offset}`);
    }

    static async getRoom(roomId: string): Promise<Room> {
        return this.request(`/rooms/${roomId}`);
    }

    static async updateRoom(roomId: string, data: Partial<Room>): Promise<Room> {
        return this.request(`/rooms/${roomId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    static async deleteRoom(roomId: string): Promise<void> {
        return this.request(`/rooms/${roomId}`, { method: 'DELETE' });
    }

    static async joinRoom(roomId: string, joinCode?: string): Promise<AuthSession> {
        return this.request<AuthSession>(`/rooms/${roomId}/join`, {
            method: 'POST',
            body: JSON.stringify({ join_code: joinCode })
        });
    }

    // static async joinRoom(roomId: string, displayName: string): Promise<AuthSession> {
    //     return this.request<AuthSession>(`/rooms/${roomId}/join`, {
    //         method: 'POST',
    //         body: JSON.stringify({ display_name: displayName })
    //     });
    // }

    static async getParticipants(roomId: string): Promise<{ participants: any[] }> {
        return this.request(`/rooms/${roomId}/participants`);
    }

    // ==========================================
    // DESTINATIONS
    // ==========================================

    static async listDestinations(roomId: string): Promise<{ destinations: Destination[] }> {
        return this.request(`/rooms/${roomId}/destinations`);
    }

    static async createDestination(roomId: string, data: {
        platform: string;
        name: string;
        rtmp_url: string;
        stream_key: string;
    }): Promise<Destination> {
        return this.request(`/rooms/${roomId}/destinations`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async getDestination(roomId: string, destinationId: string): Promise<Destination> {
        return this.request(`/rooms/${roomId}/destinations/${destinationId}`);
    }

    static async updateDestination(roomId: string, destinationId: string, data: Partial<Destination>): Promise<Destination> {
        return this.request(`/rooms/${roomId}/destinations/${destinationId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    static async deleteDestination(roomId: string, destinationId: string): Promise<void> {
        return this.request(`/rooms/${roomId}/destinations/${destinationId}`, { method: 'DELETE' });
    }

    static async toggleDestination(roomId: string, destinationId: string): Promise<Destination> {
        return this.request(`/rooms/${roomId}/destinations/${destinationId}/toggle`, { method: 'POST' });
    }

    // ==========================================
    // OAUTH (uses core service directly)
    // ==========================================

    static async listOAuthProviders(): Promise<{ providers: OAuthProvider[] }> {
        return this.request('/oauth/providers', {}, true);
    }

    static async listOAuthConnections(userId: string): Promise<{ connections: OAuthConnection[] }> {
        return this.request(`/oauth/connections?user_id=${userId}`, {}, true);
    }

    static async disconnectOAuth(connectionId: string): Promise<void> {
        return this.request(`/oauth/connections/${connectionId}`, { method: 'DELETE' }, true);
    }

    static async getStreamDestinationFromOAuth(connectionId: string): Promise<StreamDestinationInfo> {
        return this.request(`/oauth/connections/${connectionId}/destination`, {}, true);
    }

    /**
     * Get the OAuth authorization URL for a provider
     * Redirects user to provider's consent page (uses core service)
     */
    static getOAuthUrl(provider: string, userId: string, redirectUri = '/dashboard'): string {
        const params = new URLSearchParams({
            user_id: userId,
            redirect_uri: redirectUri
        });
        return `${CORE_API_BASE}/oauth/${provider}/authorize?${params}`;
    }

    /**
     * Create destination from OAuth connection (fetches RTMP URL/key automatically)
     */
    static async createDestinationFromOAuth(roomId: string, connectionId: string): Promise<Destination> {
        const streamInfo = await this.getStreamDestinationFromOAuth(connectionId);
        return this.createDestination(roomId, {
            platform: streamInfo.provider,
            name: streamInfo.channel_name,
            rtmp_url: streamInfo.rtmp_url,
            stream_key: streamInfo.stream_key
        });
    }

    // ==========================================
    // STREAM SERVICE
    // ==========================================

    static async createStreamSession(roomId: string): Promise<StreamSession> {
        return this.request('/stream/sessions', {
            method: 'POST',
            body: JSON.stringify({ room_id: roomId })
        });
    }

    static async getStreamSession(roomId: string): Promise<StreamSession> {
        return this.request(`/stream/sessions/${roomId}`);
    }

    static async startStream(roomId: string): Promise<StreamSession> {
        return this.request(`/stream/sessions/${roomId}/start`, { method: 'POST' });
    }

    static async startBroadcastOrchestration(roomId: string, trackId: string): Promise<{ success: boolean; stream_port: number }> {
        return this.request(`/rooms/${roomId}/broadcast/start`, {
            method: 'POST',
            body: JSON.stringify({ track_id: trackId })
        }, true); // useCore = true
    }

    static async stopStream(roomId: string): Promise<StreamSession> {
        return this.request(`/stream/sessions/${roomId}/stop`, { method: 'POST' });
    }

    static async setStreamLayout(roomId: string, layout: {
        preset: string;
        positions?: Array<{ source_id: string; x: number; y: number; width: number; height: number }>;
    }): Promise<void> {
        return this.request(`/stream/sessions/${roomId}/layout`, {
            method: 'POST',
            body: JSON.stringify(layout)
        });
    }

    static async startDestinationRelay(roomId: string, destinationId: string): Promise<void> {
        return this.request(`/stream/sessions/${roomId}/destinations/${destinationId}/start`, { method: 'POST' });
    }

    static async stopDestinationRelay(roomId: string, destinationId: string): Promise<void> {
        return this.request(`/stream/sessions/${roomId}/destinations/${destinationId}/stop`, { method: 'POST' });
    }

    // ==========================================
    // USERS
    // ==========================================

    static async getUser(userId: string): Promise<any> {
        return this.request(`/users/${userId}`);
    }

    static async createApiKey(userId: string, data: { name: string; scopes: string[]; expires_in_days?: number }): Promise<{ key: string; id: string }> {
        return this.request(`/users/${userId}/api-keys`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async listApiKeys(userId: string): Promise<{ api_keys: any[] }> {
        return this.request(`/users/${userId}/api-keys`);
    }

    static async revokeApiKey(userId: string, keyId: string): Promise<void> {
        return this.request(`/users/${userId}/api-keys/${keyId}`, { method: 'DELETE' });
    }

    // ==========================================
    // STORAGE / RECORDINGS
    // ==========================================

    static async listRecordings(roomId: string): Promise<{ recordings: any[] }> {
        return this.request(`/recordings?room_id=${roomId}`);
    }

    static async getRecording(recordingId: string): Promise<any> {
        return this.request(`/recordings/${recordingId}`);
    }

    static async deleteRecording(recordingId: string): Promise<void> {
        return this.request(`/recordings/${recordingId}`, { method: 'DELETE' });
    }

    static async getUploadUrl(data: {
        room_id: string;
        filename: string;
        content_type: string;
        size_bytes: number;
    }): Promise<{ upload_url: string; asset_id: string }> {
        return this.request('/upload/sign', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async completeUpload(assetId: string): Promise<void> {
        return this.request('/upload/complete', {
            method: 'POST',
            body: JSON.stringify({ asset_id: assetId })
        });
    }

    // ==========================================
    // TIER / SUBSCRIPTION
    // ==========================================

    /**
     * Get user's current tier and limits
     */
    static async getUserTier(userId: string): Promise<{
        tier: Tier;
        limits: {
            max_stage_participants: number;
            max_total_participants: number;
            max_destinations: number;
            max_recording_duration_minutes: number;
            recording_enabled: boolean;
            iso_recording_enabled: boolean;
            custom_rtmp_allowed: boolean;
            max_resolution: string;
            max_concurrent_streams: number;
        };
        subscription?: {
            plan_id: string;
            status: 'active' | 'canceled' | 'past_due' | 'trialing';
            current_period_end: string;
        };
    }> {
        return this.request(`/users/${userId}/tier`, {}, true);
    }

    /**
     * Validate if an action is allowed based on user's tier
     */
    static async validateTierAction(userId: string, action: string, context: Record<string, any>): Promise<{
        allowed: boolean;
        reason?: string;
        upgrade_suggestion?: {
            tier: Tier;
            message: string;
        };
    }> {
        return this.request(`/users/${userId}/tier/validate`, {
            method: 'POST',
            body: JSON.stringify({ action, context })
        }, true);
    }

    /**
     * Get available upgrade options for a user
     */
    static async getUpgradeOptions(userId: string): Promise<{
        current_tier: Tier;
        options: Array<{
            tier: Tier;
            name: string;
            price_monthly: number;
            price_yearly: number;
            highlights: string[];
        }>;
    }> {
        return this.request(`/users/${userId}/tier/upgrade-options`, {}, true);
    }

    // ==========================================
    // SESSION MANAGEMENT
    // ==========================================

    /**
     * Register a new session (single session enforcement)
     */
    static async registerSession(userId: string, roomId: string, sessionId: string): Promise<{
        success: boolean;
        previous_session_terminated?: boolean;
    }> {
        return this.request('/sessions/register', {
            method: 'POST',
            body: JSON.stringify({ user_id: userId, room_id: roomId, session_id: sessionId })
        }, true);
    }

    /**
     * Release a session
     */
    static async releaseSession(sessionId: string): Promise<{ success: boolean }> {
        return this.request(`/sessions/${sessionId}/release`, { method: 'POST' }, true);
    }

    /**
     * Heartbeat for session keepalive
     */
    static async sessionHeartbeat(sessionId: string): Promise<{ success: boolean; active: boolean }> {
        return this.request(`/sessions/${sessionId}/heartbeat`, { method: 'POST' }, true);
    }
}
