/* MoMath Math Square low-level sensors
 * Describes the sensor space and provides utilites to sample, filter, generate, record, blob, and track sensor readings.
 */

const W = 80;
const H = 80;
const N = W * H;

export const width = W
export const height = H

export interface Vector {
  readonly x: number
  readonly y: number
}

/* An vector in grid space, possibly negative */
export class Coord implements Vector {
  x: number
  y: number
  o!: number

  constructor();
  constructor(p: Coord);
  constructor(o: number);
  constructor(x: number, y: number);
  constructor(x?: any, y?: number) {
    if (x instanceof Coord) {
      this.x = x.x
      this.y = x.y
      this.o = x.o
    } else if (y != null) {
      this.x = x|0;
      this.y = y|0;
      if (this.x > -W && this.x < W) {
        this.o = this.y*W + this.x;
      }
    } else {
      this.o = x|0;
      this.x = this.o%W;
      this.y = (this.o-this.x)/W;
    }
  }

  incr(): this|undefined {
    this.x ++;
    this.o ++;
    return this;
  }

  get abs2(): number {
    return this.x*this.x + this.y*this.y;
  }
}

/* An index in the grid */
export class Index extends Coord {
  constructor();
  constructor(p: Coord);
  constructor(o: number);
  constructor(x: number, y: number);
  constructor(x?: any, y?: number) {
    super(x, <number>y);
    if (this.x < 0)
      this.o = NaN;
  }

  get valid(): boolean {
    return this.o >= 0 && this.o < N;
  }

  incr(): this|undefined {
    super.incr();
    if (this.x >= W) {
      if (this.o >= N)
        return undefined;
      this.x = 0;
      this.y ++;
    }
    return this;
  }

  add(p: Coord): this {
    this.x += p.x;
    this.y += p.y;
    this.o += p.o;
    if (this.x >= W || this.x < 0) {
      this.o = NaN;
    } else if (this.x < 0) {
      this.x += W;
      this.y --;
    }
    return this;
  }

  plus(p: Coord): Index {
    return (new Index(this)).add(p);
  }
}

/* Generate the list of coordinates making up a disc of radius d, starting with (0,0) */
function disc(d: number): Coord[] {
  const n = Math.floor(d);
  if (n < 0 || n >= W)
    throw "Radius too large";
  const dd = d*d;
  const r: Coord[] = [];
  function add(x: number, y: number): void {
    r.push(new Coord(x, y));
  }
  function addx(x: number, y: number): void {
           add( x, y);
    if (x) add(-x, y);
  }
  function addxy(x: number, y: number): void {
           addx(x,  y);
    if (y) addx(x, -y);
  }
  add(0,0);
  for (let i = 1; i <= n; i ++) {
    addx(i, 0);
    addxy(0, i);
  }
  for (let y = 1; y <= n; y ++) {
    const yy = y*y;
    for (let x = 1; x <= n; x ++) {
      if (yy + x*x > dd)
        break;
      addxy(x, y);
    }
  }
  return r;
}

/* A two-dimensional WxH array of values, indexable by Index, implemented by a TypedArray */
abstract class TypedGrid {
  protected abstract get constr(): TypedArrayConstructor
  readonly data!: TypedArray

  constructor(grid?: TypedGrid) {
    // Subclass getter is available at runtime via prototype chain
    const Ctor = (this as unknown as { constr: TypedArrayConstructor }).constr;
    (this as any).data = grid ? new Ctor(grid.data) : new Ctor(N);
  }

  /* Get the value at index (or undefined if out of range) */
  get(p: Index): number|undefined {
    return this.data[p.o];
  }

  /* Set a value at index, returning the value (or undefined if out of range) */
  set(p: Index, v: number): number|undefined {
    this.data[p.o] = v;
    return this.data[p.o];
  }

  /* Replace all data in this grid with zeros */
  clear() {
    this.data.fill(0);
  }

