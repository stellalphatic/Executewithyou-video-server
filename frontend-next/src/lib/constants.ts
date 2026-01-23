'use client';

import { createClient } from '@supabase/supabase-js';

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export const WEBSOCKET_URL = process.env.NEXT_PUBLIC_ALLSTRM_WS_URL || 'ws://localhost:8080/ws';

// Local Supabase configuration (self-hosted)
// Anon key for local dev (matches kong.yml)
export const LOCAL_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// IMPORTANT: In Docker, the frontend runs in a container
// The browser makes requests from the HOST machine, not from inside the container
// So we always use localhost:8000 for browser-side requests
// The docker-compose network names (supabase-kong) are only for server-to-server communication
export const LOCAL_SUPABASE_URL = "http://localhost:8000";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || LOCAL_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || LOCAL_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// For checking if using local supabase
export const IS_LOCAL_SUPABASE = !process.env.NEXT_PUBLIC_SUPABASE_URL;
