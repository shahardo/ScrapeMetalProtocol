# **Project Development Document (PDD)**

## **Project Name: Scrap Metal Protocol (SMP)**

**Document Purpose:** This document outlines the technical architecture, development workflows, coding standards, and testing strategies required to build "Scrap Metal Protocol" from MVP to V1.0.

## **1\. System Architecture Overview**

### **1.1 Frontend (Client)**

* **Framework:** React.js (Vite bundler for fast HMR).  
* **3D Rendering:** Three.js wrapped in React Three Fiber (R3F) for declarative 3D scenes.  
* **State Management:** Zustand (for high-frequency game state like heat/health) and React Context (for low-frequency UI state like user profile).  
* **Physics:** Rapier.js (@react-three/rapier) running on the main thread or Web Worker depending on MVP performance metrics.
* **Control:** Keyboard+Mouse, game controller, xbox controller.

### **1.2 Backend (Server)**

* **Runtime:** Node.js using TypeScript.  
* **API Layer:** Fastify for RESTful endpoints (authentication, saving bot configurations).  
* **Real-time Layer:** Socket.io (Signaling server for matchmaking) \+ WebRTC (Data channels for peer-to-peer fast game state syncing and Media channels for Voice Chat).  
* **Database:** MongoDB (using Mongoose schemas) to store player stats, inventory, and JSON-based modular robot configurations.

## **2\. Development Workflow**

### **2.1 Version Control & Branching Strategy**

* **System:** Git / GitHub.  
* **Workflow:** Feature Branch Workflow (GitFlow derivative).  
  * main: Production-ready, stable code.  
  * develop: Integration branch for the next release.  
  * feature/\*: For new mechanics (e.g., feature/voice-chat).  
  * bugfix/\* & hotfix/\*: For error resolutions.

### **2.2 CI/CD Pipeline**

* **Continuous Integration:** GitHub Actions will run on every Pull Request (PR).  
  * Enforce ESLint and Prettier formatting.  
  * Run TypeScript type-checking (tsc \--noEmit).  
  * Run automated unit tests (Jest).  
* **Continuous Deployment:** Merges to main will automatically deploy the frontend to Vercel/Netlify and the backend to a cloud provider (e.g., Render, Railway, or AWS).

## **3\. Coding Standards & Best Practices**

To ensure long-term maintainability and collaboration, all developers must adhere to the following standards:

1. **Clear and Concise Commenting:** Every complex function, physical calculation, or network sync logic MUST include explanatory comments. Do not comment the obvious, but explain the *why* behind architectural choices.  
2. **Immutability & Pure Functions:** Prefer pure functions for game logic to make testing predictable.  
3. **Targeted Modifications:** When updating existing modules, do not refactor unrelated code. Keep changes scoped and clean.  
4. **Strong Typing:** TypeScript any is strictly prohibited. All robot parts, API responses, and physics events must have strictly defined Interfaces/Types.
5. **Allways Test:** Backend and Frontend functionalities must be tested as soon as they are written.
6. **Continuous Visibility:** New features should be seen in the Frontend as soon as possible.

## **4\. Error Handling & Graceful Degradation Strategy**

*Crucial Directive: The game must never "white screen" or freeze the browser. All systems must prioritize graceful exits and explanatory user reporting.*

### **4.1 Frontend Error Boundaries**

* **React Error Boundaries:** Wrap major UI components and the entire R3F \<Canvas\> in React Error Boundaries.  
* **Graceful Exit:** If the 3D renderer crashes, the boundary will catch the error, unmount the canvas to free up GPU memory, and display a stylized, user-friendly "System Reboot Required" modal rather than a blank screen.

### **4.2 Physics and Game Loop Protection**

* **Try-Catch in useFrame:** The main game loop executes 60 times a second. Critical physics calculations must be wrapped in optimized try-catch blocks.  
* **Fallback State:** If a specific entity (e.g., a dropped weapon) causes a physics NaN error, catch the error, destroy the specific corrupted entity, log a warning, and allow the rest of the game to continue seamlessly.

### **4.3 Network & API Failure Handling**

* **Timeouts & Retries:** All API calls must have explicit timeouts and exponential backoff retry logic.  
* **User-Facing Explanatory Reports:** Instead of generic "Error 500" messages, provide contextual UI alerts (e.g., *"Hangar doors jammed: Unable to save your robot loadout. Retrying in 5 seconds..."*).  
* **WebRTC Fallbacks:** If P2P WebRTC fails to establish due to strict NAT/Firewalls, the system must gracefully fallback to relaying data through a TURN server, notifying the user: *"Direct connection blocked. Routing through secure relay (Latency may increase)."*

## **5\. Testing Strategy**

### **5.1 Unit Testing (Jest)**

