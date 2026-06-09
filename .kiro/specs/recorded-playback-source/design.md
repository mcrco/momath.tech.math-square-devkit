# Design Document: AFR Playback Source

## Overview

This design adds `AFRPlaybackSource` to `sensors.ts` as a streaming, looping sensor source that reads BrightLogic `.afr` recording files. The key architectural decisions are:

1. **Streaming file access** — Build an index of frame offsets on load, then decode frames on demand via `Blob.slice()` + `FileReader`. Memory usage stays constant regardless of file size.
2. **Timestamp-driven playback** — A standalone `runAFRPlayback()` function drives frame delivery using embedded timestamps rather than a fixed poll rate.
3. **Loop by default** — When the recording ends, playback resets and continues from the beginning.
4. **File dialog trigger** — A new "AFR" option in the dev sensor dropdown opens a file picker.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| File access | `Blob.slice()` + `FileReader` | Avoids loading 50MB+ into a single string; Electron renderer has full File API |
| Index build | Single text scan for `<Frame` / `</Frame>` | XML structure is predictable; avoids DOMParser on the whole file |
| Header parse | `DOMParser` on first few KB only | Header is small; DOM parsing is reliable for extracting sensor dimensions |
| Playback timing | `runAFRPlayback()` standalone function | Keeps `AFRPlaybackSource` as a pure data source; timing is a separate concern |
| Looping | Auto-reset at end of frames | Most useful default for dev testing; `stop()` available for explicit halt |
| UI trigger | Dropdown option + file input | Consistent with existing sensor source switching pattern |
| Bit ordering | MSB-first (with visual verification note) | Matches spec analysis of sample data; fallback to LSB-first documented |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ dev.html                                                     │
│  ┌─────────────────────┐                                    │
│  │ <select> sensors     │──── "afr" selected ───┐           │
│  │  Off|Random|Server|AFR│                       │           │
│  └─────────────────────┘                       ▼           │
│                                          File Dialog        │
│                                               │             │
│                                               ▼             │
│                                     File (Blob) object      │
└───────────────────────────────────────────┬─────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────┐
│ AFRPlaybackSource (sensors.ts)                               │
│                                                              │
│  constructor(file: File)                                     │
│    ├── Read header (first 2KB) via Blob.slice + FileReader   │
│    ├── DOMParser on header → extract <Sensors> W/H           │
│    ├── Validate dimensions == 80×80                          │
│    └── Scan full file text for <Frame> boundaries            │
│         → Build frameIndex: Array<{timestamp, offset, len}>  │
│                                                              │
│  read(): Promise<Grid>                                       │
│    ├── Slice file at frameIndex[this.index]                  │
│    ├── FileReader.readAsText → base64 string                 │
│    ├── atob() → 800 raw bytes                               │
│    ├── Unpack MSB-first into this.data[6400]                 │
│    ├── Advance index (or reset to 0 if at end)              │
│    └── Return Promise.resolve(this)                          │
│                                                              │
│  Properties: remaining, nextTimestamp, stopped               │
│  Methods: reset(), stop()                                    │
└──────────────────────────────────┬──────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────┐
│ runAFRPlayback(source, handler)                              │
│                                                              │
│  Records startTime = performance.now()                       │
│  Records firstTimestamp from frameIndex[0]                   │
│  Loop:                                                       │
│    elapsed = (now - startTime) / 1000                        │
│    while nextTimestamp - firstTimestamp <= elapsed:           │
│      source.read() → grid → handler(grid)                   │
│      if handler returns 0 → stop                            │
│    setTimeout(next tick, delta to next frame)                │
└─────────────────────────────────────────────────────────────┘
```

### Integration in main.ts

```
main.ts :: updateSource()
  │
  ├── sensorInput.value === 'afr'
  │     ├── Show file input / trigger click
  │     ├── On file selected:
  │     │     ├── source = new AFRPlaybackSource(file)
  │     │     ├── await source.init()  // builds index
  │     │     ├── floor.source = source
  │     │     └── runAFRPlayback(source, floor.sensorUpdate handler)
  │     └── On cancel: revert dropdown
  │
  ├── sensorInput.value === 'bl' | 'null' | 'raindrop'
  │     └── (existing behavior unchanged)
```

## Components and Interfaces

### 1. AFRPlaybackSource Class

```typescript
export class AFRPlaybackSource extends ByteGrid implements Source {
  private file: File
  private frameIndex: Array<{ timestamp: number; offset: number; length: number }>
  private index: number
  private _stopped: boolean
  public sensorWidth: number
  public sensorHeight: number

