# CLAUDE.md — Scrap Metal Protocol

AI development guide. Read this before touching any code.

## Commands

```bash
npm run dev        # start client + server concurrently
npm run build      # production build (both packages)
npm run lint       # TypeScript type-check (both packages)
```

Client runs on `:5173`, server on `:3001`.

## Architecture

**Monorepo** with npm workspaces: `app/client` and `app/server`.

**Client** (`app/client/src/`):
- `auth/` — `useAuth` hook (JWT in localStorage) + `AuthModal` component
- `game/` — R3F components and game loop logic
- `game/ui/` — `GarageModal`, `ScoreboardModal`, `AdminConsole`
- `network/useNetworking.ts` — Socket.io + WebRTC hook; accepts `authToken` param
- `store/gameStore.ts` — Zustand; single source of truth for match and player state
- `types/game.ts` — all game domain interfaces; import from here, never inline types
- `types/auth.ts` — `AuthUser`, `LobbyEntry`, `ScoreEntry` types

**Server** (`app/server/src/`):
- `index.ts` — Fastify HTTP + Socket.io; lobby broadcast via `socketNames` Map
- `auth.ts` — `signToken` / `verifyToken` / `tryVerifyToken` (JWT helpers)
- `matchmaking.ts` — pure FIFO queue (`join`, `leave`, `tryPair`, `list`)
- `models/user.ts` — User schema (username, passwordHash, isAdmin)
- `models/score.ts` — Score schema (userId, username, score)
- `routes/auth.ts` — `POST /auth/register`, `POST /auth/login`
- `routes/scores.ts` — `GET /scores` (public), `POST /scores` (JWT required)
- `routes/admin.ts` — `GET/DELETE /admin/users`, `PATCH /admin/users/:id/promote` (admin JWT)
- WebRTC P2P DataChannel carries 20 Hz robot snapshots (`RobotSnapshot` type)

## Coding Standards (from PDD — non-negotiable)

- **No `any`** — all robot parts, API responses, and physics events must use the interfaces in `types/game.ts`
- **Pure functions for game logic** — damage calculations, physics math, and input processing must be side-effect-free and testable
- **Comment the *why*, not the what** — complex physics math and network sync logic needs explanatory comments; obvious code does not
- **Scoped changes** — when fixing a bug or adding a feature, do not refactor unrelated code
- **Test immediately** — every new backend function or pure game-logic function gets a test when written, not later
- **Visible fast** — new features should appear in the frontend as soon as possible; don't build invisible backend systems for multiple sprints
- **Minimal test runs** - when editting a file, run only the tests pertains to the modified code, not the whole project


## Key Design Decisions

**Controls use a ref, not state.**
`useControls` stores input in a `useRef` so the game loop reads it synchronously every frame without triggering React re-renders. Never move this to `useState`.

**Horizontal movement overrides velocity directly.**
`rb.setLinvel(...)` gives arcade-style instant response. Don't switch to force/impulse-based movement — it will feel floaty.

**Z position is reset every frame.**
The 2D plane constraint is enforced in `useFrame` by zeroing Z translation and velocity. This is more reliable than Rapier's `enabledTranslations` with compound colliders.

**Ground detection uses a contact counter.**
`groundContacts` is incremented on `onCollisionEnter` and decremented on `onCollisionExit`. Jump is gated on `groundContacts > 0`. Do not replace this with a Y-velocity heuristic.

**React Error Boundary wraps the Canvas.**
`GameErrorBoundary` in `GameCanvas.tsx` catches renderer and physics crashes, frees GPU memory, and shows a "SYSTEM REBOOT" modal. The game must never white-screen.

## Error Handling Rules

Every system must fail gracefully — see PDD Section 4 for full spec:
- Wrap the R3F `useFrame` body in try-catch; log the error and destroy only the offending entity
- All API calls need explicit timeouts and exponential backoff
- Voice chat mic denial must show "Mic Unavailable" and let the match continue
- User bot scripts must run in a sandboxed Web Worker with execution time limits

## Auth Design Decisions

**JWT stored in localStorage under `smp_auth`.**
The full `AuthUser` object (token, userId, username, isAdmin) is JSON-serialised. Cleared on logout. Do not store tokens in cookies or session storage.

**Auth is required to play.**
`App.tsx` renders `AuthModal` until `useAuth().user` is non-null. All game UI is gated. Guests are not supported — every socket is associated with a username.

**Socket auth is fire-and-forget.**
On `connect`, the client emits `authenticate(token)`. The server stores `socketId → username` in a `Map`. If absent or invalid, the socket still works but appears as `Pilot-<id>` in the lobby.

**Admin flag lives in the JWT.**
`isAdmin` is embedded at login time. Promote/demote via `PATCH /admin/users/:id/promote` issues a new token on next login. Revoking admin requires the user to log out and back in.

## Sprint Boundaries

Don't build ahead of the current sprint without flagging it.

- **Sprint 1-2 (done):** physics engine, controllable robot, test arena
- **Sprint 3-4 (done):** `RobotEntity` component system, joint attachments, impact listeners that break parts
- **Sprint 5-6 (done):** Socket.io matchmaking, WebRTC DataChannels, 20 Hz snapshot broadcast
- **Sprint 7-8 (done):** Garage UI, MongoDB schemas, weapons (gun + laser), voice chat
- **Sprint 9 (done):** JWT auth, waiting-room lobby, scoreboard, admin console
- **Sprint 10-12 (done):** Web Worker bot sandbox, extended weapons (shotgun/rocket/sniper), Garage 2.0, match lifecycle, radar HUD
- **Sprint 13 (done):** Positional Web Audio, post-processing (Bloom + ChromaticAberration), credits economy (earn per match, gate weapons in Garage)
- **Sprint 14 (next):** Garage 3.0 — full-screen loadout hub, robot preview canvas, weapon purchase flow, $ wallet, in-screen bot script editor (copy/paste only, no file loader, no install step), DEPLOY → arena flow; RUN/STOP bot button in arena HUD
- **Sprint 15+:** Additional arenas, TURN server, load testing, V1.0 deployment
