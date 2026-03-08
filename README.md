# Scrap Metal Protocol

A fast-paced 2.5D multiplayer modular brawler where players build, customize, and battle robots in physics-driven arenas. Robots have localized damage — destroy an arm and the weapon is gone, destroy a leg and the robot slows down.

## Tech Stack

| Layer | Technology |
|---|---|
| Rendering | React Three Fiber + Three.js |
| Physics | Rapier.js (`@react-three/rapier`) |
| State | Zustand (game store) |
| Auth | JWT (bcryptjs + jsonwebtoken) |
| Backend | Node.js + Fastify + TypeScript |
| Realtime | Socket.io (signaling + lobby) + WebRTC (P2P game sync + voice) |
| Database | MongoDB + Mongoose |
| Build | Vite (client) + tsx (server dev) |

## Getting Started

```bash
npm install
npm run dev        # starts client (:5173) and server (:3001) concurrently
```

Open `http://localhost:5173`, register an account, and click **FIND MATCH**.

**Controls:** `W/S` — walk &nbsp;|&nbsp; `A/D` — rotate &nbsp;|&nbsp; `Space` — jump &nbsp;|&nbsp; `↑↓←→` — camera &nbsp;|&nbsp; `F` — gun &nbsp;|&nbsp; `L` — laser &nbsp;|&nbsp; `G` — garage &nbsp;|&nbsp; `T` — scoreboard

## Authentication

Players must register and log in before playing. Credentials are stored in MongoDB; passwords are bcrypt-hashed. A signed JWT (7-day expiry) is persisted in `localStorage` and sent to the Socket.io server on connect so the lobby can display usernames.

## REST API

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | — | Create account → returns JWT |
| `POST` | `/auth/login` | — | Login → returns JWT |
| `GET` | `/scores` | — | Top 20 all-time scores |
| `POST` | `/scores` | Bearer JWT | Submit a match score |
| `GET` | `/garage/:userId` | — | List saved robots |
| `POST` | `/garage/:userId` | — | Save robot config |
| `DELETE` | `/garage/:userId/:robotId` | — | Delete robot |
| `GET` | `/admin/users` | Admin JWT | List all users |
| `DELETE` | `/admin/users/:id` | Admin JWT | Delete a user |
| `PATCH` | `/admin/users/:id/promote` | Admin JWT | Toggle admin status |

## Project Structure

```
ScrapeMetalProtocol/
├── docs/                        # PRD and PDD
├── app/
│   ├── client/                  # React + R3F frontend
│   │   └── src/
│   │       ├── auth/
│   │       │   ├── useAuth.ts          # Login/register/logout hook
│   │       │   └── AuthModal.tsx       # Login/register UI
│   │       ├── game/
│   │       │   ├── GameCanvas.tsx      # R3F Canvas + Error Boundary
│   │       │   ├── Arena.tsx           # Arena geometry + physics bodies
│   │       │   ├── RemoteRobotEntity.tsx
│   │       │   ├── robot/
│   │       │   │   └── RobotEntity.tsx # Modular robot with breakable joints
│   │       │   ├── weapons/
│   │       │   │   └── WeaponSystem.tsx
│   │       │   └── ui/
│   │       │       ├── GarageModal.tsx
│   │       │       ├── ScoreboardModal.tsx  # Top-20 leaderboard (toggle T)
│   │       │       └── AdminConsole.tsx     # User management (admin only)
│   │       ├── network/
│   │       │   └── useNetworking.ts    # Socket.io + WebRTC hook
│   │       ├── store/
│   │       │   └── gameStore.ts        # Zustand global state
│   │       └── types/
│   │           ├── game.ts             # All game domain types
│   │           └── auth.ts             # Auth / lobby / score types
│   └── server/                  # Node.js + Fastify backend
│       └── src/
│           ├── index.ts               # HTTP API + Socket.io + lobby
│           ├── auth.ts                # JWT sign / verify helpers
│           ├── matchmaking.ts         # Pure FIFO queue
│           ├── models/
│           │   ├── user.ts            # User schema (username, passwordHash, isAdmin)
│           │   ├── score.ts           # Score schema (userId, username, score)
│           │   └── robotConfig.ts     # Robot config schema
│           └── routes/
│               ├── auth.ts            # /auth/register, /auth/login
│               ├── scores.ts          # /scores
│               ├── admin.ts           # /admin/users
│               └── garage.ts          # /garage/:userId
├── package.json                 # npm workspaces root
└── tsconfig.base.json           # Shared TypeScript config
```

## Development Roadmap

| Sprint | Goal | Status |
|---|---|---|
| 1–2 | Core physics, controllable robot, test arena | ✅ Done |
| 3–4 | Localized damage, modular robot joints | ✅ Done |
| 5–6 | WebRTC P2P sync, matchmaking, voice chat | ✅ Done |
| 7–8 | Garage UI, MongoDB, weapons (gun + laser) | ✅ Done |
| 9 | Auth, lobby, scoreboard, admin console | ✅ Done |
| 10+ | Programmable bots, shaders, audio, V1.0 polish | Pending |

See [`docs/ScrapeMetal PRD.md`](docs/ScrapeMetal%20PRD.md) for full feature spec and [`docs/ScrapeMetal PDD.md`](docs/ScrapeMetal%20PDD.md) for architecture and coding standards.
