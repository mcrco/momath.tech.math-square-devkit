# MoMath.DevKit.MathSquare

Developer kit for building behaviors on the MoMath Math Square interactive floor.

## Overview

The Math Square is an 80×80 sensor grid floor that detects people walking on it. This app runs a single visual "behavior" (mini-app) that reacts to sensor data, projected onto the floor as a 1024×1024 pixel display.

## Architecture

```
app.js          — Electron shell
main.ts         — Entry point: connects sensors, loads behavior, runs render loop
sensors.ts      — Low-level 80×80 sensor grid, sources, filtering, blobbing/tracking
floor.ts        — High-level user tracking (sensor blobs → User objects with x,y positions)
display.ts      — Display geometry and coordinate conversions
behs/           — Behavior modules (your code goes here)
```

## Quick Start

```bash
npm install
npm run dev
```

This launches the app in dev mode with random sensor data. Use the sensor dropdown to switch between:
- **Random** — simulated random noise
- **Server** — real BL floor sensor server (192.168.72.11:9000)
- **Off** — no sensor input

Check "mouse" to simulate a person with your mouse cursor.

## Writing a Behavior

There are two approaches depending on what level of sensor data you need:

### Blobbed Users (high-level)

Use this when you want tracked user positions. See `behs/simple-blobs.js`.

```javascript
import * as Display from 'display';

export const behavior = {
  title: "My Behavior",
  frameRate: 'animate',    // 'animate' | 'sensors' | number (fps)
  init: function(container) { /* set up your canvas/rendering here */ },
  render: function(floor) {
    // floor.users is an array of tracked people
    for (let user of floor.users) {
      // user.x, user.y — pixel position (0–1024)
      // user.id — unique tracking ID
    }
  }
};
export default behavior;
```

### Raw Sensor Grid (low-level)

Use this when you want direct access to the 80×80 grid of activated cells. See `behs/simple-sensors.js`.

```javascript
import * as Display from 'display';
import * as Sensors from 'sensors';

export const behavior = {
  title: "My Sensor Behavior",
  frameRate: 'sensors',
  maxUsers: 0,             // disables blobbing — raw grid only
  init: function(container) { /* set up your canvas/rendering here */ },
  render: function(floor) {
    // floor.sensors.data is a flat Uint8Array of 80*80 = 6400 values (0 or 1)
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

### Choosing Your Behavior

In `main.ts`, change the import string to point to your behavior file:

```typescript
System.import("behs/simple-blobs")   // or "behs/simple-sensors", "behs/my-behavior", etc.
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

## Production

```bash
npm start         # Run via Electron Forge
npm run package   # Package for distribution
npm run make      # Create installer
```

### BLAST Integration

The app accepts semaphore parameters for launcher integration:
```
math-square.exe -semaphoreguid=XXXX -semaphoreurl=http://...
```

## Network

- **BL Sensor Server**: 192.168.72.11:9000
- **BLAST Semaphore Callback**: 192.168.72.13:9090 (default)
