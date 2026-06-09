# momath.tech.math-square-devkit

> **© 2026 National Museum of Mathematics. All rights reserved.**
> Licensed under the [MoMath Source Available License](LICENSE).

Developer kit for building behaviors on the MoMath Math Square interactive floor.

## Overview

The Math Square is an 80×80 sensor grid floor that detects people walking on it. This app runs a single visual "behavior" (mini-app) that reacts to sensor data, projected onto the floor as a 1024×1024 pixel display.

## Prerequisites

- Node.js >= 22
- npm (comes with Node.js)

```bash
npm install
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Production build (minified, no sourcemaps) |
| `npm run dev` | Development mode (watch + Electron with DevTools) |
| `npm run typecheck` | Run TypeScript type checking (`tsc --noEmit`) |
| `npm run package` | Build + package with electron-forge |
| `npm run make` | Build + make installer with electron-forge |

## Quick Start

```bash
npm install
npm run dev
```

This launches the app in dev mode with random sensor data. Use the sensor dropdown to switch between:
- **Random** — simulated random noise
- **Server** — real BL floor sensor server (192.168.72.11:9000)
- **AFR Recording** — play back a `.afr` recording file with real foot traffic
- **Off** — no sensor input

Check "mouse" to simulate a person with your mouse cursor.

### AFR Playback

Select "AFR Recording" from the sensor dropdown to load a BrightLogic `.afr` recording file. This replays recorded foot traffic at its original speed using embedded timestamps, and loops continuously. All behaviors work identically to running against the live floor — blobbing, filtering, and display are unaffected.

AFR files can be large (50MB+). The player uses streaming access (frame index + on-demand `Blob.slice()`) so memory stays reasonable during playback.

## Architecture

```
app.js          — Electron shell (CommonJS, not bundled)
main.ts         — Entry point: connects sensors, loads behavior, runs render loop
sensors.ts      — Low-level 80×80 sensor grid, sources, filtering, blobbing/tracking
                  Includes AFRPlaybackSource and runAFRPlayback() for .afr file playback
floor.ts        — High-level user tracking (sensor blobs → User objects with x,y positions)
display.ts      — Display geometry and coordinate conversions
behs/           — Behavior modules (your code goes here)
documentation/  — AFR format spec, sample recordings, reference materials
```

## Build Output

The build produces the `dist/` directory:

```
dist/
├── app.js            (Electron main process, CommonJS)
├── main.js           (Renderer entry, ESM bundle)
├── chunk-*.js        (Shared modules)
├── behs/             (Behavior modules)
├── dev.html / index.html
├── style.css
├── icon.png
├── prod.json
└── package.json      (Electron entry point config)
```

## Sample Behaviors

The project ships with two example behaviors in `behs/`:

| File | Title | What it does |
|------|-------|-------------|
| `simple-blobs.js` | Simple Blobs | Draws each tracked user as a colored circle. Demonstrates high-level blobbed user tracking. |
| `simple-sensors.js` | Simple Sensors | Renders the raw 80×80 sensor grid directly — green rectangles for active cells. No blobbing. |

### Switching behaviors

The app currently loads a single behavior hardcoded in `main.ts`:

```typescript
const beh = await import('./behs/simple-sensors.js');
```

To switch, change the import path to a different behavior file:

```typescript
const beh = await import('./behs/simple-blobs.js');
```

Save the file, and esbuild will rebuild automatically (in dev mode). The Electron window reloads with the new behavior.

## Writing a Behavior

Behaviors are `.js` files in the `behs/` directory. They use ESM imports with bare specifiers to access core modules:

```javascript
import * as Display from 'display';
import * as Sensors from 'sensors';
import Floor from 'floor';
```

Each behavior exports a `behavior` object:

```javascript
export const behavior = {
  title: "My Behavior",
  frameRate: 'animate',
  init: function(container) { /* set up rendering */ },
  render: function(floor) { /* called each frame */ }
};
export default behavior;
```

### Blobbed Users (high-level)

Use this when you want tracked user positions. See `behs/simple-blobs.js`.

```javascript
import * as Display from 'display';

export const behavior = {
  title: "My Behavior",
  frameRate: 'animate',
  init: function(container) {
    // Set up your canvas/rendering here
  },
  render: function(floor) {
    for (let user of floor.users) {
      // user.x, user.y — pixel position (0–1024)
      // user.id — unique tracking ID
    }
  }
};
export default behavior;
```

### Raw Sensor Grid (low-level)

Use this when you want direct access to the 80×80 grid. See `behs/simple-sensors.js`.

```javascript
import * as Display from 'display';
import * as Sensors from 'sensors';

export const behavior = {
  title: "My Sensor Behavior",
  frameRate: 'sensors',
  maxUsers: 0,             // disables blobbing — raw grid only
  init: function(container) {
    // Set up your canvas/rendering here
  },
  render: function(floor) {
    for (let y = 0; y < Sensors.height; y++) {
      for (let x = 0; x < Sensors.width; x++) {
        const active = floor.sensors.data[y * Sensors.width + x];
        // active is 1 if that cell is triggered, 0 otherwise
      }
    }
  }
};
export default behavior;
```

### Behavior Options

| Property | Description |
|----------|-------------|
| `title` | Display name |
| `frameRate` | `'animate'` (60fps), `'sensors'` (on sensor update), or a number (custom fps) |
| `maxUsers` | Max tracked users (default 40). Set to `0` for raw sensors only, `null` to disable sensors entirely |
| `numGhosts` | Number of fake users for testing (move via simplex noise) |
| `init(container)` | Set up rendering inside the provided div. May return a Promise. |
| `render(floor)` | Called each frame. Access `floor.users` or `floor.sensors` depending on mode. |

## Production Launching / Switching

In production, the BLAST app (BrightLogic) schedules and controls behaviors on the Math Square floor.

BLAST launches the app with a semaphore GUID. The app signals readiness by calling back to BLAST once the first frame renders:

```
BLAST_URL:9090/?semaphore=<semaphoreguid>
```

The app accepts semaphore parameters for launcher integration:
```
math-square.exe -semaphoreguid=XXXX -semaphoreurl=http://...
```

**For development/hackathon use, you don't need BLAST. Just run `npm run dev` and place the window on the floor display.**

## Production

```bash
npm run build       # Build optimized bundle
npm run package     # Package for distribution
npm run make        # Create installer
```

## Network

- **BL Sensor Server**: 192.168.72.11:9000
- **BLAST Semaphore Callback**: 192.168.72.13:9090 (default)