* **Target:** Core math, damage calculation scripts, and pure logic functions.  
* *Example:* Ensure that calculateDamage(impactVelocity, armorValue) handles negative velocities and zero armor without throwing unhandled exceptions.

### **5.2 Component Testing (React Testing Library)**

* **Target:** Garage UI, Garage drag-and-drop validation, and HUD elements.

### **5.3 Network Simulation Testing**

* Introduce artificial latency, packet loss, and jitter in a local test environment to tune the Client-Side Prediction and Interpolation algorithms.  
* Simulate sudden disconnects to verify that the server gracefully pauses the match and alerts the remaining player.

## **6\. Phase Implementation Plan (Technical Breakdown)**

### **Sprint 1-2: Core Physics & Engine Setup (MVP Phase)** ✅ Done

* Setup Monorepo (Frontend \+ Backend). ✅
* Initialize R3F Canvas and Rapier.js physics world. ✅
* Implement a basic controllable 3D box (placeholder robot) on a 2D constraint plane. ✅
* Implement standard movement (walk, jump, apply impulses). ✅

### **Sprint 3-4: Localized Damage & Modularity** ✅ Done

* Create the RobotEntity architecture (Entity-Component system using React components). ✅
* Implement joint attachments (connecting arms/legs to the chassis). ✅
* Implement impact listeners: detect when impulse exceeds a threshold to break a joint and spawn a disconnected physics object. ✅

### **Sprint 5-6: Netcode Foundations** ✅ Done

* Setup Node.js/Socket.io signaling server. ✅
* Implement matchmaking queue. ✅
* Establish WebRTC DataChannels between two peers. ✅
* Send position/rotation arrays at a fixed tick rate (e.g., 20 ticks per second). ✅

### **Sprint 7-8: Garage, DB, and Voice Chat** ✅ Done

* Setup MongoDB schemas for User and Robot configs. ✅
* Build the React UI for the Garage (saving configs to the DB). ✅
* Implement navigator.mediaDevices.getUserMedia for Voice Chat over WebRTC Media Streams, including strict try-catch handling for denied microphone permissions. ✅

### **Sprint 9-10: Weapons System** ✅ Done

* **Gun (F key):** Physical projectile (`RigidBody` with CCD) spawned at the right arm. 0.7 s cooldown, 18 m/s muzzle velocity, 3.5 s TTL. Impacts transmit collision force to enemy parts — existing joint-break thresholds apply. ✅
* **Laser (L key):** Instant raycast via `world.castRay()` from the left arm. 1.5 s cooldown. Renders a 220 ms emissive red beam sized to the actual hit distance. ✅
* **One-shot-per-keypress:** Both weapons use a `consumed` ref pattern (same as jump) to prevent hold-to-spam. ✅
* **`WeaponType = 'gun' | 'laser'`** added to `types/game.ts`. Full garage weapon-slot customisation arrives in Sprint 11+. ✅
* **Architecture:** `WeaponSystem` component mounted inside `RobotEntity`; receives `chassisRef`, `facingAngleRef`, and `controls` refs. ✅

### **Sprint 11: Polish, Bots & Extended Weapons** ✅ Done

* Web Worker sandboxed bot environment — user JS runs in `new Function` scope with 20 ms timeout guard. ✅
* Bot script editor accessible via Garage → BOT SCRIPT tab. ✅
* Weapon damage numbers, cooldown HUD bars, weapon-slot customisation in the Garage. ✅
* New weapons: Shotgun (3-pellet spread), Rocket (slow/heavy), Sniper (long-range, 2-charge cost). ✅
* Q/E keybindings for left/right arm weapons. ✅
* Hull health bar drains correctly when hit by remote player. ✅

### **Sprint 12: Garage 2.0, Bot UX & Match Lifecycle** ✅ Done

#### Garage 2.0
* **Garage locked during match** — button disabled when `matchStatus === 'matched'`; closes automatically if a match starts. `matchStatus` mirrored from `useNetworking` into Zustand store so `App.tsx` can read it. ✅
* **Weapon table** — WEAPONS tab replaced with a full per-weapon table: rotating 3-D R3F preview mesh, stat bars (Power/Range/ROF), ammo count, credit price placeholder, Q/E slot-select buttons. Weapon stats defined in `weaponRegistry.ts`. ✅
* **Bot editor tab** — BOT SCRIPT is the second tab inside the Garage modal. Standalone BOT button removed. `GarageModal` now accepts `isBotInstalled`, `isBotActive`, `workerError`, `onInstallBot`, `onStartBot`, `onStopBot` props from `GameCanvas`. ✅
* **Weapon list load/save fixed** — `weaponSlot` field added to Mongoose `robotPartSchema`; `description` field added to `robotConfigSchema` auto-generated at save time (e.g. `"Q: LASER / E: GUN"`). ✅
* **Start Match button** — matchmaking overlay shows a large `START MATCH` button with a garage hint line in the `disconnected` state. ✅

