# ALLSTRM Frontend

Built with **Next.js 16**, **TailwindCSS**, and **TypeScript**. This application serves as the user interface for the ALLSTRM platform, handling Meetings (WebRTC), Studio (Streaming), and Dashboard (Management).

## Getting Started

> [!IMPORTANT]
> The primary way to run this application is via the **root Docker Compose**.
> Please do not run `npm run dev` manually unless you are strictly working on UI components without backend dependencies.

### Run with Backend (Recommended)

From the project root (`allstrm-backend/`):

```bash
make dev
```

This starts the frontend container with volume mounting, enabling **Hot Module Replacement (HMR)**. You can edit files in `frontend-next/src` and see changes immediately at [http://localhost:3000](http://localhost:3000).

## Project Structure

```bash
frontend-next/
├── src/
│   ├── app/           # App Router (Pages & Layouts)
│   ├── components/    # Reusable UI Components
│   ├── hooks/         # Custom React Hooks (useAllstrm, useMeetingUI)
│   ├── lib/
│   │   ├── api.ts     # REST API Client
│   │   └── engines/   # WebRTC & WebSocket Logic (SignalClient, WebRTCManager)
│   ├── types/         # TypeScript Interfaces
│   └── utils/         # Helper functions
```

## Key Technologies

- **Next.js 16**: App Router, Server Actions.
- **Supabase**: Authentication & Database.
- **WebRTC**: Real-time media (managed by `SFUWebRTCManager`).
- **WebSocket**: Signaling (managed by `SignalClient`).
- **TailwindCSS**: Styling.

## Environment Variables

The Docker environment automatically injects these variables. For reference, or if you must run locally:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080/api
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
