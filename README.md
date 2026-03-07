# Scrap Metal Protocol

A fast-paced 2.5D multiplayer modular brawler where players build, customize, and battle robots in physics-driven arenas. Robots have localized damage — destroy an arm and the weapon is gone, destroy a leg and the robot slows down.

## Tech Stack

| Layer | Technology |
|---|---|
| Rendering | React Three Fiber + Three.js |
| Physics | Rapier.js (`@react-three/rapier`) |
| State | Zustand (game) + React Context (UI) |
| Backend | Node.js + Fastify + TypeScript |
| Realtime | Socket.io (signaling) + WebRTC (P2P sync + voice) |
| Database | MongoDB + Mongoose |
| Build | Vite (client) + tsx (server dev) |

## Getting Started

```bash
npm install
npm run dev        # starts client (:5173) and server (:3001) concurrently
```

**Controls:** `A` / `D` — move &nbsp;|&nbsp; `Space` — jump

## Project Structure

```
ScrapeMetalProtocol/
├── docs/                        # PRD and PDD
├── packages/
│   ├── client/                  # React + R3F frontend
│   │   └── src/
│   │       ├── game/
│   │       │   ├── GameCanvas.tsx   # R3F Canvas + Error Boundary
│   │       │   ├── Arena.tsx        # Arena geometry + physics bodies
│   │       │   ├── Robot.tsx        # Player-controlled robot
│   │       │   └── useControls.ts   # Keyboard input hook
│   │       ├── store/
│   │       │   └── gameStore.ts     # Zustand global state
│   │       └── types/
│   │           └── game.ts          # All domain types
│   └── server/                  # Node.js + Fastify backend
│       └── src/
│           └── index.ts         # HTTP API + Socket.io matchmaking
├── package.json                 # npm workspaces root
└── tsconfig.base.json           # Shared TypeScript config
```

## Development Roadmap

| Sprint | Goal | Status |
|---|---|---|
| 1–2 | Core physics, controllable robot, test arena | ✅ Done |
| 3–4 | Localized damage, modular robot joints | Pending |
| 5–6 | WebRTC P2P sync, matchmaking, client-side prediction | Pending |
| 7–8 | Garage UI, MongoDB, voice chat | Pending |
| 9+ | Programmable bots, shaders, audio, V1.0 polish | Pending |

See [`docs/ScrapeMetal PRD.md`](docs/ScrapeMetal%20PRD.md) for full feature spec and [`docs/ScrapeMetal PDD.md`](docs/ScrapeMetal%20PDD.md) for architecture and coding standards.
