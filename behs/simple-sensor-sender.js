/* MoMath Math Square Behavior
 * © 2026 National Museum of Mathematics. All rights reserved.
 *
 *        Title: Simple Sensor Sender
 *  Description: Minimal example of sending sensor data to Pixels.
 *               Each active sensor cell increases the corresponding pixel.
 *               No blobbing — shows the raw 80x80 grid data directly.
 *    Framework: Canvas2D (native)
 */

import * as Display from 'display';
import * as Sensors from 'sensors';
import { Pixels } from 'lib/pixels';

var canvas, ctx, pixels;

// Each sensor cell in pixels
const cellW = Display.width / Sensors.width;
const cellH = Display.height / Sensors.height;

function init(container) {
  canvas = document.createElement('canvas');
  canvas.width = Display.width;
  canvas.height = Display.height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  container.appendChild(canvas);
  ctx = canvas.getContext('2d');

  pixels = new Pixels([
    "192.168.109.233",
  ]);
}

function render(floor) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  pixels.clear();

  ctx.fillStyle = '#ff00e6';
  for (let y = 0; y < Sensors.height; y++) {
    for (let x = 0; x < Sensors.width; x++) {
      const idx = y * Sensors.width + x;
      if (floor.sensors.data[idx]) {
        ctx.fillRect(x * cellW, y * cellH, cellW, cellH);

        const xPixel = Math.floor(x / 10);
        const yPixel = Math.floor(y / 10);
        pixels.increase(xPixel, yPixel, 0.1);
      }
    }
  }
  const previewSize = 128;
  const ledSize = previewSize / 8;
  const px = canvas.width - previewSize - 8;
  const py = 8;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(px - 2, py - 2, previewSize + 4, previewSize + 4);

  for (let ly = 0; ly < 8; ly++) {
    for (let lx = 0; lx < 8; lx++) {
      const i = (ly * 8 + lx) * 3;
      const r = Math.round(pixels.data[i] * 255);
      const g = Math.round(pixels.data[i + 1] * 255);
      const b = Math.round(pixels.data[i + 2] * 255);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(px + lx * ledSize, py + ly * ledSize, ledSize - 1, ledSize - 1);
    }
  }

  pixels.render();
}

export const behavior = {
  title: "Simple Sensor Sender",
  frameRate: 'sensors',
  maxUsers: 0,
  init: init,
  render: render
};
export default behavior;
