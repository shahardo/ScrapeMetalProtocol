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

### **Sprint 7-8: Garage, DB, and Voice Chat**

* Setup MongoDB schemas for User and Robot configs.  
* Build the React UI for the Garage (saving configs to the DB).  
* Implement navigator.mediaDevices.getUserMedia for Voice Chat over WebRTC Media Streams, including strict try-catch handling for denied microphone permissions.

### **Sprint 9+: Polish & Programmable Bots**

* Implement the Web Worker sandboxed environment for running user-submitted JS bot logic.  
* Add shaders, particle systems (sparks/smoke), and audio cues.  
* Conduct load testing and finalize V1.0 deployment.