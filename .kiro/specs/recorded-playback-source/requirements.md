# Requirements Document

## Introduction

Add a third sensor source to the MoMath Math Square DevKit: `AFRPlaybackSource`. This source reads pre-recorded touch data from BrightLogic `.afr` (ActiveFloor Recording) files and replays it through the existing `Source` interface defined in `sensors.ts`. It is a drop-in replacement for `BLSource` (live floor) or `RaindropSource` (random) during development and testing, enabling developers to test behaviors against real recorded foot traffic without a physical floor connection.

The implementation uses streaming file access to handle large recordings (50MB+) without loading the entire file into memory. Playback loops by default until stopped.

## Glossary

- **AFR_File**: A BrightLogic `.afr` XML file containing timestamped sensor frames as base64-encoded packed bitmaps
- **Frame**: A single sensor grid snapshot within an AFR_File, identified by a timestamp (elapsed seconds from recording start) and a base64-encoded payload of 800 bytes (6400 bits = 80×80 sensors)
- **Frame_Index**: An in-memory array of `{ timestamp, byteOffset, byteLength }` entries built by scanning the AFR_File, enabling random access without holding all frame data in memory
- **Streaming_Parse**: A strategy that reads only the file header and frame boundary offsets upfront, then decodes individual frames on demand using `Blob.slice()` / `FileReader`
- **Packed_Bitmap**: The binary encoding of one frame — 800 bytes where each bit represents one sensor cell (1 = touched, 0 = not touched), MSB-first, row-major order
- **Playback_Loop**: The default behavior where playback restarts from the beginning after reaching the last frame
- **File_Dialog**: A native file picker dialog (via `<input type="file">` or Electron dialog) that allows the developer to select an `.afr` file at runtime
- **Timestamp_Driven_Playback**: A playback strategy that uses embedded frame timestamps to reproduce the original recording timing, rather than a fixed poll rate

## Requirements

### Requirement 1: AFR File Parsing with Streaming Access

**User Story:** As a developer, I want the AFR parser to handle large recording files (50MB+) without loading the entire file contents into memory, so that my machine doesn't run out of RAM.

#### Acceptance Criteria

1. WHEN an AFR_File is selected via the File_Dialog, THE system SHALL read only the XML header (everything before `<Frames>`) to extract sensor dimensions from `<Sensors><Width>` and `<Sensors><Height>`
2. THE system SHALL validate that the extracted sensor dimensions match the module constants (W=80, H=80) and SHALL throw `"AFRPlaybackSource: sensor size mismatch (got NxN, expected 80x80)"` if they do not match
3. THE system SHALL perform a single scan of the file to build a Frame_Index containing the byte offset, byte length, and timestamp of each `<Frame>` element's text content, without storing the base64 payload data in memory
4. IF the AFR_File contains no `<Frame>` elements, THEN THE system SHALL throw `"AFRPlaybackSource: no frames in recording"`
5. IF the XML header cannot be parsed or the `<BLFloor>` root element is missing, THEN THE system SHALL throw `"AFRPlaybackSource: invalid XML"` or `"AFRPlaybackSource: missing BLFloor element"`
6. THE Frame_Index memory footprint SHALL be proportional to the number of frames only (approximately 20 bytes per frame), not to the total file size

### Requirement 2: Frame Decoding

**User Story:** As a developer, I want each frame decoded from the AFR binary format into the standard sensor grid, so that existing behaviors work without modification.

#### Acceptance Criteria

1. WHEN `read()` is called, THE system SHALL retrieve the frame payload at the current index by slicing the file Blob at the stored byte offset and length, then decode the base64 content
2. THE system SHALL unpack the Packed_Bitmap into the `ByteGrid.data` array (Uint8ClampedArray of length 6400) using MSB-first bit ordering: for byte at position `b`, bit `n` (7 down to 0) maps to sensor index `b * 8 + (7 - n)` with value `(byte >> n) & 1`
3. IF the decoded payload does not produce exactly 800 bytes, THEN THE system SHALL log a console warning with the frame index and skip to the next frame rather than crashing
4. THE system SHALL return `Promise.resolve(this)` after successfully decoding a frame, conforming to the `Source` interface (`TSource<Grid>`)
5. THE system SHALL expose a `remaining` getter returning the number of frames not yet played in the current pass

### Requirement 3: Timestamp-Driven Playback

