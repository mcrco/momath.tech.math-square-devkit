/* MoMath Math Square Behavior
 * © 2026 National Museum of Mathematics. All rights reserved.
 *
 *        Title: Latent Walk (AFHQ Cats)
 *  Description: Each person steers the next pair of principal components
 *               in an AFHQ v2 cats VAE latent space. A mirrored live decode
 *               fills the floor while attract-mode ghosts morph it when empty.
 *    Framework: Canvas2D + onnxruntime-web
 */

import * as Display from 'display';
import * as ort from 'onnxruntime-web';

const teamColors = Display.teamColors;
const EMA = 0.18;
const Z_EPS = 1e-5;
// The finetuned decoder has a persistent artifact in the viewer-right eye.
// Mirroring its clean half makes bilateral symmetry part of the visual language
// of the exhibit and removes the fixed defect without hiding latent motion.
const MIRROR_FROM_LEFT = true;
// The PCA export stores generous ±4σ/±3σ bounds. Those become unsafe when
// added to a real anchor, so keep final component scores near the data manifold.
const SAFE_PC_FRACTION = 0.55;
const MAX_WALK_RADIUS_SIGMA = 3.2;
// Headless sweeps across all 16 PCs found these five anchors remain stable
// under crowd motion; the others can develop bright eye/ear flares.
const CURATED_ANCHOR_INDICES = [0, 2, 3, 5, 7];

// Swap decoder by folder name under behs/assets/ (e.g. 'afhq-vae', 'mnist-vae').
const MODEL = 'afhq-vae';
// If true, offset a sharp real encoding (meta.anchors); if false, walk around PCA mean.
const USE_LATENT_ANCHORING = true;

let canvas, ctx, offscreen, offCtx;
let session = null;
let meta = null;
let status = 'loading';
let ghostsActive = false;
let activeAnchor = null;
let activeAnchorIndex = -1;
let activeAnchorScores = null;
let smoothZ = null;
let lastZ = null;
let decodeBusy = false;
let pendingZ = null;
let imageData = null;

function assetURL(rel) {
  // Behaviors run from dist/; assets are copied to dist/assets/
  return new URL(rel, window.location.href).href;
}

function anchorPool() {
  if (meta.anchors && meta.anchors.length) {
    const curated = CURATED_ANCHOR_INDICES
      .filter((index) => index < meta.anchors.length)
      .map((index) => meta.anchors[index]);
    if (curated.length) return curated;
    return meta.anchors;
  }
  if (meta.anchor) return [meta.anchor];
  return [meta.mu];
}

function pickAnchor(randomize) {
  const pool = anchorPool();
  let idx = 0;
  if (randomize && pool.length > 1) {
    // Do not begin two attract cycles with the same cat.
    idx = (Math.random() * (pool.length - 1)) | 0;
    if (idx >= activeAnchorIndex) idx++;
  }
  activeAnchorIndex = idx;
  activeAnchor = pool[idx];
  activeAnchorScores = meta.components.map((component) => {
    let score = 0;
    for (let d = 0; d < component.length; d++) {
      score += (activeAnchor[d] - meta.mu[d]) * component[d];
    }
    return score;
  });
}

function syncGhosts(floor, realUsers) {
  if (realUsers.length > 0) {
    if (ghostsActive) {
      floor.setGhosts(0);
      ghostsActive = false;
    }
    return;
  }
  if (!ghostsActive) {
    // New attract cycle → optional fresh anchor, then ghosts steer PCs around it.
    if (USE_LATENT_ANCHORING) pickAnchor(true);
    const n = Math.random() < 0.5 ? 1 : 2;
    floor.setGhosts(n);
    ghostsActive = true;
  }
}

function selectActors(floor) {
  const real = floor.users.filter((u) => u.id >= 0);
  syncGhosts(floor, real);
  if (real.length > 0) return real.slice().sort((a, b) => a.id - b.id);
  // Attract: only ghosts (negative ids)
  return floor.users.filter((u) => u.id < 0).slice().sort((a, b) => a.id - b.id);
}