  constructor(file: File)
  init(): Promise<void>           // async: parse header + build index
  read(): Promise<Grid>           // decode next frame from file slice
  get remaining(): number         // frames left in current pass
  get nextTimestamp(): number | undefined
  reset(): void                   // restart from frame 0
  stop(): void                    // halt playback
  get stopped(): boolean
}
```

**Why `init()` is separate from constructor:** The constructor cannot be async, but file reading requires async operations. The two-step pattern (`new AFRPlaybackSource(file)` then `await source.init()`) keeps the constructor simple and matches how the File API works.

### 2. runAFRPlayback Function

```typescript
export function runAFRPlayback(
  source: AFRPlaybackSource,
  handler: (result: Grid | string) => number
): void
```

**Behavior:**
- Drives frame delivery using timestamps
- Handles looping: when source reports end-of-recording, dispatches `playbackDone` event, resets wall-clock start time, and continues
- Stops when `handler` returns 0 or `source.stopped` is true

### 3. UI Integration (dev.html + main.ts)

**dev.html changes:**
- Add `<option value="afr">AFR Recording</option>` to sensor select
- Add hidden `<input type="file" accept=".afr">` element

**main.ts changes:**
- In `updateSource()`, handle `'afr'` case:
  - Trigger file input click
  - On file selection: construct source, init, connect
  - On cancel: revert select value
- Track active AFR playback to stop it when switching sources

## Data Models

### Frame Index Entry

```typescript
interface FrameIndexEntry {
  timestamp: number   // seconds from recording start (from XML attribute)
  offset: number      // byte offset of base64 content start within the file
  length: number      // byte length of base64 content (whitespace included, stripped on read)
}
```

For a 50MB file with ~45,000 frames: index ≈ 45000 × 20 bytes ≈ 900 KB. Acceptable.

### AFR File Header (parsed via DOMParser)

```typescript
interface AFRHeader {
  sensorWidth: number    // from <Sensors><Width>
  sensorHeight: number   // from <Sensors><Height>
  startTime: string      // from <Recording starttime="..."> (informational only)
}
```

### Packed Bitmap Decoding

```
File byte offset → Blob.slice(offset, offset + length)
  → FileReader.readAsText → raw base64 string (with whitespace)
  → strip whitespace → atob() → 800 raw characters
  → unpack MSB-first:
     for b = 0..799:
       byte = raw.charCodeAt(b)
       for bit = 7..0:
         data[b*8 + (7-bit)] = (byte >> bit) & 1
```

## Error Handling

| Condition | Behavior | Recovery |
|-----------|----------|----------|
| File too small for header | Throw "AFRPlaybackSource: invalid XML" | User selects different file |
| `<Sensors>` missing | Throw "AFRPlaybackSource: missing Sensors dimensions" | User selects different file |
| Dimensions ≠ 80×80 | Throw "AFRPlaybackSource: sensor size mismatch" | User selects different file |
| No `<Frame>` found in scan | Throw "AFRPlaybackSource: no frames in recording" | User selects different file |
| Frame decode wrong byte count | `console.warn`, skip frame, advance index | Playback continues |
| FileReader error during read() | Reject promise with error message | Floor errCallback handles |
| User cancels file dialog | Revert dropdown, no source change | Previous source continues |

## Index Building Strategy

The frame index is built with a text scan rather than full XML parsing:

1. Read the entire file as text (using `FileReader.readAsText` — this creates a string but we only keep the index, not the content).
2. Find `<Frames>` tag position to skip the header.
3. Use regex or `indexOf` to find each `<Frame timestamp="X.XXX">` and matching `</Frame>`.
4. For each frame: record timestamp (parsed from attribute), character offset of content start, and content length.
5. Release the full text string (let GC reclaim it).

**Trade-off:** This briefly holds the full file as a string during index building (~50MB for large files). For truly enormous files this is a concern, but:
- It's a one-time cost at load
- The string is released immediately after indexing
- Electron's V8 can handle a 50MB string transiently
- The alternative (streaming text search with chunked reads) adds significant complexity for minimal benefit in a dev tool

**If memory becomes a problem in practice:** Switch to a chunked scan using `Blob.slice()` in 1MB windows, searching for `<Frame` boundaries across chunk boundaries. This is a future optimization, not a v1 requirement.

## Playback Timing Detail

```
Timeline:
  t=0.000  startTime = performance.now()
  t=0.001  Frame 0 (timestamp 0.001) → deliver immediately
  t=0.004  Frame 1 (timestamp 0.004) → deliver at elapsed ≥ 0.003s from first
  t=0.026  Frame 2 (timestamp 0.026) → deliver at elapsed ≥ 0.025s from first
  ...
  t=END    Last frame delivered → dispatch "playbackDone"
           Reset startTime, reset index → continue from Frame 0
```

The `firstTimestamp` offset (usually ~0.001s) is subtracted so playback starts immediately rather than waiting for the first frame's timestamp to elapse.

## Bit-Order Verification

The implementation starts with MSB-first. Visual verification:
1. Load the sample recording
2. Render the grid in the simple-sensors behavior
3. Check that active cells appear in the correct physical location
4. If mirrored horizontally → switch to LSB-first
5. If mirrored vertically → invert row order

Both unpacking loops are provided in the implementation spec for easy switching.