  /* Replace the data in this grid with data from another grid */
  copyFrom(grid: TypedGrid) {
    this.data.set(grid.data);
  }

  /* Create a new typed-array with all the values from a rectangular region bounded by corners [inclusive-start, end-exclusive) */
  private subblock(start: Index, end: Index): TypedArray[] {
    let l = [];
    let w = end.x - start.x;
    for (let o = start.o; o < end.o; o += W)
      l.push(this.data.subarray(o, o+w));
    return l;
  }

  /* Test if the given predicate is satisfied by any value in a rectangular subregion */
  someBlock(callback: (value: number) => boolean, start: Index, end: Index, thisArg?: any): boolean {
    for (let r of this.subblock(start, end))
      if (r.some(callback, thisArg))
        return true;
    return false;
  }

  reduceBlock<A>(callback: (previousValue: A, currentValue: number) => A, initialValue: A, start: Index, end: Index): A {
    let x = initialValue;
    for (let r of this.subblock(start, end))
      x = r.reduce(callback, x);
    return x;
  }

  sumBlock(start: Index, end: Index): number {
    return this.reduceBlock((a,b) => a+b, 0, start, end);
  }

  countBlock(start: Index, end: Index): number {
    return this.reduceBlock((a,b) => b>0 ? a+1 : a, 0, start, end);
  }
}

type GridDiff = number[]|number|null

export class ByteGrid extends TypedGrid {
  protected get constr() {
    return Uint8ClampedArray;
  }
  /* Produce a symmetric list of differences between two boolean grids */
  diff(grid: ByteGrid): GridDiff {
    let r = [];
    for (let o = 0; o < N; o++)
      if (grid.data[o] != this.data[o])
        r.push(o);
    return r.length == 1 ? r[0] : r;
  }
  /* Toggle the values from a list of differences:
   * a.apply(a.diff(b)) => b for all boolean grids a, b */
  apply(diff: GridDiff|undefined) {
    if (typeof diff === 'number')
      diff = [diff];
    if (Array.isArray(diff))
      for (let o of diff)
        this.data[o] = this.data[o] ? 0 : 1;
  }
}

export class UIntGrid extends TypedGrid {
  protected get constr() {
    return Uint16Array;
  }
}

class FloatGrid extends TypedGrid {
  protected get constr() {
    return Float32Array;
  }
}

class DoubleGrid extends TypedGrid {
  protected get constr() {
    return Float64Array;
  }
}

export type Grid = ByteGrid
type Recording = GridDiff[]

/* A source (generator) for T values */
interface TSource<T> {
  read(): Promise<T>
}

/* Simple source constructor */
function Source<T>(src: () => Promise<T>): TSource<T> {
  return { read: src };
}

/* Take a list of sources, using each one up until it produces an error. */
class ChainSource<T> extends Array<TSource<T>> implements TSource<T> {
  read(): Promise<T> {
    switch (this.length) {
      case 0:
        return Promise.reject("ChainSource: empty");
      case 1:
        return this[0].read();
      default:
        return this[0].read().catch(() => {
          this.shift();
          return this.read();
        });
    }
  }
}

/* The type of sensor readers: a sensor grid generator */
export type Source = TSource<Grid>

/* Always produce the same (empty) grid */
export class NullSource extends ByteGrid implements Source {
  read() {
    // this.clear();
    return Promise.resolve(this);
  }
}

/* Populate a grid from a bright logic XML server */
export class BLSource extends ByteGrid implements Source {
  constructor(public url: string) {
    super();
  }

