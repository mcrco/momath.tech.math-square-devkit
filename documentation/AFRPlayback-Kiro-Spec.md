# AFR Playback Source — Implementation Specification

## Overview

This document specifies the implementation of a third sensor source for the MoMath Math Square DevKit: `AFRPlaybackSource`. It reads pre-recorded touch data from BrightLogic `.afr` (ActiveFloor Recording) files and replays it through the existing `Source` interface defined in `sensors.ts`, making it a drop-in replacement for `BLSource` (live floor) or `PlaybackSource` (JSON diff recording) during development and testing.

The goal is to allow a developer to load a `.afr` recording file and have all existing behaviors — blobbing, filtering, display, behaviors — work identically to running against the live floor, without needing a physical connection to the BrightLogic server.

---

## Background and Context

### The Live Server Format

The BrightLogic `BLFloorServer.exe` serves sensor state via HTTP GET at up to 30 requests per second. The response is XML in this shape:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<BLFloor ledsX="192" ledsY="192" sensorsX="80" sensorsY="80">
  <Rows date="2026-04-17 16:22:58.280">
    <Row rownum="0" values=".,.,.,.,..." />
    <Row rownum="1" values=".,.,*,.,..." />
    ...
  </Rows>
</BLFloor>
```

Each `Row` has a `values` attribute of comma-delimited sensor states: `.` = not touched, `*` = touched. The existing `BLSource` class in `sensors.ts` reads this format and populates a `ByteGrid` (the `Grid` type) accordingly.

### The AFR Recording Format

The BrightLogic DVR exports a `.afr` file (XML) that records the full sensor state at each captured moment. The format is:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<BLFloor>
  <Description></Description>
  <PanelType>ROE BM4i v2</PanelType>
  <Panels>
    <Width>8</Width>
    <Height>8</Height>
  </Panels>
  <Pixels>
    <Width>1024</Width>
    <Height>1024</Height>
  </Pixels>
  <Sensors>
    <Width>80</Width>
    <Height>80</Height>
  </Sensors>
  <Meters>
    <Width>4.821</Width>
    <Height>4.821</Height>
  </Meters>
  <Recording starttime="2026-04-17T16:22:58-04:00">
    <Frames>
      <Frame timestamp="0.001">
        AAAAAAAAAA...base64data...AAA=
      </Frame>
      <Frame timestamp="0.004">
        AAAAAAAAAA...base64data...AAA=
      </Frame>
    </Frames>
  </Recording>
</BLFloor>
```

Key differences from the live format and the existing `PlaybackSource`:

| Property | Live `BLSource` | Existing `PlaybackSource` | New `AFRPlaybackSource` |
|---|---|---|---|
| Input | HTTP GET (XML, row/value) | JSON array of diffs | `.afr` XML file (base64 frames) |
| Per-frame data | Full state as `*`/`.` rows | Changed indices only (delta) | Full state as packed bitmap |
| Timing | Caller controls poll rate | Caller controls poll rate | Timestamps embedded in file |
| Grid size | From `sensorsX`/`sensorsY` attrs | Hardcoded 80×80 | From `<Sensors>` child elements |

### Frame Payload Encoding

Each `<Frame>` body is a **base64-encoded packed bitmap** of the full sensor grid state at that moment. Decoding:

1. Strip whitespace from the text content.
2. Base64-decode → raw bytes.
3. For an 80×80 grid: `80 × 80 = 6400` bits → `6400 / 8 = 800` bytes exactly.
4. Each byte encodes 8 sensors, **MSB first** (most significant bit = lowest sensor index in that byte).
5. Byte layout is **row-major**: byte 0 = sensors 0–7 of row 0, byte 1 = sensors 8–15 of row 0, ..., byte 9 = sensors 72–79 of row 0, byte 10 = sensors 0–7 of row 1, etc.
6. A bit value of `1` = sensor touched; `0` = sensor not touched.

