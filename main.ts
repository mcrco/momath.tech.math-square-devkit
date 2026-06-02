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

  if (sensorInput) {
    sensorInput.value = params.sensors || 'raindrop';
    const mouseSource = new Sensor.MouseSource(scene);

    const updateSource = () => {
      const source = createSensorSource(sensorInput.value);
      if (mouseCheckBox && mouseCheckBox.checked) {
        mouseSource.source = source;
        mouseSource.start();
        floor.source = mouseSource;
      } else {
        mouseSource.stop();
        floor.source = source;
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