**User Story:** As a developer, I want the recording to play back at its original speed using embedded timestamps, so that I see realistic timing of foot traffic.

#### Acceptance Criteria

1. THE system SHALL provide a `runAFRPlayback(source, handler)` function that drives playback using frame timestamps rather than a fixed Hz poll rate
2. WHEN playback starts, THE system SHALL record a wall-clock start time and compute elapsed time on each tick as `(performance.now() - startTime) / 1000` seconds
3. ON each tick, THE system SHALL deliver all frames whose timestamp (relative to the first frame's timestamp) is less than or equal to the elapsed time, calling the handler for each
4. IF the handler returns 0 for any frame, THEN THE system SHALL stop playback immediately
5. IF frames remain after delivering current-tick frames, THE system SHALL schedule the next tick using `setTimeout` with a delay based on the next frame's timestamp delta
6. WHEN multiple frames have elapsed since the last tick (e.g., after a tab was backgrounded), THE system SHALL deliver them in rapid succession to maintain sync with recording time

### Requirement 4: Looping Playback

**User Story:** As a developer, I want playback to loop continuously by default, so that I can observe behavior reactions to the same recording repeatedly without manual intervention.

#### Acceptance Criteria

1. WHEN the last frame in the recording has been played, THE system SHALL reset the playback index to 0, clear the grid, and continue playback from the beginning without stopping
2. THE system SHALL dispatch a `CustomEvent("playbackDone")` on `document` each time it completes one full pass of the recording (for UI or logging purposes), but SHALL NOT stop playback
3. THE system SHALL provide a `stop()` method that halts the playback loop and prevents further `read()` calls from advancing
4. THE system SHALL provide a `reset()` method that returns playback to frame 0 and clears the grid data

### Requirement 5: File Dialog Integration

**User Story:** As a developer, I want to select an AFR file through a dialog in the dev UI, so that I can easily switch between different recordings and other sensor sources.

#### Acceptance Criteria

1. THE system SHALL add an "AFR" option to the sensor source dropdown in `dev.html` alongside the existing "Off", "Random", and "Server" options
2. WHEN the "AFR" option is selected, THE system SHALL present a file picker dialog accepting `.afr` files
3. WHEN a valid `.afr` file is selected, THE system SHALL construct an `AFRPlaybackSource` from the file and begin Timestamp_Driven_Playback using `runAFRPlayback`
4. WHEN switching away from the "AFR" source to another source type, THE system SHALL stop any active AFR playback
5. IF the user cancels the file dialog without selecting a file, THEN THE system SHALL revert the dropdown to the previously active sensor source

### Requirement 6: Source Interface Compatibility

**User Story:** As a developer, I want the AFR playback source to be fully compatible with the existing Source interface, so that all downstream systems (filtering, blobbing, floor tracking, behaviors) work unchanged.

#### Acceptance Criteria

1. THE `AFRPlaybackSource` class SHALL extend `ByteGrid` and implement the `Source` interface (`TSource<Grid>`), matching the pattern of `BLSource` and `PlaybackSource`
2. THE `AFRPlaybackSource.read()` method SHALL return `Promise<Grid>` where the resolved Grid is the source instance itself (as `BLSource` and `PlaybackSource` do)
3. THE system SHALL work correctly when wrapped in a `FilterSource` for suppression/activation filtering
4. THE system SHALL work correctly when the floor's `Blobber` processes the grid for user tracking
5. NO changes SHALL be required to `floor.ts`, `display.ts`, or any behavior files in `behs/`

### Requirement 7: Error Handling

**User Story:** As a developer, I want clear error messages when something goes wrong with AFR file loading, so that I can quickly diagnose issues.

#### Acceptance Criteria

1. IF the selected file is not valid XML, THEN THE system SHALL throw `"AFRPlaybackSource: invalid XML"`
2. IF `<Sensors>` dimensions are missing from the header, THEN THE system SHALL throw `"AFRPlaybackSource: missing Sensors dimensions"`
3. IF sensor dimensions don't match 80×80, THEN THE system SHALL throw `"AFRPlaybackSource: sensor size mismatch (got NxN, expected 80x80)"`
4. IF a frame's base64 payload decodes to the wrong byte count, THEN THE system SHALL log a warning and skip that frame
5. ALL error messages SHALL be surfaced through the floor's `errCallback` mechanism so they appear in the dev console
