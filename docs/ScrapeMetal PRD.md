# Product Requirements Document (PRD)

## Project Name: Scrap Metal Protocol (SMP)

**Genre:** 2.5D Multiplayer Modular Brawler

**Platform:** Web Browser (Desktop & Mobile)

**Tech Stack:** React Three Fiber, Three.js, Rapier.js, Node.js, WebSockets, WebRTC

## Executive Summary & Vision

**Scrap Metal Protocol** is a fast-paced, 2.5D multiplayer combat game where players build, customize, and battle modular robots in dynamic, hazard-filled 3D arenas. Combining the tight controls of classic platform fighters (e.g., *Super Smash Bros*) with deep customization and programmable AI, SMP offers a highly replayable, physics-driven web gaming experience.

## Core Gameplay Loop

1. **Build:** Players construct their robots in the Garage using parts collected from battles (chassis, arms, legs, weapons).
2. **Deploy (Manual or AI):** Players choose to either pilot their robot manually in real-time PvP or deploy a user-programmed AI script to fight autonomously.
3. **Battle:** Engage in physics-based combat in 2.5D dynamic arenas. Break off enemy parts, utilize the environment, and survive.
4. **Scrap & Upgrade:** Winning yields new "scrap" (components) to upgrade the robot for the next match.

## Key Features

### 2.5D Physics-Based Combat

* **Perspective:** Side-scrolling 2D gameplay plane rendered in a fully 3D environment.
* **Localized Damage:** Robots do not have a single health bar. Damage is localized to specific parts (e.g., destroying a leg reduces speed; destroying a weapon arm disables that attack).
* **Physics:** Weight, momentum, and impact heavily influence combat. Heavy robots hit harder but move slower.

### Dynamic 3D Arenas

Environments are not static backgrounds; they actively impact the match.

* **The Junkyard:** Features magnetic cranes that randomly drop heavy scrap metal onto the 2D fighting plane.
* **The Ruined City:** Multi-tiered crumbling buildings. Floors can break under heavy impacts, changing the layout of the arena mid-fight.
* **Cyber-Core:** Moving conveyor belts and laser hazards that require precise platforming.

### Multiplayer & Networking

* **Real-time PvP:** 1v1 and 2v2 online matchmaking using WebSockets/WebRTC.
* **Client-Side Prediction:** Ensuring smooth movement despite network latency.

### Programmable Bots (User-Generated AI)

* **Custom Logic:** Players can write custom logic (via a simple visual node editor or a sanitized JavaScript API) to dictate how their robot behaves.
* **Asynchronous Multiplayer:** Players can upload their programmed bots to defend their rank while they are offline.
* **NPC Tournaments:** Server-hosted tournaments featuring purely user-programmed AI battling each other.

### In-Game Voice Communication

* **Real-Time Voice Chat:** Players can talk to their opponents or teammates during the match to strategize or banter.
* **Spatial Audio (Optional/Advanced):** Voice volume and panning can dynamically adjust based on the distance between the robots in the 3D arena.
* **Controls:** Includes standard "Push-to-Talk" (PTT) and "Mute Opponent" functionalities to ensure a safe and non-toxic environment.

## Technical Requirements & Error Handling

*(Adhering to strict, clean-code and grace-exit principles)*

* **Graceful Degradation:** If an arena's 3D background asset fails to load, the game must catch the exception and load a lightweight wireframe fallback without interrupting the physics engine or the match.
* **Network Error Handling:** If connection is lost, the client must display a clear, friendly "Reconnecting..." UI while the server temporarily pauses the match state (or replaces the disconnected player with a basic AI to prevent match crashing).
* **Sanitized AI Execution:** User-programmed scripts must run in a secure, sandboxed Web Worker with strict execution time limits to prevent infinite loops from crashing the browser.
* **Voice Chat Error Handling & Permissions:** If the user denies microphone permissions, or if the browser does not support WebRTC audio streams, the game must catch the error gracefully. It should not crash; instead, it will display a non-intrusive "Mic Unavailable" icon, disable the voice UI, and allow the match to continue normally.

## Development Roadmap (Phases)

### Phase 1: MVP (Minimum Viable Product)

**Goal:** Prove the core physics, combat feel, and basic rendering.

* **Environment:** 1 static test arena (gray-box 3D environment).
* **Robots:** 2 pre-configured, non-customizable robot models.
* **Mechanics:** Basic movement (run, jump), melee attack, and basic localized damage (parts breaking off visually and mechanically).
* **Networking:** Local 1v1 (same keyboard/screen) and basic Client-Server sync loop over WebSockets (latency not yet optimized).
* **Error Handling:** Basic try-catch blocks on the render loop and physics steps to output safe logs rather than browser freezes.

### Phase 2: Alpha (Customization & Networking)

**Goal:** Implement the "Build" loop and true online multiplayer.

* **Garage UI:** Drag-and-drop interface for swapping robot parts.
* **Database Integration:** MongoDB setup to save user profiles and robot configurations.
* **Dynamic Arena:** Implementation of the "Junkyard" arena with dynamic falling hazards.
* **Networking & Voice:** Full WebRTC/Socket.io implementation with client-side prediction and interpolation. Integration of WebRTC Media Streams for real-time voice chat. Graceful disconnect handling.

### Phase 3: Beta (Programmable Bots & Meta-game)

**Goal:** Introduce the AI programming feature and progression.

* **Bot Programming API:** Release the logic editor (Behavior Trees or safe JS scripting) for offline/asynchronous bot combat.
* **Progression System:** Matchmaking rating (MMR) and loot drops (scrap parts) after matches.
* **New Arena:** "The Ruined City" with destructible terrain.
* **Testing:** Closed beta testing focusing on server load, physics synchronization edge-cases, and voice chat quality under load.

### Phase 4: V1.0 (Full Release)

**Goal:** Polish, performance, and scaling.

* **Visual Polish:** Advanced Three.js shaders (sparks, dynamic lighting, post-processing bloom).
* **Audio:** Impact sounds, environmental noise, and adaptive soundtrack (mixed properly with the Voice Chat layer).
* **Full Roster:** Dozens of interchangeable parts and 3-4 fully polished dynamic arenas.
* **Live Ops:** Automated daily AI tournaments, leaderboards, and robust anti-cheat systems.

## Technology Stack Details

* **Frontend Rendering:** React + React Three Fiber (R3F).
* **Physics Engine:** Rapier.js (WASM-based, highly performant for 3D collisions constrained to a 2D Z-axis).
* **Backend:** Node.js with TypeScript (sharing interface types with the frontend).
* **Network Layer:** Socket.io (for matchmaking/lobby signaling) + WebRTC (Data channels for low-latency P2P combat state sync, and Media channels for Voice Chat streaming).
* **Database:** MongoDB (Flexible document structure for modular robot configurations).