function baseLatent() {
  if (USE_LATENT_ANCHORING) {
    if (!activeAnchor) pickAnchor(false);
    return Float32Array.from(activeAnchor);
  }
  return Float32Array.from(meta.mu);
}

function buildLatent(actors) {
  // Offset base (anchor or PCA mean) along the walked PCs. Component travel is
  // anchor-aware: center floor is the sharp real encoding, and walking toward
  // an edge uses only the room remaining inside a conservative global bound.
  const z = baseLatent();
  const maxPairs = meta.maxPairs;
  const n = Math.min(actors.length, maxPairs);
  const deltas = new Float32Array(meta.nComponents);
  for (let i = 0; i < n; i++) {
    const u = actors[i];
    const pc0 = 2 * i;
    const pc1 = pc0 + 1;
    const x = Math.max(-1, Math.min(1, 2 * u.x / Display.width - 1));
    const y = Math.max(-1, Math.min(1, 1 - 2 * u.y / Display.height));
    for (const [pc, axis] of [[pc0, x], [pc1, y]]) {
      const center = USE_LATENT_ANCHORING ? activeAnchorScores[pc] : 0;
      const low = meta.pcMin[pc] * SAFE_PC_FRACTION;
      const high = meta.pcMax[pc] * SAFE_PC_FRACTION;
      deltas[pc] = axis < 0
        ? axis * Math.max(0, center - low)
        : axis * Math.max(0, high - center);
    }
  }

  // A crowd can otherwise put every independently safe PC at its extreme at
  // once. Cap the combined standardized displacement while preserving direction.
  let radiusSq = 0;
  for (let pc = 0; pc < deltas.length; pc++) {
    const exportedRadius = 0.5 * (meta.pcMax[pc] - meta.pcMin[pc]);
    const sigmaScale = meta.pcSigmaScale ? meta.pcSigmaScale[pc] : 3;
    const sigma = exportedRadius / sigmaScale;
    if (sigma > 0) radiusSq += (deltas[pc] / sigma) ** 2;
  }
  const radius = Math.sqrt(radiusSq);
  const scale = radius > MAX_WALK_RADIUS_SIGMA
    ? MAX_WALK_RADIUS_SIGMA / radius
    : 1;
  for (let pc = 0; pc < deltas.length; pc++) {
    const component = meta.components[pc];
    const amount = deltas[pc] * scale;
    for (let d = 0; d < z.length; d++) z[d] += amount * component[d];
  }
  return z;
}

function emaZ(target) {
  if (!smoothZ || smoothZ.length !== target.length) {
    smoothZ = new Float32Array(target);
    return smoothZ;
  }
  for (let i = 0; i < target.length; i++) {
    smoothZ[i] = smoothZ[i] + (target[i] - smoothZ[i]) * EMA;
  }
  return smoothZ;
}

function zChanged(z) {
  if (!lastZ || lastZ.length !== z.length) return true;
  let acc = 0;
  for (let i = 0; i < z.length; i++) {
    const d = z[i] - lastZ[i];
    acc += d * d;
  }
  return acc > Z_EPS;
}

function clampByte(v) {
  return Math.max(0, Math.min(255, (v * 255) | 0));
}

async function decode(z) {
  const feeds = {
    [meta.inputName]: new ort.Tensor('float32', z, [1, meta.latentDim]),
  };
  const results = await session.run(feeds);
  const out = results[meta.outputName];
  const data = out.data;
  const size = meta.imageSize;
  const channels = meta.channels || 1;
  if (!imageData || imageData.width !== size) {
    imageData = offCtx.createImageData(size, size);
  }
  const px = imageData.data;
  const plane = size * size;
  if (channels === 1) {
    for (let i = 0; i < plane; i++) {
      const v = clampByte(data[i]);
      const o = i * 4;
      px[o] = v;
      px[o + 1] = v;
      px[o + 2] = v;
      px[o + 3] = 255;
    }
  } else {
    // ONNX NCHW: [1, C, H, W] planar
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const sourceX = MIRROR_FROM_LEFT && x >= size / 2 ? size - 1 - x : x;
        const source = y * size + sourceX;
        const o = i * 4;
        px[o] = clampByte(data[source]);
        px[o + 1] = clampByte(data[plane + source]);
        px[o + 2] = clampByte(data[2 * plane + source]);
        px[o + 3] = 255;
      }
    }
  }
  offCtx.putImageData(imageData, 0, 0);
  lastZ = Float32Array.from(z);
}

