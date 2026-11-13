import * as THREE from 'three';

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * The "4D" view: a captured point-cloud sequence (Any4D, packed by scripts/pack-pointcloud.mjs) played as a loop.
 * It is the real person moving, as filmed, rather than a sculpted bust: the frames play faster while he speaks and
 * slowly while he listens. Sized and centred like the bust (about 1.84 units tall, facing +Z).
 */
export class PointCloud4D {
  readonly object = new THREE.Group();
  private frames: THREE.Points[] = [];
  private material: THREE.PointsMaterial;
  private clock = 0;
  private index = 0;
  private direction = 1;

  constructor() {
    this.material = new THREE.PointsMaterial({ size: 0.011, vertexColors: true, sizeAttenuation: true });
  }

  async load(url: string) {
    const buf = await (await fetch(url)).arrayBuffer();
    if (new TextDecoder().decode(new Uint8Array(buf, 0, 6)) !== 'ALQ4D1') throw new Error('not a 4D file');
    const headerLen = new DataView(buf).getUint32(6, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 10, headerLen))) as { frames: Array<{ count: number; offset: number }>; min: number[]; max: number[] };
    const base = 10 + headerLen;
    const { min, max } = header;
    const size = max.map((v, k) => v - min[k]);
    const centre = min.map((v, k) => v + size[k] / 2);
    // Fit him like the bust: by height, but never wider than the bust's shoulders.
    const scale = Math.min(1.84 / size[1], 1.9 / size[0]);
    // Centre on his head (the middle of the top quarter of the first frame), not on the whole capture.
    {
      const fr = header.frames[0];
      const q = new Int16Array(buf, base + fr.offset, fr.count * 3);
      const xs: number[] = [];
      const zs: number[] = [];
      for (let i = 0; i < fr.count; i++) {
        const y = ((q[i * 3 + 1] + 32768) / 65535) * size[1] + min[1];
        if (y > max[1] - size[1] * 0.25) {
          xs.push(((q[i * 3] + 32768) / 65535) * size[0] + min[0]);
          zs.push(((q[i * 3 + 2] + 32768) / 65535) * size[2] + min[2]);
        }
      }
      const median = (a: number[]) => a.sort((m, n) => m - n)[Math.floor(a.length / 2)] ?? 0;
      if (xs.length) {
        centre[0] = median(xs);
        centre[2] = median(zs);
      }
    }
    for (const fr of header.frames) {
      const q = new Int16Array(buf, base + fr.offset, fr.count * 3);
      const c = new Uint8Array(buf, base + fr.offset + fr.count * 6, fr.count * 3);
      const pos = new Float32Array(fr.count * 3);
      for (let i = 0; i < fr.count * 3; i++) {
        const k = i % 3;
        pos[i] = ((((q[i] + 32768) / 65535) * size[k] + min[k]) - centre[k]) * scale;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      // The capture's colours are sRGB; the renderer works in linear light.
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(c).map((v) => srgbToLinear(v / 255)), 3));
      const points = new THREE.Points(g, this.material);
      points.visible = this.frames.length === 0;
      this.frames.push(points);
      this.object.add(points);
    }
  }

  /** Steps through the frames back and forth: quicker while speaking. */
  update(dt: number, voiceLevel: number) {
    if (this.frames.length < 2) return;
    const fps = voiceLevel > 0.05 ? 7 : 1.5;
    this.clock += dt;
    if (this.clock < 1 / fps) return;
    this.clock = 0;
    this.frames[this.index].visible = false;
    if (this.index + this.direction < 0 || this.index + this.direction >= this.frames.length) this.direction *= -1;
    this.index += this.direction;
    this.frames[this.index].visible = true;
  }
}
