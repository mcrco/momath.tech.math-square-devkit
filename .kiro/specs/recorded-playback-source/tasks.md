# Implementation Plan: AFR Playback Source

## Overview

Add `AFRPlaybackSource` to the DevKit as a streaming, looping sensor source that plays back `.afr` recording files with timestamp-accurate timing. 7 tasks covering the core class, playback engine, UI integration, and verification.

## Tasks

- [ ] 1. Add `AFRPlaybackSource` class to `sensors.ts`: Create the class extending `ByteGrid` implementing `Source`. Constructor takes `File` object and stores it. Add `init()` async method that: reads file as text, parses header via DOMParser to extract `<Sensors>` width/height, validates 80×80, scans text for `<Frame timestamp="...">` boundaries to build `frameIndex` array of `{ timestamp, offset, length }`, throws descriptive errors for invalid XML / missing dimensions / size mismatch / no frames. Add `read()` method that slices file blob at current frame's offset, reads as text, strips whitespace, base64-decodes via `atob()`, unpacks 800 bytes MSB-first into `this.data`, advances index (wraps to 0 at end, dispatches `playbackDone` event on wrap). Add `remaining`, `nextTimestamp`, `stopped` getters and `reset()`, `stop()` methods.
  - **Requirements:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.4, 6.1, 6.2, 7.1, 7.2, 7.3, 7.4

- [ ] 2. Add `runAFRPlayback()` function to `sensors.ts`: Export standalone function `runAFRPlayback(source: AFRPlaybackSource, handler: (result: Grid | string) => number): void`. Record `startTime = performance.now()` and `firstTimestamp = source.frameIndex[0].timestamp`. On each tick: compute elapsed seconds, deliver all frames whose relative timestamp <= elapsed by calling `source.read()` then passing result to handler. If handler returns 0 or source.stopped, stop. If source wraps (playbackDone), reset startTime for next loop pass. Schedule next tick via `setTimeout` with delta to next frame timestamp. Handle rejected reads by passing error string to handler.
  - **Requirements:** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.3

- [ ] 3. Update `dev.html` with AFR UI elements: Add `<option value="afr">AFR Recording</option>` to the sensor `<select>`. Add a hidden `<input type="file" id="afrFileInput" accept=".afr" style="display:none">` element to the form.
  - **Requirements:** 5.1, 5.2

- [ ] 4. Integrate AFR source selection in `main.ts`: In the `updateSource()` function (dev mode sensor controls section), add handling for `sensorInput.value === 'afr'`: trigger click on the hidden file input, listen for `change` event to get the selected File, construct `new AFRPlaybackSource(file)`, call `await source.init()`, set `floor.source = source`, call `runAFRPlayback(source, handler)` where handler calls the floor's sensor update logic. Track active AFR playback handle so it can be stopped when switching to a different source. On file dialog cancel (no file selected), revert `sensorInput.value` to previous source. Ensure switching away from AFR calls `source.stop()` on the active AFR source.
  - **Requirements:** 5.2, 5.3, 5.4, 5.5, 6.3, 6.4, 7.5

- [ ] 5. Verify bit-order with sample recording: Load `documentation/sample.afr.xml` (or a short recording) via the file dialog, run with `simple-sensors` behavior, visually confirm that active sensor cells appear in correct positions. If mirrored horizontally, switch unpack loop to LSB-first. If mirrored vertically, reverse row iteration. Document the confirmed bit order in a code comment.
  - **Requirements:** 2.2

- [ ] 6. Test with full-size recording: Load the 50MB `test.afr` file via file dialog. Confirm: memory usage stays reasonable (< 200MB RSS) during playback, frame rate matches recording timestamps, playback loops correctly at end of file, switching to another sensor source stops AFR playback cleanly, no console errors during sustained playback.
  - **Requirements:** 1.6, 3.6, 4.1, 4.3, 6.3, 6.4, 6.5

- [ ] 7. Handle edge cases and cleanup: Test error paths — file with wrong sensor dimensions, empty file, corrupted base64 frame. Verify error messages appear in console via errCallback. Confirm FilterSource wrapping works (blobbing/tracking still functions). Confirm playbackDone event fires on each loop pass. Remove any debug logging. Add code comments documenting the AFR format and bit-order choice.
  - **Requirements:** 1.2, 1.4, 1.5, 2.3, 4.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5

## Task Dependency Graph

```json
{
  "waves": [
    [1],
    [2, 3],
    [4],
    [5],
    [6, 7]
  ]
}
```

## Notes

- Task 1 is the bulk of new code — the AFRPlaybackSource class with streaming index build and frame decode
- Task 2 depends on Task 1 because it calls `source.read()` and accesses `source.frameIndex`
- Task 3 is pure HTML, independent of Task 2 but both needed before Task 4
- Task 5 must happen before Task 6 — bit order needs to be confirmed on a small file before testing at scale
- The index-building approach reads the full file as text once, then releases it. If this proves problematic for very large files in practice, a chunked-scan optimization can be added later without changing the public API
- The `File` object is kept as a reference for `Blob.slice()` during playback — the browser manages the underlying file handle
- `#[[file:documentation/AFRPlayback-Kiro-Spec.md]]` contains the full format specification including encoding details and sample XML
