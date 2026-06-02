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

See `behs/simple-blobs.js` for a minimal example. A behavior exports:

```javascript
export const behavior = {
  title: "My Behavior",
  frameRate: 'animate',    // 'animate' | 'sensors' | number (fps)
  init: function(container) { /* set up your canvas/rendering here */ },
  render: function(floor) { /* called each frame with floor.users array */ }
};
export default behavior;
```

Each user in `floor.users` has:
- `x`, `y` — pixel position (0–1024)
- `id` — unique tracking ID (for color assignment, etc.)

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