The grid dimensions should be read dynamically from `<Sensors><Width>` and `<Sensors><Height>` rather than assumed to always be 80×80, for forward compatibility.

The `timestamp` attribute on each `<Frame>` is **elapsed seconds** from the recording start (not a wall-clock time). The recording start wall-clock time is in the `starttime` attribute on the `<Recording>` element, but this is informational only — playback uses relative deltas.

---

## What Needs to Be Built

### New Class: `AFRPlaybackSource`

Add `AFRPlaybackSource` to `sensors.ts` as a new exported class alongside the existing `BLSource`, `PlaybackSource`, and other sources.

#### Interface Contract

The class must implement the `Source` interface (`TSource<Grid>`), meaning it implements:

```typescript
read(): Promise<Grid>
```

It should extend `ByteGrid` (as `BLSource` and `PlaybackSource` do) so that it IS a `Grid` and can be returned directly from `read()`.

#### Constructor

```typescript
constructor(afrXmlString: string)
```

The constructor receives the full text content of the `.afr` file as a string. It must:

1. Parse the XML using `DOMParser`.
2. Read sensor dimensions from `<Sensors><Width>` and `<Sensors><Height>`.
3. Validate that the grid matches the module constants (`W=80, H=80`) or throw a descriptive error if not.
4. Parse all `<Frame>` elements into an internal array of `{ timestamp: number, payload: string }` objects, where `payload` is the whitespace-stripped base64 string.
5. Initialize the `ByteGrid` superclass with the correct size.

#### Internal State

- `private frames: Array<{ timestamp: number; payload: string }>` — all frames from the file, in order.
- `private index: number` — current playback position, starting at 0.
- `public sensorWidth: number` and `public sensorHeight: number` — from the XML header.

#### `read()` Method

Each call to `read()` advances to the next frame and decodes it into `this.data`:

1. If `this.index >= this.frames.length`, dispatch a `CustomEvent("playbackDone")` on `document` (matching `PlaybackSource` behavior) and return `Promise.reject("AFRPlaybackSource: recording finished")`.
2. Retrieve `this.frames[this.index++]`.
3. Base64-decode the payload using `atob()`.
4. Unpack the bitmap into `this.data` (a `Uint8ClampedArray` of length `W * H`):
   - For each byte at position `byteIndex`:
     - For each bit from 7 down to 0 (MSB first):
       - `sensorIndex = byteIndex * 8 + (7 - bit)`
       - `this.data[sensorIndex] = (byte >> bit) & 1`
5. Return `Promise.resolve(this)`.

#### `remaining` Getter

```typescript
get remaining(): number {
  return this.frames.length - this.index;
}
```

Mirrors `PlaybackSource.remaining` for UI/control use.

#### `nextTimestamp` Getter

```typescript
get nextTimestamp(): number | undefined {
  return this.frames[this.index]?.timestamp;
}
```

Exposes the timestamp of the next frame to be read, enabling timestamp-driven playback (see below).

#### `reset()` Method

```typescript
reset(): void {
  this.index = 0;
  this.clear();
}
```

Allows the caller to restart playback from the beginning.

---

### Timestamp-Driven Playback Helper

The existing `Reader` class polls at a fixed Hz rate, which is appropriate for live data. For `.afr` playback, the frame timestamps should drive timing so that the recording plays back at the original speed.

Add a standalone exported function (not a class method) to `sensors.ts`:

```typescript
export function runAFRPlayback(
  source: AFRPlaybackSource,
  handler: (result: Grid | string) => number
): void
```

Behavior:

1. Record `startTime = performance.now()`.
2. Record `recordingOffset = source.frames[0]?.timestamp ?? 0` (the timestamp of the first frame, usually near 0).
3. On each tick:
   - Compute `elapsed = (performance.now() - startTime) / 1000` (seconds).
   - While `source.nextTimestamp !== undefined` and `(source.nextTimestamp - recordingOffset) <= elapsed`:
     - Call `source.read()`, then pass the resolved `Grid` to `handler`.
     - If `handler` returns 0, stop.
   - If frames remain, schedule the next tick with `setTimeout` using the delta to the next frame's timestamp.
