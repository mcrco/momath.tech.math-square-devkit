/* MoMath Math Square — Main Entry Point
 * Initializes sensors, floor tracking, and the behavior render loop.
 * Self-initializes when loaded as an ESM module (no onload handler needed).
 */

import * as Sensor from 'sensors';
import Floor from 'floor';
import {blserver} from 'prod';

/* ─── Semaphore / BLAST Callback ─── */

let currentSemaphoreGuid: string | null = null;
let semaphoreCallbackSent = false;
let launcherProvidedUrl: string | null = null;

const DEFAULT_SEMAPHORE_URL = "http://192.168.72.13:9090/";

async function sendSemaphoreCallback() {
  if (semaphoreCallbackSent) return;
  semaphoreCallbackSent = true;

  if (!currentSemaphoreGuid) {
    console.log('[semaphore] No GUID — skipping callback.');
    return;
  }

  const baseUrl = launcherProvidedUrl || DEFAULT_SEMAPHORE_URL;
  const sep = baseUrl.includes('?') ? '&' : '?';
  const callbackUrl = `${baseUrl}${sep}semaphore=${encodeURIComponent(currentSemaphoreGuid)}`;

  console.log('[semaphore] Sending callback to:', callbackUrl);
  try {
    await fetch(callbackUrl, { method: 'GET', mode: 'no-cors' });
    console.log('[semaphore] Callback sent.');
  } catch (error) {
    console.error('[semaphore] Callback failed:', error);
  }
}

/* ─── Query Parameters ─── */

export const params: {[key: string]: string | null} = {};
location.search.substring(1).split('&').forEach((arg) => {
  const kv = arg.split('=', 2);
  params[kv[0]] = kv.length === 2 ? decodeURIComponent(kv[1].replace(/\+/g, ' ')) : null;
});

// Extract semaphore info from params (passed by app.js)
if (params.semaphoreguid) {
  currentSemaphoreGuid = params.semaphoreguid;
}
if (params.launcher_callback_url) {
  try {
    launcherProvidedUrl = decodeURIComponent(params.launcher_callback_url);
  } catch (e) {
    // Use default
  }
}

/* ─── Electron Integration (optional) ─── */

let electron: any = null;
let app: any = null;

try {
  const mod: any = await import('electron');
  if (mod) {
    electron = mod;
    app = mod.remote.getGlobal('app');

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      app.menu.popup(electron.remote.getCurrentWindow());
    }, false);
  }
} catch {
  /* no electron — running in plain browser or electron not available */
}

function fatal(msg: any) {
  console.error('[fatal]', msg);
  if (app) {
    setTimeout(() => { app.fatal(msg); }, 10000);
  }
}

/* ─── Sensor Source ─── */

function createSensorSource(type?: string): Sensor.Source {
  switch (type) {
    case 'bl':
      const url = params.blserver || blserver;
      if (url) return new Sensor.BLSource(url);
      // fall through to null if no URL
    case 'null':
      return new Sensor.NullSource();
    case 'raindrop':
      return new Sensor.RaindropSource();
    default:
      return createSensorSource('bl');
  }
}

/* ─── Floor ─── */

const DEV = location.pathname.endsWith('/dev.html');
const scene = <HTMLDivElement>document.getElementById('scene');

// In dev mode, default to raindrop (random) sensors so something always renders.
// In production, default to BL server.
const defaultSensor = DEV ? 'raindrop' : 'bl';
export const floor = new Floor(createSensorSource(params.sensors || defaultSensor));
floor.errCallback = (err) => console.warn('[floor]', err);

/* ─── Dev Mode Sensor Controls ─── */

