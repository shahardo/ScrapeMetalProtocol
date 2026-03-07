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

**Monorepo** with npm workspaces: `packages/client` and `packages/server`.

**Client** (`packages/client/src/`):
- `game/` — R3F components and game loop logic
- `store/gameStore.ts` — Zustand; single source of truth for match and player state
- `types/game.ts` — all domain interfaces; import from here, never inline types

**Server** (`packages/server/src/index.ts`):
- Fastify handles REST (auth, garage saves)
- Socket.io handles matchmaking signaling and (currently) input relay
- WebRTC P2P data channels will handle low-latency combat sync in Sprint 5-6

## Coding Standards (from PDD — non-negotiable)

- **No `any`** — all robot parts, API responses, and physics events must use the interfaces in `types/game.ts`
- **Pure functions for game logic** — damage calculations, physics math, and input processing must be side-effect-free and testable
- **Comment the *why*, not the what** — complex physics math and network sync logic needs explanatory comments; obvious code does not
- **Scoped changes** — when fixing a bug or adding a feature, do not refactor unrelated code
- **Test immediately** — every new backend function or pure game-logic function gets a test when written, not later
- **Visible fast** — new features should appear in the frontend as soon as possible; don't build invisible backend systems for multiple sprints

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

## Sprint Boundaries

Don't build ahead of the current sprint without flagging it.

- **Sprint 1-2 (done):** physics engine, controllable robot, test arena
- **Sprint 3-4 (next):** `RobotEntity` component system, joint attachments, impact listeners that break parts
- **Sprint 5-6:** Socket.io matchmaking, WebRTC DataChannels, client-side prediction
- **Sprint 7-8:** Garage UI, MongoDB schemas, voice chat (`getUserMedia`)
- **Sprint 9+:** Web Worker bot sandbox, shaders, audio, V1.0
