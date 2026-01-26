# AllStrm Phase 1 Implementation Plan

> **Last Updated:** January 25, 2026  
> **Status:** Phase 1 ~70% Complete

---

## Current State Summary

### ✅ Fully Working
| Feature | Implementation | Notes |
|---------|---------------|-------|
| Authentication | Supabase Auth | signup, login, logout, session management |
| LiveKit Video/Audio | LiveKit SDK | camera, mic, connection state |
| Waiting Room | DataChannel messages | host admits guests via metadata |
| Screen Sharing | LiveKit SDK | native screen share |
| Presentations | Canvas API + PDF.js | file upload, slide navigation |
| Local Recording | MediaRecorder + Canvas | WYSIWYG composite at 1920x1080 |
| RTMP Broadcast | LiveKit Egress API | multi-destination streaming |
| OAuth Framework | Next.js API routes | routes exist, needs env vars |

### 🟡 Partially Working (Needs Database Integration)
| Feature | Current State | Issue |
|---------|--------------|-------|
| Destinations | localStorage | Should be in `stream.destinations` table |
| Cloud Recording | Egress API calls | Table names don't match schema |
| Rooms | Ephemeral (LiveKit) | Should persist to `core.rooms` |

### ❌ Stubbed/Mocked
| Feature | Current State | Required |
|---------|--------------|----------|
| Subscription Tiers | Hardcoded `Tier.PRO` | Fetch from DB or Stripe |
| User Profile | Mock data | Connect to `core.users` |
| Team Settings | Mock data | Connect to `core.organizations` |
| Billing/Payments | Alert stubs | Stripe integration |

---

## Implementation Tasks

### Phase 1A: Critical Path (HIGH Priority)

#### Task 1: Fix Subscription Tier Lookup
**Time Estimate:** 2-3 hours

**Problem:** Tier is hardcoded to `PRO` in AuthContext.tsx line 36

**Files to Modify:**
- `frontend-next/src/contexts/AuthContext.tsx`

**Files to Create:**
- `frontend-next/src/app/api/users/[userId]/tier/route.ts`

**Implementation:**

1. Create tier API route:
```typescript
// /api/users/[userId]/tier/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get user's organization and billing tier
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      organizations (
        billing_tier
      )
    `)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // Default to free tier if no org
    return NextResponse.json({ tier: 'free' });
  }

  return NextResponse.json({ 
    tier: data.organizations?.billing_tier || 'free' 
  });
}
```

2. Update AuthContext to fetch tier:
```typescript
// In AuthContext.tsx, replace hardcoded tier with:
useEffect(() => {
  if (user?.id) {
    fetch(`/api/users/${user.id}/tier`)
      .then(res => res.json())
      .then(data => setSubscriptionTier(data.tier as Tier))
      .catch(() => setSubscriptionTier(Tier.FREE));
  }
}, [user?.id]);
```

---

#### Task 2: Move Destinations to Database
**Time Estimate:** 3-4 hours

**Problem:** Destinations stored in localStorage, not synced across devices

**Files to Create:**
- `frontend-next/src/app/api/destinations/route.ts`

**Files to Modify:**
- `frontend-next/src/components/Destinations.tsx`
- `frontend-next/src/hooks/useAllstrmLiveKit.ts`

**Database Table:** `stream.destinations` (already in schema)

**Implementation:**

1. Create destinations API:
```typescript
// /api/destinations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/destinations?user_id=xxx
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('user_id');
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('destinations')
    .select('*')
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ destinations: data });
}