const form = <HTMLFormElement | null>document.getElementById('form');
if (form && DEV) {
  const sensorInput = <HTMLSelectElement | null>form.elements.namedItem('sensors');
  const mouseCheckBox = <HTMLInputElement | null>form.elements.namedItem('mouseCheckBox');
  const afrFileInput = <HTMLInputElement | null>document.getElementById('afrFileInput');

  if (sensorInput) {
    sensorInput.value = params.sensors || 'raindrop';
    const mouseSource = new Sensor.MouseSource(scene);

    // Track previous sensor value for reverting on file dialog cancel
    let previousSensorValue: string = sensorInput.value;
    // Track active AFR source so we can stop it when switching away
    let activeAFRSource: Sensor.AFRPlaybackSource | null = null;

    const stopActiveAFR = () => {
      if (activeAFRSource) {
        activeAFRSource.stop();
        activeAFRSource = null;
      }
    };

    const updateSource = () => {
      // Stop any active AFR playback when switching away
      if (sensorInput.value !== 'afr') {
        stopActiveAFR();
      }

      if (sensorInput.value === 'afr') {
        if (!afrFileInput) return;

        // Trigger the hidden file input
        afrFileInput.click();

        // Use a one-time change listener to detect file selection
        const onFileChange = async () => {
          afrFileInput.removeEventListener('change', onFileChange);
          window.removeEventListener('focus', onFocusCancel);

          const file = afrFileInput.files && afrFileInput.files[0];
          if (!file) {
            // No file selected — revert dropdown
            sensorInput.value = previousSensorValue;
            return;
          }

          // Reset the file input so the same file can be re-selected
          afrFileInput.value = '';

          try {
            // Stop any previously active AFR source
            stopActiveAFR();

            const afrSource = new Sensor.AFRPlaybackSource(file);
            await afrSource.init();
            floor.source = afrSource;
            activeAFRSource = afrSource;
            previousSensorValue = 'afr';

            // Drive playback using embedded timestamps
            Sensor.runAFRPlayback(afrSource, (result) => {
              if (typeof result === 'string') {
                floor.errCallback(result);
              }
              return 1; // continue playback
            });
          } catch (err: any) {
            floor.errCallback(String(err));
            // Revert dropdown on error
            sensorInput.value = previousSensorValue;
          }
        };

        // Detect file dialog cancel via window focus
        // When the file dialog closes without selection, focus returns to the window
        const onFocusCancel = () => {
          // Small delay to allow the change event to fire first if a file was selected
          setTimeout(() => {
            // If the change event already fired, this listener was removed
            // If still attached, no file was selected (cancel)
            afrFileInput.removeEventListener('change', onFileChange);
            window.removeEventListener('focus', onFocusCancel);

            if (!afrFileInput.files || afrFileInput.files.length === 0) {
              sensorInput.value = previousSensorValue;
            }
          }, 300);
        };

        afrFileInput.addEventListener('change', onFileChange);
        window.addEventListener('focus', onFocusCancel, { once: true });

      } else {
        // Existing source handling for bl, null, raindrop
        previousSensorValue = sensorInput.value;
        const source = createSensorSource(sensorInput.value);
        if (mouseCheckBox && mouseCheckBox.checked) {
          mouseSource.source = source;
          mouseSource.start();
          floor.source = mouseSource;
        } else {
          mouseSource.stop();
          floor.source = source;
        }
      }
    };

    sensorInput.onchange = updateSource;
    if (mouseCheckBox) mouseCheckBox.onchange = updateSource;
  }
}

/* ─── Behavior Loading ─── */

function setupRenderLoop(prog: any) {
  if (!prog.render || !prog.frameRate) return;

  const renderFn = prog.render.bind(prog, floor);

  switch (prog.frameRate) {
    case 'static':
      renderFn();
      break;
    case 'animate':
    case 'animation':
      const frame = () => { renderFn(); requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
      break;
    case 'sensor':
    case 'sensors':
    case 'floor':
      floor.update = renderFn;
      break;
    default:
      if (typeof prog.frameRate === 'number') {
        setInterval(renderFn, 1000 / prog.frameRate);
      }
  }
}

try {
  const beh = await import('./behs/simple-sensors.js');
  const prog = beh.default || beh.behavior;
  if (!prog) {
    console.error('[main] Invalid behavior module');
  } else {
    console.log('[main] Loaded behavior:', prog.title);
    document.title = "Math Square: " + prog.title;

    // Configure floor tracking
    floor.maxUsers = prog.maxUsers === undefined ? 40 : prog.maxUsers;
    floor.setGhosts(prog.numGhosts, prog.ghostBounds, prog.ghostRate);
    if (prog.userUpdate) floor.userUpdate = prog.userUpdate;

    // Initialize the behavior
    const initResult = prog.init(scene);
    const startRendering = () => {
      sendSemaphoreCallback();
      if (prog.maxUsers !== null) floor.connect();
      setupRenderLoop(prog);
    };

    if (initResult && typeof initResult.then === 'function') {
      initResult.then(startRendering).catch((e: any) => fatal(e));
    } else {
      startRendering();
    }
  }
} catch (err: any) {
  console.error('[main] Failed to load behavior:', err);
  fatal(err);
}
