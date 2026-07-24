/* MoMath Math Square Behavior
 * © 2026 National Museum of Mathematics. All rights reserved.
 *
 *        Title: Simple Blobs
 *  Description: Minimal example of blobbed user tracking with pure Canvas2D.
 *               Each user is drawn as a colored circle. No frameworks needed.
 *    Framework: Canvas2D (native)
*/

import * as Display from 'display';

const teamColors = Display.teamColors;

var canvas, ctx;

function init(container) {
  canvas = document.createElement('canvas');
  canvas.width = Display.width;
  canvas.height = Display.height;
 // canvas.style.width = '100%';
 // canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none'; // Let mouse events pass through to scene div
  container.appendChild(canvas);
  ctx = canvas.getContext('2d');
}

function render(floor) {
  // Clear the canvas each frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw each blobbed user as a circle
  for (let user of floor.users) {
    const color = user.id >= 0
      ? teamColors[user.id % teamColors.length]
      : '#ffffff';

    // Filled circle
    ctx.beginPath();
    ctx.arc(user.x, user.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Outline ring
    ctx.beginPath();
    ctx.arc(user.x, user.y, 20, 0, Math.PI * 2);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export const behavior = {
  title: "Simple Blobs (Canvas2D)",
  frameRate: 'animate',
  init: init,
  render: render
};
export default behavior;