function queueDecode(z) {
  pendingZ = z;
  if (decodeBusy) return;
  decodeBusy = true;
  (async () => {
    while (pendingZ) {
      const next = pendingZ;
      pendingZ = null;
      try {
        await decode(next);
      } catch (err) {
        console.error('[latent-walk] decode failed', err);
        status = 'error: decode failed';
      }
    }
    decodeBusy = false;
  })();
}

function drawStatus(msg) {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ccc';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
}

function drawAxes() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, Display.height / 2);
  ctx.lineTo(Display.width, Display.height / 2);
  ctx.moveTo(Display.width / 2, 0);
  ctx.lineTo(Display.width / 2, Display.height);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PC odd →', 16, Display.height / 2 - 10);
  ctx.save();
  ctx.translate(Display.width / 2 + 10, 28);
  ctx.fillText('PC even ↑', 0, 0);
  ctx.restore();
  ctx.restore();
}

function drawActors(actors) {
  for (let i = 0; i < actors.length; i++) {
    const user = actors[i];
    const isGhost = user.id < 0;
    const color = isGhost
      ? 'rgba(255,255,255,0.55)'
      : teamColors[i % teamColors.length];
    const pcA = 2 * i + 1;
    const pcB = 2 * i + 2;

    ctx.beginPath();
    ctx.arc(user.x, user.y, isGhost ? 12 : 16, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(user.x, user.y, isGhost ? 16 : 22, 0, Math.PI * 2);
    ctx.strokeStyle = isGhost ? 'rgba(255,255,255,0.35)' : '#444';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (!isGhost && i < meta.maxPairs) {
      ctx.fillStyle = '#fff';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`PC${pcA}–${pcB}`, user.x, user.y - 28);
    }
  }
}

async function init(container) {
  canvas = document.createElement('canvas');
  canvas.width = Display.width;
  canvas.height = Display.height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  container.appendChild(canvas);
  ctx = canvas.getContext('2d');

  offscreen = document.createElement('canvas');
  offscreen.width = 256;
  offscreen.height = 256;
  offCtx = offscreen.getContext('2d');

  drawStatus(`Loading ${MODEL}…`);

  try {
    ort.env.wasm.wasmPaths = assetURL('./ort/');
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated
      ? Math.min(4, navigator.hardwareConcurrency || 1)
      : 1;
    ort.env.webgpu.powerPreference = 'high-performance';

    const assetRoot = `./assets/${MODEL}`;
    const metaRes = await fetch(assetURL(`${assetRoot}/meta.json`));
    if (!metaRes.ok) throw new Error(`meta.json HTTP ${metaRes.status}`);
    meta = await metaRes.json();

    offscreen.width = meta.imageSize;
    offscreen.height = meta.imageSize;

    const modelUrl = assetURL(`${assetRoot}/decoder.onnx`);
    try {
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }, 'wasm'],
      });
    } catch (err) {
      console.warn('[latent-walk] webgpu unavailable, using wasm', err);
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
      });
    }

    status = 'ready';
    if (USE_LATENT_ANCHORING) pickAnchor(false);
    await decode(baseLatent());
  } catch (err) {
    console.error('[latent-walk] init failed', err);
    status = 'error: ' + (err && err.message ? err.message : String(err));
  }
}

function render(floor) {
  if (status !== 'ready') {
    drawStatus(status);
    return;
  }

  const actors = selectActors(floor);
  if (actors.length > 0) {
    const zTarget = buildLatent(actors);
    const z = emaZ(zTarget);
    if (zChanged(z)) queueDecode(Float32Array.from(z));
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
  drawAxes();
  drawActors(actors);
}

export const behavior = {
  title: `Latent Walk (${MODEL})`,
  frameRate: 'animate',
  maxUsers: 8,
  init,
  render,
};
export default behavior;