  read(): Promise<this> {
    return new Promise<this>((resolve, reject) => {
      const q = new XMLHttpRequest();
      q.addEventListener("loadend", () => {
        if (q.readyState != 4 || q.status != 200)
          return reject("GET " + this.url + ": " + (q.statusText || q.status));
        const s = q.responseXML as any;
        if (!s || s.contentType != "text/xml")
          return reject("content " + (s && s.contentType));
        let e = s.documentElement as Element|null;
        if (!e || e.tagName != "BLFloor")
          return reject("XML " + (e && e.tagName));
        if (e.getAttribute("sensorsX") != <any>W || e.getAttribute("sensorsY") != <any>H)
          return reject("size " + e.getAttribute("sensorsX") + "," + e.getAttribute("sensorsY"));
        e = e.firstElementChild;
        if (!e || e.tagName != "Rows")
          return reject("rows " + (e && e.tagName));
        if (e.childElementCount != H)
          return reject("row count " + e.childElementCount);
        const l = e.childNodes as NodeListOf<Element>;
        let i = 0;
        for (let y = 0; y < H; y ++) {
          const r = l[y];
          if (r.tagName != "Row" || r.getAttribute("rownum") != <any>y)
            return reject("row " + y + " " + r.tagName + " " + r.getAttribute("rownum"));
          const v = r.getAttribute("values") || "";
          const s = v.split(",");
          if (s.length != W)
            return reject("row " + y + " " + v);
          for (let x = 0; x < W; x ++)
            this.data[i++] = +(s[x] === '*');
        }
        return resolve(this);
      });
      try {
        q.open("GET", this.url);
        q.send();
      } catch (e: unknown) {
        return reject("GET " + this.url + ": " + String(e));
      }
    });
  }
}

/* A transparent source filter that records all readings in the recording property */
export class RecordSource implements Source {
  public recording: Recording = []
  private last = new ByteGrid()

  constructor(public source: Source) {
  }

  read(): Promise<Grid> {
    return this.source.read().then((input) => {
      this.recording.push(input.diff(this.last));
      this.last.copyFrom(input);
      return input;
    });
  }
}

/* Playback a Recording from RecordSource */
export class PlaybackSource extends ByteGrid implements Source {
  public recording: Recording

  constructor(recording: Recording|string) {
    super();
    if (typeof recording === 'string')
      recording = JSON.parse(recording);
    if (Array.isArray(recording))
      this.recording = recording;
    else
      throw "Invalid recording";
  }

  get remaining(): number {
    return this.recording.length;
  }

  read() {
    if (!this.recording.length){
      var doneEvent = new CustomEvent("playbackDone");
      document.dispatchEvent(doneEvent);
      return Promise.reject("PlaybackSource: recording finished");
    }
    const frame = this.recording.shift();
    this.apply(frame);
    return Promise.resolve(this);
  }
}

export class RaindropSource extends ByteGrid implements Source {
  constructor() {
    super();
  }

  private pop = 0

  read() {
    const
      b0 = new Coord(-1,-1),
      b1 = new Coord(+1,+1),
      t = this.pop / 80,
      t0 = t,               /* kill if < t0 */
      tc = (19+t)/20,       /* leave if < tc */
      t1 = (49999+t)/50000; /* cluster if < t1 */
                            /* vivify otherwise */
    let p = 0;
    for (let i: Index|undefined = new Index(); i; i = i.incr()) {
      const r = Math.random();
      if (r < t0)
        this.set(i, 0);
      else if (r < tc) {
        p += <number>this.get(i);
      } else if (r < t1) {
        const c = this.sumBlock(i.plus(b0), i.plus(b1));
        if (c > 0 && c < 6) {
          this.set(i, 1);
          p ++;
        } else if (c > 6)
          this.set(i, 0);
        else
          p += <number>this.get(i);
      } else {
        this.set(i, 1);
        p ++;
      }
    }
    this.pop = p;
    return Promise.resolve(this);
  }
}

/* filtering is done by exponentially smoothing input using both sup(ression) and act(ivation) parameters.
 * Values must exceed act and not exceed sup. */
export class FilterSource extends ByteGrid implements Source {
  private readonly sup = new DoubleGrid()
  private readonly act = new DoubleGrid()
  private last = 0

