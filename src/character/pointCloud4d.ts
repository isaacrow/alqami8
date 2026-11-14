import * as THREE from 'three';
import { BustMotion, BustRig, VoiceFeatures } from './bustRig';

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * The "4D" view: the real man as captured by Any4D (scripts/pack-pointcloud.mjs), brought to life.
 *
 * The capture has only a few frames, each a slightly different reconstruction, so flipping between them made him jump.
 * Instead the most complete frame is his body, and it moves in the vertex shader like a person: his head turns to look
 * at the visitor and glances around, nods while talking (his jaw drops a little with his voice), he breathes and
 * shifts his weight. The motion comes from the same BustMotion as the sculpted bust, so both behave alike.
 * Points are drawn as soft round dots. Sized like the bust (about 1.84 units tall, facing +Z).
 */
export class PointCloud4D {
  readonly object = new THREE.Group();
  private material: THREE.PointsMaterial | null = null;
  private motion: BustMotion | null = null;
  private uniforms = {
    uHead: { value: new THREE.Matrix3() },
    uJaw: { value: 0 },
    uBreath: { value: 0 },
    uSway: { value: 0 },
  };

  async load(url: string) {
    const buf = await (await fetch(url)).arrayBuffer();
    if (new TextDecoder().decode(new Uint8Array(buf, 0, 6)) !== 'ALQ4D1') throw new Error('not a 4D file');
    const headerLen = new DataView(buf).getUint32(6, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 10, headerLen))) as { frames: Array<{ count: number; offset: number }>; min: number[]; max: number[] };
    const base = 10 + headerLen;
    const { min, max } = header;
    const size = max.map((v, k) => v - min[k]);
    const scale = Math.min(1.84 / size[1], 1.9 / size[0]);

    // The most complete frame (most points) is his body.
    const fr = header.frames.reduce((a, b) => (b.count > a.count ? b : a));
    const q = new Int16Array(buf, base + fr.offset, fr.count * 3);
    const c = new Uint8Array(buf, base + fr.offset + fr.count * 6, fr.count * 3);
    const raw = new Float32Array(fr.count * 3);
    for (let i = 0; i < fr.count * 3; i++) raw[i] = ((q[i] + 32768) / 65535) * size[i % 3] + min[i % 3];

    // Centre on his head (the median of the top quarter), not on the whole capture.
    const top = max[1] - size[1] * 0.25;
    const hx: number[] = [];
    const hz: number[] = [];
    for (let i = 0; i < fr.count; i++) if (raw[i * 3 + 1] > top) hx.push(raw[i * 3]), hz.push(raw[i * 3 + 2]);
    const median = (a: number[]) => a.sort((m, n) => m - n)[Math.floor(a.length / 2)] ?? 0;
    const centre = [median(hx), min[1] + size[1] / 2, median(hz)];
    const pos = new Float32Array(fr.count * 3);
    for (let i = 0; i < fr.count * 3; i++) pos[i] = (raw[i] - centre[i % 3]) * scale;

    // Where his neck is: going down from the top, the first height where the figure gets much wider than his head
    // (the shoulders). Bands of 2% of the height.
    const yTop = (max[1] - centre[1]) * scale;
    const yBottom = (min[1] - centre[1]) * scale;
    const bands = 50;
    const lo = new Array(bands).fill(Infinity);
    const hi = new Array(bands).fill(-Infinity);
    for (let i = 0; i < fr.count; i++) {
      const b = Math.min(bands - 1, Math.floor(((yTop - pos[i * 3 + 1]) / (yTop - yBottom)) * bands));
      lo[b] = Math.min(lo[b], pos[i * 3]);
      hi[b] = Math.max(hi[b], pos[i * 3]);
    }
    const width = lo.map((l, b) => (Number.isFinite(l) ? hi[b] - l : 0));
    const headWidth = median(width.slice(4, 14).filter((w) => w > 0)) || 0.5;
    let neckBand = Math.round(bands * 0.45);
    for (let b = 10; b < bands; b++) {
      if (width[b] > headWidth * 1.45) {
        neckBand = b;
        break;
      }
    }
    const neckY = yTop - ((neckBand + 0.5) / bands) * (yTop - yBottom);
    const headH = yTop - neckY;
    let frontZ = -Infinity;
    for (let i = 0; i < fr.count; i++) if (pos[i * 3 + 1] > neckY) frontZ = Math.max(frontZ, pos[i * 3 + 2]);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // The capture's colours are sRGB; the renderer works in linear light.
    g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(c, (v) => srgbToLinear(v / 255)), 3));

    const f = (n: number) => n.toFixed(4);
    const material = new THREE.PointsMaterial({ size: 0.024, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: true });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform mat3 uHead;
