import { AuthSession, Room, RoomMode, Destination, Tier } from '@/types';

// Use environment variable or default to localhost
// Next.js uses NEXT_PUBLIC_ prefix for client-side env vars
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

// NOTE: OAuth is Phase 2 feature - currently all destinations use manual RTMP
// When OAuth is implemented, these endpoints will be Next.js API routes

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

    private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
        };

        const response = await fetch(`${API_BASE}${endpoint}`, {
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
    // ROOMS (Database-backed)
    // ==========================================

    static async createRoom(data: { owner_id: string; name: string; mode?: RoomMode; settings?: any }): Promise<Room> {
        return this.request<Room>('/rooms', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async listRooms(ownerId: string): Promise<{ rooms: Room[] }> {
        return this.request(`/rooms?owner_id=${ownerId}`);
    }

    static async updateRoom(roomId: string, data: Partial<Room>): Promise<Room> {
        return this.request('/rooms', {
            method: 'PATCH',
            body: JSON.stringify({ id: roomId, ...data })
        });
    }

    static async deleteRoom(roomId: string): Promise<void> {
        return this.request(`/rooms?id=${roomId}`, { method: 'DELETE' });
    }

    static async getParticipants(roomId: string): Promise<{ participants: any[] }> {
        return this.request(`/rooms/${roomId}/participants`);
    }

    // ==========================================
    // PROJECTS (Workspace-level partitioning)
    // ==========================================

    static async listProjects(userId: string): Promise<{ projects: any[] }> {
        return this.request(`/projects?user_id=${userId}`);
    }

    static async createProject(data: { organization_id: string; owner_id: string; name: string; description?: string }): Promise<any> {
        return this.request('/projects', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async updateProject(projectId: string, data: any): Promise<any> {
        return this.request('/projects', {
            method: 'PATCH',
            body: JSON.stringify({ id: projectId, ...data })
        });
    }

    static async deleteProject(projectId: string): Promise<void> {
        return this.request(`/projects?id=${projectId}`, { method: 'DELETE' });
    }

    // ==========================================
    // DESTINATIONS (Database-backed)
    // ==========================================

    static async listDestinations(userId: string): Promise<{ destinations: Destination[] }> {
        return this.request(`/destinations?user_id=${userId}`);
    }

    static async createDestination(data: {
        user_id: string;
        platform: string;
        name: string;
        rtmp_url: string;
        stream_key: string;
        room_id?: string;
    }): Promise<Destination> {
        return this.request('/destinations', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async updateDestination(destinationId: string, data: Partial<Destination>): Promise<Destination> {
        return this.request('/destinations', {
            method: 'PATCH',
            body: JSON.stringify({ id: destinationId, ...data })
        });
    }

    static async deleteDestination(destinationId: string): Promise<void> {
        return this.request(`/destinations?id=${destinationId}`, { method: 'DELETE' });
    }

    static async toggleDestination(destinationId: string, enabled: boolean): Promise<Destination> {
        return this.request('/destinations', {
            method: 'PATCH',
            body: JSON.stringify({ id: destinationId, enabled })
        });
    }

    // ==========================================
    // OAUTH (via Next.js API routes)
    // ==========================================
    // OAuth is available when provider env vars are configured
    // Falls back to manual RTMP entry when not configured

    /**
     * List available OAuth providers
     * Providers with is_configured=false should fallback to manual RTMP
     */
    static async listOAuthProviders(): Promise<{ providers: OAuthProvider[] }> {
        try {
            return await this.request<{ providers: OAuthProvider[] }>('/oauth/providers');
        } catch {
            // If OAuth routes not available, return empty (use manual RTMP)
            return { providers: [] };
        }
    }

    /**
     * List user's OAuth connections
     */
    static async listOAuthConnections(userId: string): Promise<{ connections: OAuthConnection[] }> {
        try {
            return await this.request<{ connections: OAuthConnection[] }>(`/oauth/connections?user_id=${userId}`);
        } catch {
            return { connections: [] };
        }
    }

    /**
     * Disconnect an OAuth account
     */
    static async disconnectOAuth(connectionId: string, userId: string): Promise<void> {
        await this.request(`/oauth/connections?id=${connectionId}&user_id=${userId}`, {
            method: 'DELETE'
        });
    }

    /**
     * Get RTMP destination info from OAuth connection
     */
    static async getStreamDestinationFromOAuth(connectionId: string, userId: string): Promise<StreamDestinationInfo> {
        const response = await this.request<{
            provider: string;
            provider_username: string;
            rtmp_url: string;
            stream_key: string;
        }>(`/oauth/connections/${connectionId}/destination?user_id=${userId}`);

        return {
            provider: response.provider,
            channel_id: response.provider,
            channel_name: response.provider_username,
            rtmp_url: response.rtmp_url,
            stream_key: response.stream_key,
            is_live: false,
        };
    }

    /**
     * Get OAuth authorization URL for a provider
     * Returns '#' if provider not configured (fallback to manual RTMP)
     */
    static getOAuthUrl(provider: string, userId: string, redirectUri = '/dashboard'): string {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        return `${baseUrl}/api/oauth/${provider}/authorize?user_id=${userId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    }

    /**
     * Create a destination from an OAuth connection
     */
    static async createDestinationFromOAuth(connectionId: string, userId: string): Promise<Destination> {
        // Get RTMP info from OAuth
        const rtmpInfo = await this.getStreamDestinationFromOAuth(connectionId, userId);

        // Create destination with the RTMP info
        return this.createDestination({
            user_id: userId,
            platform: rtmpInfo.provider,
            name: rtmpInfo.channel_name,
            rtmp_url: rtmpInfo.rtmp_url,
            stream_key: rtmpInfo.stream_key,
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
        });
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
        return this.request(`/users/${userId}/tier`);
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
        });
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
        return this.request(`/users/${userId}/tier/upgrade-options`);
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
        });
    }

    /**
     * Release a session
     */
    static async releaseSession(sessionId: string): Promise<{ success: boolean }> {
        return this.request(`/sessions/${sessionId}/release`, { method: 'POST' });
    }

    // ==========================================
    // ASSETS / LIBRARY
    // ==========================================

    /**
     * List all assets (recordings + uploads)
     */
    static async listAssets(userId: string): Promise<{ assets: any[] }> {
        return this.request(`/assets?user_id=${userId}`);
    }

    /**
     * Delete an asset
     */
    static async deleteAsset(assetId: string, type: 'recording' | 'upload'): Promise<void> {
        return this.request(`/assets?id=${assetId}&type=${type}`, { method: 'DELETE' });
    }

    /**
     * Heartbeat for session keepalive
     */
    static async sessionHeartbeat(sessionId: string): Promise<{ success: boolean; active: boolean }> {
        return this.request(`/sessions/${sessionId}/heartbeat`, { method: 'POST' });
    }
}