4. If `source.remaining === 0`, call `handler` with the string `"AFRPlaybackSource: recording finished"` and stop.

This approach allows all frames that have "elapsed" to be delivered in rapid succession if the timer fires slightly late (e.g., after a browser tab was backgrounded), maintaining sync.

---

## Where to Integrate in the Application

### In `main.ts`

`main.ts` currently selects between `BLSource` and other sources based on configuration. A third branch should be added for AFR playback:

1. Detect if an AFR file has been provided (e.g., via a URL parameter, a file input element, or a config value).
2. Fetch or read the `.afr` file text.
3. Construct `new AFRPlaybackSource(afrXmlString)`.
4. Use `runAFRPlayback(source, handler)` instead of `new Reader(source, rate).run(handler)`.

The specific triggering mechanism (URL param vs. UI file picker vs. config) is a design decision for the implementor, but a URL parameter approach (`?afr=filename.afr`) is recommended for hackathon use since it requires no UI changes.

### In `dev.mjs` (the dev server)

If the `.afr` file is to be served locally during development, `dev.mjs` may need a route added to serve files from a local recordings directory, similar to how it serves other static assets.

---

## Validation and Error Cases

The implementation must handle these cases gracefully with descriptive error messages (reject the Promise or throw):

| Condition | Expected behavior |
|---|---|
| XML parse fails | Throw `"AFRPlaybackSource: invalid XML"` |
| `<BLFloor>` root element missing | Throw `"AFRPlaybackSource: missing BLFloor element"` |
| `<Sensors>` dimensions missing | Throw `"AFRPlaybackSource: missing Sensors dimensions"` |
| Dimensions don't match W×H | Throw `"AFRPlaybackSource: sensor size mismatch (got NxN, expected 80x80)"` |
| No `<Frame>` elements found | Throw `"AFRPlaybackSource: no frames in recording"` |
| Base64 decode produces wrong byte count | Log a warning and skip that frame rather than crashing |
| `read()` called after last frame | Dispatch `playbackDone`, return `Promise.reject(...)` |

---

## Bit-Order Verification

The MSB-first bit order specified above is based on decoding the sample recording data and confirming that 800 bytes = exactly 6400 bits = 80×80 sensors. **The implementor should verify bit order visually** by loading a known recording where a single touch was made in a known location and checking that the active cell renders in the correct position on screen. If the image appears mirrored horizontally, switch to LSB-first. If it appears mirrored vertically, invert the row order.

The unpacking loop for MSB-first:
```typescript
for (let b = 0; b < raw.length; b++) {
  const byte = raw.charCodeAt(b);
  for (let bit = 7; bit >= 0; bit--) {
    this.data[b * 8 + (7 - bit)] = (byte >> bit) & 1;
  }
}
```

The unpacking loop for LSB-first (if MSB-first proves wrong):
```typescript
for (let b = 0; b < raw.length; b++) {
  const byte = raw.charCodeAt(b);
  for (let bit = 0; bit < 8; bit++) {
    this.data[b * 8 + bit] = (byte >> bit) & 1;
  }
}
```

---

## Summary of Deliverables

1. **`AFRPlaybackSource` class** added to `sensors.ts` — exported, implements `Source`, extends `ByteGrid`.
2. **`runAFRPlayback()` function** added to `sensors.ts` — exported, handles timestamp-accurate frame delivery.
3. **Integration in `main.ts`** — a third source selection path that constructs `AFRPlaybackSource` from a `.afr` file and uses `runAFRPlayback` instead of `Reader`.
4. **(Optional) Route in `dev.mjs`** to serve `.afr` files locally.

No changes are required to `floor.ts`, `display.ts`, `behs/`, or any behavior files — the `Source` interface contract ensures full downstream compatibility.