#### Bot UX
* **Install / Start / Stop split** — `installScript()` loads the script into the sandbox without starting it. `startBot()` activates the bot; `stopBot()` deactivates it. Tab badge shows `RDY` (installed, not running) or `RUN` (running). ✅
* **Bot debug panel** — collapsible HUD panel polling `debugRef` at 10 Hz; displays real `x/y` position from `localPosRef`, `state` JSON and `BotInput` reply; errors shown in red. Panel height increased to 420 px. ✅
* **`BotState.x/y` real position** — `BotTickSender` reads actual chassis world position from `localPosRef` (updated by `RobotEntity` every frame) instead of hardcoding 0. ✅

#### Match lifecycle
* **End-of-match on zero health** — when `chassisHealth` reaches 0, local client sends `{ matchEnd: true }` over DataChannel and transitions to `defeat`; receiver transitions to `victory`. Both show a DEFEATED / VICTORY overlay for 5 s then reset to `disconnected`. Health resets to 100 on return to lobby. ✅

#### Radar HUD
* **Radar panel** — 120 px circular `<canvas>` (top-left, below Garage button, visible during `matched` state). Local robot drawn at center; remote robot dot is relative to local position, clamped to circle edge if out of view range. Rotating sweep line, 2 s period, 10 Hz redraw via `setInterval`. ✅

### **Sprint 13: Audio, Shaders & Credits Economy** ✅ Done

#### Audio
* **Positional Web Audio** — `sounds.ts` extended with per-weapon synth sounds: `playShotgunShot()` (3 staggered bursts), `playRocketShot()` (low sine rumble), `playSniperShot()` (high-pitched sawtooth, distinct from laser). ✅
* **Positional `*At(x,y,z)` variants** — all 5 weapons + hit confirm route through an HRTF `PannerNode` so remote opponent sounds attenuate with distance. `updateListenerPosition()` keeps the listener locked to the local robot every frame via `AudioListenerSync` inside the Canvas. ✅
* **Arena ambient hum** — 80 Hz sine oscillator starts on `GameCanvas` mount, stopped on unmount via `startAmbientHum()` return value. ✅
* **`RemoteRobotEntity`** — all incoming `weaponFired` and `weaponHit` events now trigger the appropriate positional sound at the emitter world position. ✅

#### Post-Processing
* **Bloom** — `@react-three/postprocessing` `EffectComposer` + `Bloom` (luminanceThreshold 0.6, intensity 0.8) makes all emissive meshes (laser/sniper beams, sparks, muzzle flashes) glow. ✅
* **Chromatic aberration on hit** — `ChromaticAberrationController` inside the Canvas detects `chassisHealth` drops each frame, bumps aberration to 0.012, and decays it to zero over 0.6 s. Driven by `ChromaticAberration` in the `EffectComposer`. ✅
* **Sniper beam colour** — sniper beam renders in cyan-blue (`#44ccff`) rather than red, visually distinct from the laser and Bloom-amplified separately. ✅

#### Credits Economy
* **`UserModel`** — `credits: Number` field added (default 0, min 0). ✅
* **`credits.ts`** — pure `calcMatchCredits({ damageDealt, score })` (`floor(dmg/10) + score*5`, capped at 500) and `canAfford(balance, price)` — 8 unit tests. ✅
* **`routes/credits.ts`** — `GET /credits` (balance), `POST /credits/award` (atomic `$inc`), `POST /credits/spend` (affordability check + atomic deduct) — 9 route tests. ✅
* **Auth responses** — `/auth/login` and `/auth/register` now include `credits` in the response body so the client has the balance immediately. ✅
* **`AuthUser`** — `credits: number` field added; `useAuth.ts` persists it from login/register responses. ✅
* **`gameStore`** — `credits` + `setCredits` added; seeded from `auth.user.credits` on `GameCanvas` mount. 2 new tests. ✅
* **Credit award on match end** — both players call `POST /credits/award` when `matchResult` transitions from `'none'`; balance is updated in the store. ✅
* **Weapon gating** — `WeaponTable` disables Q/E buttons for weapons the player cannot afford; shows `"Requires N ¢"` tooltip and adds `wt-row--locked` class. ✅
* **Garage header** — `GarageModal` shows `{credits} ¢` next to the close button. App HUD shows `{credits} ¢` next to pilot name. ✅

### **Sprint 14+: V1.0 Polish & Deployment**

* Load testing (100 concurrent lobbies), TURN server integration for strict-NAT players.
* V1.0 deployment (Vercel frontend + cloud backend).
* Additional arenas (`ruined-city`, `cyber-core`, `junkyard`) — type stubs exist, geometry pending.