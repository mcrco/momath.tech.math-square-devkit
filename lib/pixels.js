/* UDP pixel sender for 8×8 LED matrix badges.
 * Ported from Perl art-frame sender.
 *
 * Protocol: 4-byte LE magic (0x54534c50) + 4-byte LE blend time (ms)
 *           + 64 × 3-byte RGB triplets = 200 bytes total.
 */

const MAGIC = 0x54534c50;
const GRID = 8;
const NUM_PIXELS = GRID * GRID;
const MSG_LEN = 8 + NUM_PIXELS * 3;

class Pixels {
  constructor(hosts, { port = 5453, blendTime = 1000 } = {}) {
    this.blendTime = blendTime;
    this.port = port;
    this.hosts = hosts;
    this.data = new Float32Array(NUM_PIXELS * 3);
    this.sockets = null;
    this.sendCount = 0;
    this.errorCount = 0;
    this._initSockets();
  }

  _initSockets() {
    try {
      const dgram = globalThis['require']('dgram');
      this.sockets = [];
      for (let i = 0; i < this.hosts.length; i++) {
        const host = this.hosts[i];
        const sock = dgram.createSocket('udp4');

        sock.on('error', (err) => {
          this.errorCount++;
          console.error(`Pixels: socket error for ${host}: ${err.message}`);
        });

        sock.on('close', () => {
          console.log(`Pixels: socket closed for ${host}`);
        });

        this.sockets.push(sock);
        console.log(`Pixels: socket created for ${host}:${this.port}`);
      }
      console.log(`Pixels: initialized ${this.sockets.length} socket(s), packet size ${MSG_LEN} bytes`);
    } catch (e) {
      console.warn(`Pixels: dgram not available (${e.message}), UDP sending disabled`);
      this.sockets = null;
    }
  }

  clear() {
    this.data.fill(0);
  }

  increase(x, y, value) {
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) return;
    const i = (y * GRID + x) * 3;
    this.data[i]     = Math.min(1, this.data[i]     + value);
    this.data[i + 1] = Math.min(1, this.data[i + 1] + value);
    this.data[i + 2] = Math.min(1, this.data[i + 2] + value);
  }

  increaseRGB(x, y, r, g, b) {
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) return;
    const i = (y * GRID + x) * 3;
    this.data[i]     = Math.min(1, this.data[i]     + r);
    this.data[i + 1] = Math.min(1, this.data[i + 1] + g);
    this.data[i + 2] = Math.min(1, this.data[i + 2] + b);
  }

  set(x, y, r, g, b) {
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) return;
    const i = (y * GRID + x) * 3;
    this.data[i]     = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
  }

  render(blendTime) {
    if (!this.sockets) return;

    try {
      const bt = blendTime !== undefined ? blendTime : this.blendTime;

      const msg = new Uint8Array(MSG_LEN);
      const view = new DataView(msg.buffer);
      view.setUint32(0, MAGIC, true);
      view.setUint32(4, bt, true);

      for (let i = 0; i < NUM_PIXELS; i++) {
        msg[8 + i * 3]     = Math.round(this.data[i * 3]     * 255);
        msg[8 + i * 3 + 1] = Math.round(this.data[i * 3 + 1] * 255);
        msg[8 + i * 3 + 2] = Math.round(this.data[i * 3 + 2] * 255);
      }

      this.sendCount++;

      for (let s = 0; s < this.sockets.length; s++) {
        this.sockets[s].send(msg, 0, msg.length, this.port, this.hosts[s], (err) => {
          if (err) {
            this.errorCount++;
            console.error(`Pixels: send to ${this.hosts[s]} failed: ${err.message}`);
          }
        });
      }
    } catch (e) {
      this.errorCount++;
      console.error(`Pixels: render() threw: ${e.message || e}`);
    }
  }

  status() {
    return {
      hosts: this.hosts,
      port: this.port,
      connected: this.sockets !== null,
      socketCount: this.sockets ? this.sockets.length : 0,
      sendCount: this.sendCount,
      errorCount: this.errorCount,
    };
  }

  close() {
    if (!this.sockets) return;
    for (const s of this.sockets) {
      try { s.close(); } catch (_) {}
    }
    console.log(`Pixels: closed. ${this.sendCount} packets sent, ${this.errorCount} errors`);
    this.sockets = null;
  }
}

export { Pixels, GRID, NUM_PIXELS };