  constructor(public source: Source,
              public supTau: number, /* suppression 1/e time constant */
              public supThresh: number, /* suppression threshold */
              public actTau: number, /* activation 1/e time constant */
              public actThresh: number /* activation threshold */
             ) {
    super();
  }

  read(): Promise<this> {
    return this.source.read().then((input) => {
      /* b = 1-alpha */
      const t = Date.now();
      const dt = t - this.last;
      this.last = t;
      const sb = Math.exp(-dt/this.supTau);
      const ab = Math.exp(-dt/this.actTau);
      for (let i = 0; i < N; i++) {
        this.sup.data[i] = sb*this.sup.data[i] + (1-sb)*input.data[i];
        this.act.data[i] = ab*this.act.data[i] + (1-ab)*input.data[i];
        this.data[i] = +(this.sup.data[i] <= this.supThresh && this.act.data[i] >= this.actThresh);
      }
      return this;
    });
  }
}

export class MouseSource extends ByteGrid implements Source, EventListenerObject {
  private static readonly events = ['mouseup', 'mousedown', 'mousemove', 'mouseenter', 'mouseleave'];
  private static readonly blob = disc(3);
  private mouseIndex: Index|undefined

  constructor(private scene: HTMLElement, public source?: Source|null) {
    super();
  }

  start() {
    this.mouseIndex = undefined;
    for (let e of MouseSource.events)
      this.scene.addEventListener(e, this);
  }

  stop() {
    for (let e of MouseSource.events)
      this.scene.removeEventListener(e, this);
    this.mouseIndex = undefined;
  }

  handleEvent(ev: MouseEvent) {
    if ((ev.type === 'mousedown' || ev.type === 'mousemove' || ev.type === 'mouseenter') && ev.buttons & 1) {
      const rect = this.scene.getBoundingClientRect();
      this.mouseIndex = new Index(
        W*(ev.clientX - rect.left)/rect.width,
        H*(ev.clientY - rect.top )/rect.height);
    } else
      this.mouseIndex = undefined;
  }

  read(): Promise<Grid> {

    const f = (input?: Grid) => {
      if (input) {
        if (!this.mouseIndex)
          return input;
        this.copyFrom(input);
      } else
        this.clear();

      if(this.mouseIndex){
        for(let coord of MouseSource.blob){
          this.set(this.mouseIndex.plus(coord), 1);
        }
      }

      return this;
    };

    return this.source ? this.source.read().then(f) : Promise.resolve(f());
  }
}

export class Reader {
  interval: number

  constructor(public source: Source,
              rate: number, /* target refresh rate, Hz */
             ) {
    this.interval = 1000/rate;
  }

  /* Loop forever loading the floor, calling the handler each time there's new data or an error.
   * Stop when handler returns 0. */
  public run(handler: (result: Grid|string) => number): void {
    let next: number;

    const run = () => {
      next = Date.now() + this.interval;
      this.source.read().then((input) => {
          let wait = handler(input);
          return wait && Math.max(wait, next - Date.now());
        }, (err) => {
          return handler("Sensors.read: " + err);
        }).then((wait) => {
          if (wait)
            setTimeout(run, wait);
        });
    };

    run();
  }
}

/* A collection of points represented by their centroid */
class Blob implements Vector {
  id: number|undefined
  private xs = 0
  private ys = 0
  size: number = 0

  add(p: Vector): void {
    this.xs += p.x;
    this.ys += p.y;
    this.size += p instanceof Blob ? p.size : 1;
  }

  get x(): number {
    return this.xs/this.size;
  }
  get y(): number {
    return this.ys/this.size;
  }
}

export class Blobber {
  /* area to search over for nearby points in blob */
  private readonly mask: Coord[]
  private blobs: Blob[] = []
  /* continuously increasing blob id index */
  private count = 0

  constructor(dist: number, /* blobbing distance */
              public minSize = 1, /* minimum blob size */
              public maxBlobs = Infinity /* maximum blob count */) {
    this.mask = disc(dist);
    /* remove (0,0) */
    this.mask.pop();
  }