uniform float uJaw;
uniform float uBreath;
uniform float uSway;
vec3 rig(vec3 p) {
  const vec3 neck = vec3(0.0, ${f(neckY)}, ${f(frontZ - headH * 0.45)});
  // Head and the top of the neck turn together; the weight fades in over the neck.
  float head = smoothstep(${f(neckY - headH * 0.25)}, ${f(neckY + headH * 0.15)}, p.y);
  // Jaw: the front of the lower face drops a little with his voice.
  float jaw = smoothstep(${f(neckY + headH * 0.05)}, ${f(neckY + headH * 0.18)}, p.y)
            * (1.0 - smoothstep(${f(neckY + headH * 0.3)}, ${f(neckY + headH * 0.4)}, p.y))
            * smoothstep(${f(frontZ - headH * 0.35)}, ${f(frontZ - headH * 0.1)}, p.z)
            * (1.0 - smoothstep(${f(headH * 0.18)}, ${f(headH * 0.3)}, abs(p.x)));
  vec3 q = p;
  q.y -= uJaw * ${f(headH * 0.05)} * jaw;
  q = mix(q, uHead * (q - neck) + neck, head);
  // Breathing: the chest and shoulders rise and widen a little.
  float chest = 1.0 - smoothstep(${f(neckY - headH * 0.4)}, ${f(neckY)}, p.y);
  q.y += uBreath * ${f(headH * 0.012)} * chest;
  q.x *= 1.0 + uBreath * 0.006 * chest;
  // Weight shift: the whole body leans slowly from side to side, more at the top.
  q.x += uSway * (p.y - ${f(yBottom)}) * 0.012;
  return q;
}`
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = rig(position);');
      // Soft round dots instead of squares.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(pc, pc);
  if (r2 > 1.0) discard;`
      ).replace('#include <premultiplied_alpha_fragment>', '#include <premultiplied_alpha_fragment>\n  gl_FragColor.a *= 1.0 - smoothstep(0.7, 1.0, r2);');
    };
    material.customProgramCacheKey = () => 'alqami-cloud-rig';
    this.material = material;

    const points = new THREE.Points(g, material);
    points.frustumCulled = false;
    this.object.add(points);

    // The same natural motion as the bust, driving this rig.
    const uniforms = this.uniforms;
    const euler = new THREE.Euler();
    const m4 = new THREE.Matrix4();
    let t = 0;
    const rig: BustRig = {
      jaw: 0,
      wide: 0,
      smile: 0,
      brow: 0,
      blink: 0,
      gaze: new THREE.Vector2(),
      yaw: 0,
      pitch: 0,
      roll: 0,
      breath: 0,
      apply() {
        t += 1 / 60;
        uniforms.uJaw.value = rig.jaw;
        uniforms.uBreath.value = rig.breath;
        uniforms.uSway.value = Math.sin(t * 0.23) * 0.6 + Math.sin(t * 0.61) * 0.25;
        // A real head turns further than the sculpted bust's, and the eyes cannot help here.
        euler.set(rig.pitch * 1.2, rig.yaw * 1.3, rig.roll * 1.5, 'YXZ');
        uniforms.uHead.value.setFromMatrix4(m4.makeRotationFromEuler(euler));
      },
    };
    this.motion = new BustMotion(rig);
  }

  /** Where the visitor is (null: nobody), so he can look at them; a nod when he notices a gesture. */
  update(dt: number, voice: VoiceFeatures, look: { x: number; y: number } | null) {
    if (!this.motion) return;
    if (look) {
      this.motion.targetYaw = THREE.MathUtils.clamp((look.x - 0.5) * 1.1, -0.55, 0.55);
      this.motion.targetPitch = THREE.MathUtils.clamp((look.y - 0.45) * 0.7, -0.3, 0.3);
    }
    this.motion.update(dt, voice, Boolean(look));
  }

  nod() {
    this.motion?.nod();
  }

  dispose() {
    this.material?.dispose();
    this.object.traverse((o) => (o as THREE.Points).geometry?.dispose());
  }
}
