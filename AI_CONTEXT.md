# AI Context for MoMath Math Square

This repository is a developer kit for building interactive **behaviors** for the MoMath Math Square exhibit.

## What this project is

Math Square is an interactive floor with an 80×80 sensor grid that detects people walking on it, and a 1024×1024 projected display that renders a single behavior reacting to those sensors.

The app is an Electron-based developer kit. In development mode, it can use random simulated sensor data, a real floor sensor server, or no sensor input, and it also supports mouse-based person simulation for testing.

## Main idea for hackathon participants

Participants should usually create **one new file in `behs/`** and implement a single self-contained behavior there.

For hackathon speed, prefer modifying or copying an existing sample behavior instead of changing the app architecture. The existing examples already demonstrate the supported rendering pattern and export contract.

## Files that matter most

| File | Purpose |
|---|---|
| `README.md` | Project overview, setup, scripts, behavior contract, and examples. |
| `behs/simple-blobs.js` | Example using tracked users via `floor.users`. |
| `behs/simple-sensors.js` | Example using the raw 80×80 sensor grid via `floor.sensors.data`. |
| `floor.ts` | High-level floor state, user tracking, ghost users, and sensor connection logic. |
| `display.ts` | Fixed display dimensions and sensor-to-pixel conversion helpers. |
| `main.ts` | App entry point that loads one behavior module at runtime. |

## Behavior contract

Each behavior is an ES module in `behs/` that exports a `behavior` object with at least `title`, `frameRate`, `init(container)`, and `render(floor)`.

Use this pattern:

```javascript
export const behavior = {
  title: "My Behavior",
  frameRate: 'animate',
  init(container) {
    // setup
  },
  render(floor) {
    // draw each frame
  }
};

export default behavior;
```

## Two supported input models

### 1. Blobbed users

Use `floor.users` when the behavior should react to people as tracked positions instead of raw sensor cells. Each `User` has `id`, `x`, and `y` properties.

The sample `simple-blobs.js` demonstrates this mode by drawing one circle per tracked user.

### 2. Raw sensor grid

Use `floor.sensors.data` when the behavior should inspect the raw 80×80 activation grid directly. The `simple-sensors.js` sample loops over the grid and paints active cells.

This mode is enabled by setting `maxUsers: 0`, which disables user blobbing and leaves the raw sensor data available for rendering logic.

## Coordinate system

The display uses a fixed 1024×1024 pixel coordinate system.

The underlying sensor grid is 80×80, and `display.ts` exposes conversion helpers plus per-cell pixel size derived from display width and sensor width.

When working with tracked users from `floor.users`, `user.x` and `user.y` are already in display pixel coordinates, not sensor-cell coordinates.

## Useful behavior options

| Property | Meaning |
|---|---|
| `title` | Display label for the behavior. |
| `frameRate: 'animate'` | Render continuously, appropriate for animation. |
| `frameRate: 'sensors'` | Render when sensor updates arrive. |
| `maxUsers` | Maximum tracked users; `0` means raw sensors only. |
| `numGhosts` | Adds fake users for testing movement ideas. |

## Development workflow

Install dependencies with `npm install` and run the kit with `npm run dev`.

The app currently loads one behavior by a hardcoded import in `main.ts`, so switching to a new behavior means changing that import path to a different file in `behs/` and saving.

## What to optimize for in a hackathon

Prefer one-file behaviors, Canvas2D, simple visuals, and a strong demo interaction over framework-heavy implementations. The included samples are both native Canvas2D and show the intended lightweight approach.

Build for a 2–3 minute demo, not for production completeness. A good prototype should visibly react to footsteps or tracked users within minutes of running.

## Constraints and guardrails

- Do not rewrite core platform files unless absolutely necessary; focus work inside `behs/`.
- Prefer copying `simple-blobs.js` or `simple-sensors.js` as a starting point.
- Keep dependencies minimal so the prototype stays easy to run with `npm run dev`.
- Assume one behavior is active at a time because the app loads a single behavior module.
- Use Canvas2D unless a more complex rendering stack is clearly worth the time cost; the provided examples are intentionally minimal.

## Suggested AI instructions

When using an AI coding assistant, give it these constraints explicitly:

- Read `AI_CONTEXT.md` and `README.md` first.
- Create or modify only files inside `behs/` unless asked otherwise.
- Follow the existing behavior export contract exactly.
- Use Canvas2D and keep the code in a single behavior file unless there is a compelling reason not to.
- Ask clarifying questions before changing architecture, build scripts, or app boot logic.

## Prompt templates

### New behavior prompt

```text
Read AI_CONTEXT.md and README.md first.
Create a new behavior in behs/my-behavior.js.
Use Canvas2D.
Do not modify files outside behs/.
Use the existing behavior contract exactly.
My concept is: [describe idea here].
```

### Improve an existing behavior prompt

```text
Read AI_CONTEXT.md first.
Open behs/my-behavior.js and improve it for a hackathon demo.
Keep it as a single-file Canvas2D behavior.
Preserve the existing export contract.
Focus on better visuals, responsiveness, and reliability.
```

### Debugging prompt

```text
Read AI_CONTEXT.md and inspect behs/my-behavior.js.
Find the smallest fix needed.
Do not refactor unrelated code.
Explain the bug briefly, then patch only what is necessary.
```