  /* calculate the blobs for all the 1 values in the grid and label them 2,... */
  private blob(grid: TypedGrid): Blob[] {
    const r = [];
    for (let i: Index|undefined = new Index(); i; i = i.incr()) {
      if (grid.get(i) === 1) {
        const b = new Blob();
        const label = r.push(b)+1;
        const l: Index[] = [];
        const add = (p: Index) => {
          grid.set(p, label);
          b.add(p);
          l.push(p);
        };
        add(i);
        while (l.length) {
          const p = l.shift() as Index;
          for (let m of this.mask) {
            const c = p.plus(m);
            if (grid.get(c) === 1)
              add(c);
          }
        }
      }
    }
    return r;
  }

  /* greedily find closest blobs, starting with the first (i.e., largest), and assign their ids */
  private track(blobs: Blob[]): void {
    const l = [];
    for (let c of blobs) {
      for (let p of this.blobs) {
        const xd = c.x - p.x;
        const yd = c.y - p.y;
        l.push({c:c, p:p, d:xd*xd+yd*yd});
      }
    }
    l.sort(function(a, b) { return a.d - b.d; });
    for (let i of l)
      if (i.p.id && !i.c.id) {
        i.c.id = i.p.id;
        i.p.id = undefined;
      }
    for (let c of blobs)
      if (!c.id)
        c.id = ++this.count;
    this.blobs = blobs;
  }

  trackBlobs(grid: TypedGrid): Blob[] {
    const r = this.blob(grid);
    r.sort((a, b) => b.size - a.size);
    const m = r.findIndex((b, i) => b.size < this.minSize || i >= this.maxBlobs);
    if (m >= 0)
      r.splice(m);
    this.track(r);
    return r;
  }
}

/**
 * AFR Playback Source — reads BrightLogic .afr recording files and replays them
 * through the Source interface. Uses streaming file access: builds an index of
 * frame byte offsets on init(), then decodes frames on demand via Blob.slice().
 *
 * ── AFR File Format ──────────────────────────────────────────────────────────
 * The .afr file is XML with the following structure:
 *
 *   <BLFloor>
 *     <Sensors>
 *       <Width>80</Width>
 *       <Height>80</Height>
 *     </Sensors>
 *     <Recording starttime="...">
 *       <Frames>
 *         <Frame timestamp="0.001">BASE64_DATA</Frame>
 *         <Frame timestamp="0.026">BASE64_DATA</Frame>
 *         ...
 *       </Frames>
 *     </Recording>
 *   </BLFloor>
 *
 * Each <Frame> contains a base64-encoded packed bitmap:
 *   - 800 bytes = 6400 bits = 80×80 sensor cells
 *   - Each bit: 1 = sensor activated (foot present), 0 = not activated
 *   - Layout: row-major order (row 0 first, left to right)
 *   - Timestamps are seconds elapsed since recording start
 *
 * ── Bit Order: MSB-first ─────────────────────────────────────────────────────
 * For byte at position b, bits are unpacked most-significant-bit first:
 *   bit 7 → sensor index b*8 + 0
 *   bit 6 → sensor index b*8 + 1
 *   ...
 *   bit 0 → sensor index b*8 + 7
 *
 * This matches the BrightLogic ActiveFloor format specification. If visual
 * verification reveals horizontal mirroring, switch to LSB-first ordering.
 * If vertical mirroring, reverse row iteration order. See inline comments
 * in read() for the alternative unpacking code.
 *
 * ── Memory Characteristics (50MB+ files) ─────────────────────────────────────
 * - init() reads the file as text once to build the frame index, then the text
 *   string goes out of scope and is garbage-collected (transient peak ~file size).
 * - frameIndex stores only { timestamp, offset, length } per frame (~20 bytes/entry).
 *   A 50MB file with ~45,000 frames uses ~900KB for the index.
 * - read() uses File.slice(offset, length) to decode one frame at a time (~1KB/read).
 *   The File object is a browser handle to the on-disk file, not an in-memory copy.
 * - Steady-state RSS during playback should stay well under 200MB for typical recordings.
 * - If init() memory spike is problematic, a chunked-scan optimization can replace the
 *   full-text read without changing the public API (see design.md for details).
 */