// POST /api/destinations
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { user_id, platform, name, rtmp_url, stream_key } = body;

  const { data, error } = await supabase
    .from('destinations')
    .insert({
      user_id,
      platform,
      name,
      rtmp_url,
      stream_key,
      enabled: true
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/destinations?id=xxx
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('destinations')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

2. Add `user_id` column to destinations table if not exists:
```sql
-- Migration: Add user_id to destinations
ALTER TABLE stream.destinations 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_destinations_user_id 
ON stream.destinations(user_id);
```

3. Update Destinations.tsx:
- Replace `localStorage.getItem('allstrm_destinations')` with API calls
- Add `useEffect` to fetch destinations on mount
- Update add/remove handlers to call API

---

#### Task 3: Room Persistence (Optional for MVP)
**Time Estimate:** 2-3 hours

**Problem:** Rooms are ephemeral - dashboard can't show previous rooms

**Files to Create:**
- `frontend-next/src/app/api/rooms/route.ts`

**Database Table:** `core.rooms` (already in schema)

**Implementation:**

1. Create rooms API:
```typescript
// /api/rooms/route.ts
// GET - list user's rooms
// POST - create new room
// DELETE - delete room
```

2. Update dashboard to fetch rooms:
```typescript
// In dashboard/page.tsx
const { data: rooms } = await fetch(`/api/rooms?owner_id=${user.id}`);
```

3. Create room on studio entry (if not exists):
```typescript
// In studio page or useAllstrmLiveKit
const createRoom = async (name: string) => {
  await fetch('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ 
      owner_id: user.id, 
      name, 
      mode: 'studio' 
    })
  });
};
```

---

### Phase 1B: Polish (MEDIUM Priority)

#### Task 4: Fix Table Schema References
**Time Estimate:** 1 hour

**Problem:** API routes use wrong table names

**Files to Modify:**
- `frontend-next/src/app/api/egress/start/route.ts`
- `frontend-next/src/app/api/egress/stop/route.ts`

**Changes:**
| Current | Should Be |
|---------|-----------|
| `recordings` | `assets.recordings` |
| `egress_jobs` | Create table or use existing |
| `destinations` | `stream.destinations` |

---

#### Task 5: Test Cloud Recording E2E
**Time Estimate:** 2-3 hours

**Dependencies:**
- MinIO running (docker-compose)
- Egress service running
- Correct S3 credentials in egress.yaml

**Test Steps:**
1. Start a studio session
2. Enable cloud recording
3. Verify file appears in MinIO
4. Verify database record created
5. Test download from recordings list

---

#### Task 6: OAuth Environment Setup
**Time Estimate:** 1-2 hours per platform

**Steps for each platform:**

1. **YouTube:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create OAuth 2.0 credentials
   - Add callback: `http://localhost:3000/api/oauth/youtube/callback`
   - Enable YouTube Data API v3
   - Set env vars: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`

2. **Twitch:**
   - Go to [Twitch Developer Console](https://dev.twitch.tv/console)
   - Create application
   - Add callback: `http://localhost:3000/api/oauth/twitch/callback`
   - Set env vars: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`

3. **Facebook:** Requires app review for `publish_video` permission

---

### Phase 1C: Monetization (LOW Priority - Post-Launch)

#### Task 7: Stripe Integration
**Time Estimate:** 8-12 hours

**Components:**
1. Stripe Checkout for subscription signup
2. Stripe Customer Portal for management
3. Webhook handler for subscription events
4. Database updates on tier changes

**Files to Create:**
- `/api/stripe/checkout/route.ts`
- `/api/stripe/portal/route.ts`
- `/api/stripe/webhook/route.ts`

---

#### Task 8: Profile Settings
**Time Estimate:** 2-3 hours

**Files to Modify:**
- `frontend-next/src/components/AccountSettings.tsx`

**Implementation:**
- Fetch profile from `/api/users/{id}`
- Save changes to `core.users` table
- Update Supabase auth metadata

---

#### Task 9: Team Management
**Time Estimate:** 4-6 hours

**Features:**
- Invite team members
- Role management (owner, admin, member)
- Organization settings

---

## Quick Reference: Database Tables

### Currently Used
| Table | Used By | Purpose |
|-------|---------|---------|
| `auth.users` | Supabase Auth | User authentication |
| `oauth_connections` | OAuth routes | Platform tokens |

### Should Be Used (currently stubbed)
| Table | Should Be Used By | Purpose |
|-------|-------------------|---------|
| `core.users` | Profile settings | User metadata |
| `core.organizations` | Tier lookup | Billing tier |
| `core.organization_members` | Team management | User-org mapping |
| `core.rooms` | Dashboard, Studio | Room persistence |
| `stream.destinations` | Destinations component | RTMP configs |
| `assets.recordings` | Recording list | Cloud recordings |

---

## Environment Variables Required

### Core (Already Set)
```env
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### Required for Full Functionality
```env
# For server-side DB operations
SUPABASE_SERVICE_ROLE_KEY=...

# For OAuth (optional - falls back to manual RTMP)
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...

# For Stripe (Phase 1C)
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
```

---

## Testing Checklist

### Phase 1A Completion
- [ ] User tier fetched from database (not hardcoded)
- [ ] Destinations saved to database
- [ ] Destinations load on page refresh
- [ ] Destinations sync across devices

### Phase 1B Completion
- [ ] Cloud recording saves to MinIO
- [ ] Recording appears in dashboard
- [ ] OAuth flow works for YouTube
- [ ] OAuth flow works for Twitch

### Phase 1C Completion
- [ ] Stripe checkout creates subscription
- [ ] Webhook updates user tier
- [ ] Profile changes persist
- [ ] Team invites work

---

## Estimated Timeline

| Phase | Tasks | Time | Priority |
|-------|-------|------|----------|
| 1A | Tier lookup, Destinations DB | 1-2 days | HIGH |
| 1B | Schema fixes, Cloud recording, OAuth | 2-3 days | MEDIUM |
| 1C | Stripe, Profile, Teams | 3-5 days | LOW |

**Total to Production-Ready:** ~1-2 weeks

---

## Notes

1. **localStorage fallback**: Keep localStorage as offline fallback for destinations
2. **Tier caching**: Cache tier in localStorage to avoid API calls on every page
3. **Error handling**: All API routes need proper error handling and validation
4. **RLS policies**: Ensure Supabase RLS policies allow operations
