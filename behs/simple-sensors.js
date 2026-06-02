/* MoMath Math Square Behavior
 *
 *        Title: Simple Sensors
 *  Description: Minimal example of raw sensor grid rendering with pure Canvas2D.
 *               Each active sensor cell is drawn as a colored rectangle.
 *               No blobbing — shows the raw 80x80 grid data directly.
 *    Framework: Canvas2D (native)
 */

import * as Display from 'display';
import * as Sensors from 'sensors';

var canvas, ctx;

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
}

function render(floor) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw each active sensor cell
  ctx.fillStyle = '#00ff88';
  for (let y = 0; y < Sensors.height; y++) {
    for (let x = 0; x < Sensors.width; x++) {
      const idx = y * Sensors.width + x;
      if (floor.sensors.data[idx]) {
        ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
      }
    }
  }
}

export const behavior = {
  title: "Simple Sensors (Canvas2D)",
  frameRate: 'sensors',
  maxUsers: 0,
  init: init,
  render: render
};
export default behavior;