export class AFRPlaybackSource extends ByteGrid implements Source {
  private file: File
  public frameIndex: Array<{ timestamp: number; offset: number; length: number }> = []
  private index: number = 0
  private _stopped: boolean = false
  public sensorWidth: number = 0
  public sensorHeight: number = 0

  constructor(file: File) {
    super()
    this.file = file
  }

  async init(): Promise<void> {
    const text = await this.file.text()

    // Parse header via DOMParser to extract sensor dimensions
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')

    // Check for XML parse errors
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      throw "AFRPlaybackSource: invalid XML"
    }

    const root = doc.documentElement
    if (!root || root.tagName !== 'BLFloor') {
      throw "AFRPlaybackSource: missing BLFloor element"
    }

    // Extract sensor dimensions from <Sensors><Width> and <Sensors><Height>
    const sensorsEl = root.querySelector('Sensors')
    const widthEl = sensorsEl?.querySelector('Width')
    const heightEl = sensorsEl?.querySelector('Height')

    if (!widthEl || !heightEl) {
      throw "AFRPlaybackSource: missing Sensors dimensions"
    }

    this.sensorWidth = parseInt(widthEl.textContent || '', 10)
    this.sensorHeight = parseInt(heightEl.textContent || '', 10)

    if (isNaN(this.sensorWidth) || isNaN(this.sensorHeight)) {
      throw "AFRPlaybackSource: missing Sensors dimensions"
    }

    if (this.sensorWidth !== W || this.sensorHeight !== H) {
      throw `AFRPlaybackSource: sensor size mismatch (got ${this.sensorWidth}x${this.sensorHeight}, expected 80x80)`
    }

    // Scan text for <Frame timestamp="..."> boundaries to build frameIndex
    // Each entry stores the character offset and length of the base64 content between <Frame ...> and </Frame>
    const frameOpenRegex = /<Frame\s+timestamp="([^"]+)">/g
    const frameCloseTag = '</Frame>'
    let match: RegExpExecArray | null

    while ((match = frameOpenRegex.exec(text)) !== null) {
      const timestamp = parseFloat(match[1])
      const contentStart = match.index + match[0].length
      const closeIndex = text.indexOf(frameCloseTag, contentStart)
      if (closeIndex === -1) break
      const contentLength = closeIndex - contentStart
      this.frameIndex.push({
        timestamp,
        offset: contentStart,
        length: contentLength
      })
    }

    if (this.frameIndex.length === 0) {
      throw "AFRPlaybackSource: no frames in recording"
    }
  }

  read(): Promise<Grid> {
    if (this._stopped) {
      return Promise.reject("AFRPlaybackSource: stopped")
    }

    const frame = this.frameIndex[this.index]

    // Slice the file blob at the stored offset/length, read as text
    const blob = this.file.slice(frame.offset, frame.offset + frame.length)
    return blob.text().then((rawText) => {
      // Strip whitespace from the base64 content
      const base64 = rawText.replace(/\s/g, '')

      // Base64 decode
      const raw = atob(base64)

      // Validate byte count: expect exactly 800 bytes for 80x80 grid
      const expectedBytes = (this.sensorWidth * this.sensorHeight) / 8
      if (raw.length !== expectedBytes) {
        console.warn(`AFRPlaybackSource: frame ${this.index} decoded to ${raw.length} bytes, expected ${expectedBytes} — skipping`)
        // Advance index, wrapping if needed
        this.index++
        if (this.index >= this.frameIndex.length) {
          this.index = 0
          this.clear()
          document.dispatchEvent(new CustomEvent("playbackDone"))
        }
        // Try the next frame recursively
        return this.read()
      }

      // Bit order: MSB-first (confirmed by BrightLogic AFR format spec).
      // Each byte's MSB maps to the lowest sensor index for that byte.
      // If visual verification shows horizontal mirroring, switch to LSB-first:
      //   this.data[b * 8 + bit] = (byte >> bit) & 1  (bit from 0 to 7)
      // If vertical mirroring, reverse row iteration:
      //   read rows from bottom (byte 790) to top (byte 0) instead.
      for (let b = 0; b < raw.length; b++) {
        const byte = raw.charCodeAt(b)
        for (let bit = 7; bit >= 0; bit--) {
          this.data[b * 8 + (7 - bit)] = (byte >> bit) & 1
        }
      }

      // Advance index
      this.index++
      if (this.index >= this.frameIndex.length) {
        // Wrap to beginning (looping playback)
        this.index = 0
        document.dispatchEvent(new CustomEvent("playbackDone"))
      }

      return Promise.resolve(this as Grid)
    })
  }

  get remaining(): number {
    return this.frameIndex.length - this.index
  }

  get nextTimestamp(): number | undefined {
    return this.frameIndex[this.index]?.timestamp
  }

  get stopped(): boolean {
    return this._stopped
  }

  reset(): void {
    this.index = 0
    this.clear()
  }

  stop(): void {
    this._stopped = true
  }
}

