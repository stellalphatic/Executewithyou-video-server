# Terminal 1: Supabase
export PATH="$HOME/.local/bin:$PATH"
supabase start

# Terminal 2: LiveKit stack  
docker-compose up -d livekit redis egress minio

# Terminal 3: Frontend
cd frontend-next && npm run dev