/* Drive AFR playback using embedded frame timestamps.
 * Delivers frames to the handler at their original recorded timing.
 * Loops automatically when the recording ends (resets on playbackDone event).
 * Stops when handler returns 0, source.stopped is true, or a read error occurs and handler returns 0. */
export function runAFRPlayback(
  source: AFRPlaybackSource,
  handler: (result: Grid | string) => number
): void {
  let startTime = performance.now()
  let firstTimestamp = source.frameIndex[0].timestamp

  const onPlaybackDone = () => {
    // Reset wall-clock reference for the next loop pass
    startTime = performance.now()
    firstTimestamp = source.frameIndex[0].timestamp
  }

  document.addEventListener("playbackDone", onPlaybackDone)

  const tick = () => {
    if (source.stopped) {
      document.removeEventListener("playbackDone", onPlaybackDone)
      return
    }

    const elapsed = (performance.now() - startTime) / 1000

    // Deliver all frames whose relative timestamp <= elapsed
    const deliverNext = (): void => {
      if (source.stopped) {
        document.removeEventListener("playbackDone", onPlaybackDone)
        return
      }

      const nextTs = source.nextTimestamp
      if (nextTs === undefined) {
        // No more frames available right now; wait for playbackDone reset
        return
      }

      if ((nextTs - firstTimestamp) <= elapsed) {
        source.read().then((grid) => {
          const wait = handler(grid)
          if (wait === 0) {
            document.removeEventListener("playbackDone", onPlaybackDone)
            return
          }
          // Continue delivering frames that are due
          deliverNext()
        }, (err) => {
          const wait = handler("Sensors.read: " + err)
          if (wait === 0) {
            document.removeEventListener("playbackDone", onPlaybackDone)
            return
          }
          // Schedule next tick even after error
          scheduleNext()
        })
      } else {
        // All due frames delivered, schedule next tick
        scheduleNext()
      }
    }

    deliverNext()
  }

  const scheduleNext = () => {
    if (source.stopped) {
      document.removeEventListener("playbackDone", onPlaybackDone)
      return
    }

    const nextTs = source.nextTimestamp
    if (nextTs === undefined) {
      // Source wrapped or exhausted; next tick will pick up after playbackDone resets timing
      return
    }

    const now = performance.now()
    const elapsedNow = (now - startTime) / 1000
    const delta = (nextTs - firstTimestamp) - elapsedNow
    const delayMs = Math.max(0, delta * 1000)
    setTimeout(tick, delayMs)
  }

  // Start the first tick immediately
  tick()
}
