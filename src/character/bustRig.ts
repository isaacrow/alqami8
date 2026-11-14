import * as THREE from 'three';

/**
 * Brings an unrigged bust scan to life without bones: the shaders bend and repaint the mesh by region.
 *  - mouth: drawn per pixel on the skin, because the scan has only a few dozen vertices around the lips. The lips
 *    slide apart on the texture (the upper lip a little, the lower lip with the jaw), the opening shows a dark mouth
 *    with upper teeth, lower teeth and a tongue; the lips spread (ee, s), round (oo, o), press together (m, b, p) and
 *    the lower lip tucks under the upper teeth (f, v). The chin itself drops a little with the jaw (vertices);
 *  - smile: the corners lift, and the cheeks with them;
 *  - brows: rise on emphasis and when he is surprised;
 *  - eyes: the irises move (the texture slides inside each eye) to look at the visitor, with small saccades, and the
 *    eyelids close in a blink (skin-coloured lids drawn over the eye, top down);
 *  - head: everything above the collar turns and nods around the neck;
 *  - breath: the chest rises slowly.
 *
 * All regions are measured on public/characters/jawahiri.glb (model units; the bust faces +Z, Y up). The face's
 * centre line is at x≈0.02, the lips meet at y≈0.095, the eyes sit behind the glasses at (-0.12, 0.39) and
 * (0.165, 0.385), the brows at y≈0.49. Another bust needs its own numbers.
 */
export interface EyeRegion {
  centre: THREE.Vector2;
  radius: THREE.Vector2;
  /** Eyelid colour (sRGB 0..255), sampled from the skin under the eye. */
  lid: [number, number, number];
}

export interface BustRegions {
  centreX: number;
  lipLine: number;
  chinBottom: number;
  jawHinge: THREE.Vector3;
  neckPivot: THREE.Vector3;
  headFrom: number;
  headTo: number;
  headHalfWidth: number;
  brows: [THREE.Vector2, THREE.Vector2];
  eyes: [EyeRegion, EyeRegion];
  /**
   * The right eye lies across a seam of the scan's texture, so sliding its own texture tears it. It shows the left
   * eye's iris instead, mirrored: the texture UV at the left eye's centre and how it changes per model unit there
   * ([du/dx, dv/dx, du/dy, dv/dy]), measured on the model.
   */
  leftEyeUv: { centre: THREE.Vector2; perUnit: [number, number, number, number] };
  /** Anything in front of this depth near the eyes (the glasses) is never repainted. */
  eyeMaxZ: number;
}

export const JAWAHIRI_REGIONS: BustRegions = {
  centreX: 0.02,
  lipLine: 0.095,
  chinBottom: -0.11,
  jawHinge: new THREE.Vector3(0.02, 0.12, 0.12),
  neckPivot: new THREE.Vector3(0.02, -0.22, 0.0),
  headFrom: -0.26,
  headTo: -0.1,
  headHalfWidth: 0.36,
  brows: [new THREE.Vector2(-0.11, 0.49), new THREE.Vector2(0.17, 0.48)],
  eyes: [
    { centre: new THREE.Vector2(-0.12, 0.39), radius: new THREE.Vector2(0.042, 0.028), lid: [211, 158, 132] },
    { centre: new THREE.Vector2(0.165, 0.385), radius: new THREE.Vector2(0.042, 0.028), lid: [199, 151, 120] },
  ],
  leftEyeUv: { centre: new THREE.Vector2(0.1063, 0.3998), perUnit: [-0.0813, 0.1393, 0.1254, 0.0883] },
  eyeMaxZ: 0.47,
};

export interface BustRig {
  /** 0 (closed) .. 1 (wide open). */
  jaw: number;
  /** -1 (round, oo) .. 1 (wide, ee). */
  wide: number;
  /** 0 .. 1: lips rounded and pushed forward (oo, o, w, sh). */
  round: number;
  /** 0 .. 1: upper lip raised, upper teeth showing (aa, s, f). */
  upper: number;
  /** 0 .. 1: lips pressed together (m, b, p). */
  press: number;
  /** 0 .. 1: lower lip tucked under the upper teeth (f, v). */
  tuck: number;
  /** 0 .. 1: tongue raised to the teeth (t, d, n, l, th). */
  tongue: number;
  smile: number;
  brow: number;
  /** 0 open .. 1 closed. */
  blink: number;
  /** Iris shift in model units (x to his left = screen right, y up). */
  gaze: THREE.Vector2;
  /** Radians: + turns to his left (screen right), + pitch looks down. */
  yaw: number;
  pitch: number;
  roll: number;
  breath: number;
  apply(): void;
}

export function rigBust(mesh: THREE.Mesh, r: BustRegions = JAWAHIRI_REGIONS): BustRig {
  const lidColour = (c: [number, number, number]) => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
  const uniforms = {
    uJaw: { value: 0 },
    uWide: { value: 0 },
    uRound: { value: 0 },
    uUpper: { value: 0 },
    uPress: { value: 0 },
    uTuck: { value: 0 },
    uTongue: { value: 0 },
    uSmile: { value: 0 },
    uBrow: { value: 0 },
    uBlink: { value: 0 },
    uGaze: { value: new THREE.Vector2() },
    uHead: { value: new THREE.Matrix3() },
    uBreath: { value: 0 },
    uLidL: { value: lidColour(r.eyes[0].lid) },
    uLidR: { value: lidColour(r.eyes[1].lid) },
  };
  const material = mesh.material as THREE.MeshStandardMaterial;
  const f = (n: number) => n.toFixed(4);
  const v2 = (v: THREE.Vector2) => `vec2(${f(v.x)}, ${f(v.y)})`;
  const v3 = (v: THREE.Vector3) => `vec3(${f(v.x)}, ${f(v.y)}, ${f(v.z)})`;
  const CX = f(r.centreX);
  const LIP = f(r.lipLine);

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uJaw;
uniform float uWide;
uniform float uSmile;
uniform float uBrow;
uniform mat3 uHead;
uniform float uBreath;
varying vec3 vRest;
float ell(vec2 p, vec2 c, vec2 r) { return 1.0 - smoothstep(0.5, 1.0, length((p - c) / r)); }
float jawWeight(vec3 p) {
  return (1.0 - smoothstep(${f(r.lipLine - 0.06)}, ${f(r.lipLine - 0.03)}, p.y))
       * smoothstep(${f(r.chinBottom - 0.09)}, ${f(r.chinBottom)}, p.y)
       * (1.0 - smoothstep(0.10, 0.19, abs(p.x - ${CX})))
       * smoothstep(0.22, 0.40, p.z);
}
float headWeight(vec3 p) {
  return smoothstep(${f(r.headFrom)}, ${f(r.headTo)}, p.y) * (1.0 - smoothstep(${f(r.headHalfWidth)}, ${f(r.headHalfWidth + 0.1)}, abs(p.x)));
}
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
// Lips, smile, cheeks and brows, on the face at rest.
vec3 faceShape(vec3 p) {
  vec3 q = p;
  float front = smoothstep(0.38, 0.46, p.z);
  float dx = p.x - ${CX};
  float corner = (1.0 - smoothstep(0.0, 0.035, abs(abs(dx) - 0.065))) * (1.0 - smoothstep(0.0, 0.04, abs(p.y - ${LIP}))) * front;
  q.y += uSmile * 0.011 * corner;
  q.x += sign(dx) * uSmile * 0.006 * corner;
  q.z -= uSmile * 0.004 * corner;
  float cheek = ell(vec2(abs(dx), p.y), vec2(0.10, 0.20), vec2(0.07, 0.06)) * smoothstep(0.30, 0.45, p.z);
  q.y += uSmile * 0.006 * cheek;
  float brow = max(ell(p.xy, ${v2(r.brows[0])}, vec2(0.085, 0.04)), ell(p.xy, ${v2(r.brows[1])}, vec2(0.085, 0.04))) * (1.0 - smoothstep(0.50, 0.54, p.z));
  q.y += uBrow * 0.014 * brow;
  return q;
}
mat3 rigMatrix(vec3 p, out vec3 jawPivot, out vec3 neckPivot, out float hw) {
  jawPivot = ${v3(r.jawHinge)};
  neckPivot = ${v3(r.neckPivot)};
  hw = headWeight(p);
  return rotX(uJaw * 0.07 * jawWeight(p));
}
vec3 rigPosition(vec3 p) {
  vec3 jp; vec3 np; float hw;
  mat3 jaw = rigMatrix(p, jp, np, hw);
  vec3 q = jaw * (faceShape(p) - jp) + jp;
  vec3 turned = uHead * (q - np) + np;
  q = mix(q, turned, hw);
  // Breathing: the chest and shoulders rise and widen a little.
  float chest = 1.0 - smoothstep(-0.3, -0.15, p.y);
  q.y += uBreath * 0.006 * chest;
  q.xz *= 1.0 + uBreath * 0.004 * chest;
  return q;
}
vec3 rigNormal(vec3 p, vec3 n) {
  vec3 jp; vec3 np; float hw;
  mat3 jaw = rigMatrix(p, jp, np, hw);
  vec3 m = jaw * n;
  return normalize(mix(m, uHead * m, hw));
}`
      )
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = rigNormal(position, normal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = rigPosition(position);\nvRest = position;`);

    const [L, R] = r.eyes;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uJaw;
uniform float uWide;
uniform float uRound;
uniform float uUpper;
uniform float uPress;
uniform float uTuck;
uniform float uTongue;
uniform float uBlink;
uniform vec2 uGaze;
uniform vec3 uLidL;
uniform vec3 uLidR;
varying vec3 vRest;
// The mouth, per pixel, around where the lips meet (model units, at rest). mouthOpening() gives the edges of the
// opening; mouthShift() where to read the skin texture from, so the lips appear to move apart.
vec2 mouthPos() { return vRest.xy - vec2(${CX}, ${LIP}); }
float mouthFront() { return smoothstep(0.40, 0.46, vRest.z); }
float mouthHalfWidth() { return 0.074 * (1.0 + 0.30 * max(uWide, 0.0) - 0.36 * uRound); }
// x: how far the upper edge rises, y: how far the lower edge drops, at this point across the mouth.
vec2 mouthOpening(vec2 m) {
  float nx = m.x / mouthHalfWidth();
  float across = clamp(1.0 - nx * nx, 0.0, 1.0);
  float shut = 1.0 - uPress;
  float up = (0.007 * uUpper + 0.004 * uJaw + 0.003 * uRound) * across * shut;
  float down = (0.042 * uJaw * pow(across, 0.6) + 0.004 * uRound * across) * shut - 0.005 * uTuck * across;
  return vec2(up, max(down, 0.0));
}
vec2 mouthShift(vec2 m) {
  vec2 o = mouthOpening(vec2(m.x, 0.0));
  float nx = m.x / mouthHalfWidth();
  float side = 1.0 - smoothstep(0.9, 1.5, abs(nx));
  float fall = m.y > 0.0 ? 1.0 - smoothstep(0.0, 0.045, m.y) : 1.0 - smoothstep(0.0, 0.09, -m.y);
  // Read from nearer the lip line: the upper lip appears raised, the lower lip lowered.
  float dy = m.y > 0.0 ? -o.x : o.y;
  // Wider or rounder lips: read from nearer (or further from) the centre line.
  float spread = 1.0 + 0.30 * max(uWide, 0.0) - 0.32 * uRound;
  // Capped: further out, the texture crosses a seam of the scan (dark specks appeared below the right lip corner).
  float dx = clamp(m.x / spread - m.x, -0.010, 0.010);
  // Pressed lips roll in a little; a tucked lower lip rides up under the teeth.
  dy += (m.y > 0.0 ? 0.0025 : -0.0025) * uPress + (m.y < 0.0 ? -0.007 * uTuck : 0.0);
  return vec2(dx, dy) * side * fall * mouthFront();
}
// The inside of the mouth: rgb + coverage (0 outside the opening).
vec4 mouthInside(vec2 m) {
  vec2 o = mouthOpening(m);
  float nx = m.x / mouthHalfWidth();
  float aa = max(fwidth(m.y), 1e-5) * 1.5;
  float cover = smoothstep(-o.y - aa, -o.y + aa, m.y) * (1.0 - smoothstep(o.x - aa, o.x + aa, m.y)) * (1.0 - smoothstep(0.92, 1.0, abs(nx)));
  cover *= mouthFront() * step(0.0005, o.x + o.y);
  float depth = 1.0 - 0.5 * abs(nx);
  vec3 col = vec3(0.07, 0.022, 0.022) * (0.6 + 0.6 * (1.0 - depth));
  // Tongue at the bottom, rising for t, d, n, l, th.
  float tongueTop = -o.y + 0.010 + 0.014 * uTongue;
  float tongue = (1.0 - smoothstep(tongueTop - aa, tongueTop + aa, m.y)) * (1.0 - smoothstep(0.45, 0.7, abs(nx)));
  col = mix(col, vec3(0.46, 0.15, 0.14) * (0.75 + 0.25 * depth), tongue);
  // Lower teeth, just inside the lower lip, when the mouth is well open.
  float lowTeeth = (1.0 - smoothstep(-o.y + 0.005 - aa, -o.y + 0.005 + aa, m.y)) * (1.0 - smoothstep(0.5, 0.62, abs(nx))) * smoothstep(0.35, 0.6, uJaw);
  col = mix(col, vec3(0.70, 0.66, 0.58) * (0.7 + 0.3 * depth), lowTeeth);
  // Upper teeth, hanging from the upper lip: a fixed height, so a small opening shows mostly teeth.
  float upTeeth = smoothstep(o.x - 0.009 - aa, o.x - 0.009 + aa, m.y) * (1.0 - smoothstep(0.62, 0.78, abs(nx)));
  float gaps = 0.92 + 0.08 * smoothstep(0.2, 0.5, abs(fract(nx * 3.2) - 0.5));
  col = mix(col, vec3(0.86, 0.82, 0.74) * (0.72 + 0.28 * depth) * gaps, upTeeth);
  return vec4(col, cover);
}
float eyeMask(vec2 c, vec2 r, float soft) {
  return (1.0 - smoothstep(soft, 1.0, length((vRest.xy - c) / r))) * (1.0 - smoothstep(${f(r.eyeMaxZ - 0.01)}, ${f(r.eyeMaxZ)}, vRest.z));
}
// The eyelid comes down from the top of the eye; returns how much of this point it covers.
float lid(vec2 c, vec2 r) {
  float edge = c.y + r.y * (1.0 - 2.0 * uBlink);
  return eyeMask(c, r * 1.15, 0.85) * smoothstep(edge - 0.002, edge + 0.002, vRest.y) * step(0.02, uBlink);
}`
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  // The irises follow uGaze: inside each eye, read the texture from the opposite direction.
  // How the texture's UV changes per model unit here, from screen-space derivatives (UV islands are rotated).
  mat2 dUv = mat2(dFdx(vMapUv), dFdy(vMapUv));
  mat2 dPos = mat2(dFdx(vRest.xy), dFdy(vRest.xy));
  mat2 uvPerUnit = abs(determinant(dPos)) > 1e-14 ? dUv * inverse(dPos) : mat2(0.0);
  float inLeft = eyeMask(${v2(L.centre)}, ${v2(L.radius)}, 0.55);
  // On a seam of the texture the UV rate jumps (normal values are about 0.1 to 0.2 per unit): no lip shift there.
  float uvRate = max(length(uvPerUnit[0]), length(uvPerUnit[1]));
  vec2 lipShift = mouthShift(mouthPos()) * (1.0 - smoothstep(0.5, 0.9, uvRate));
  vec4 skin = texture2D( map, vMapUv - inLeft * (uvPerUnit * uGaze) + uvPerUnit * lipShift );
  // Right eye: the left eye's texture, mirrored left-right, moved with the gaze.
  float inRight = eyeMask(${v2(R.centre)}, ${v2(R.radius)}, 0.4);
  vec2 q = vRest.xy - uGaze - ${v2(R.centre)};
  vec2 fromLeft = ${v2(r.leftEyeUv.centre)} + mat2(${r.leftEyeUv.perUnit.map(f).join(', ')}) * vec2(-q.x, q.y);
  diffuseColor *= mix(skin, texture2D( map, fromLeft ), inRight);
#endif
float lidL = lid(${v2(L.centre)}, ${v2(L.radius)});
float lidR = lid(${v2(R.centre)}, ${v2(R.radius)});
diffuseColor.rgb = mix(diffuseColor.rgb, uLidL, lidL);
diffuseColor.rgb = mix(diffuseColor.rgb, uLidR, lidR);
vec4 inside = mouthInside(mouthPos());
float mouth = inside.a;
diffuseColor.rgb = mix(diffuseColor.rgb, inside.rgb, mouth);`
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, max(mouth, max(lidL, lidR)));');
  };
  material.customProgramCacheKey = () => 'alqami-bust-rig-3';
  material.needsUpdate = true;

  const euler = new THREE.Euler();
  const m4 = new THREE.Matrix4();
  const rig: BustRig = {
    jaw: 0,
    wide: 0,
    round: 0,
    upper: 0,
    press: 0,
    tuck: 0,
    tongue: 0,
    smile: 0,
    brow: 0,
    blink: 0,
    gaze: new THREE.Vector2(),
    yaw: 0,
    pitch: 0,
    roll: 0,
    breath: 0,
    apply() {
      uniforms.uJaw.value = rig.jaw;
      uniforms.uWide.value = rig.wide;
      uniforms.uRound.value = rig.round;
      uniforms.uUpper.value = rig.upper;
      uniforms.uPress.value = rig.press;
      uniforms.uTuck.value = rig.tuck;
      uniforms.uTongue.value = rig.tongue;
      uniforms.uSmile.value = rig.smile;
      uniforms.uBrow.value = rig.brow;
      uniforms.uBlink.value = rig.blink;
      uniforms.uGaze.value.copy(rig.gaze);
      uniforms.uBreath.value = rig.breath;
      euler.set(rig.pitch, rig.yaw, rig.roll, 'YXZ');
      uniforms.uHead.value.setFromMatrix4(m4.makeRotationFromEuler(euler));
    },
  };
  // The mesh bends in the shader, so its box must be loose enough not to be culled while turning.
  mesh.frustumCulled = false;
  return rig;
}

/** One mouth shape: jaw 0..1, wide -1 (round) .. 1 (spread), and the rest 0..1 (see BustRig). */
export interface MouthShape {
  jaw: number;
  wide: number;
  round?: number;
  upper?: number;
  press?: number;
  tuck?: number;
  tongue?: number;
}

export interface VoiceFeatures {
  /** Loudness 0..1. */
  level: number;
  /** Where the sound's energy sits, 0 (dark: oo, o) .. 1 (bright: ee, s). */
  bright: number;
  /** Mouth shape read from the voice by HeadAudio (lipSync.ts), when it runs. */
  mouth?: MouthShape;
}

const approach = (from: number, to: number, rate: number, dt: number) => from + (to - from) * Math.min(1, dt * rate);

/** Natural motion on top of the targets: smoothing, breathing, glances, blinks, saccades, talking nods, expressions. */
export class BustMotion {
  targetYaw = 0;
  targetPitch = 0;
  private jaw = 0;
  private t = 0;
  private glance = 0;
  private glanceYaw = 0;
  private nodLeft = 0;
  private smileLeft = 0;
  private browLeft = 0;
  private nextBlink = 2;
  private blinkT = -1;
  private nextSaccade = 0.5;
  private saccade = new THREE.Vector2();
  private loudAvg = 0.1;
  // Speech beats: a small nod lands on each stressed syllable (an opening louder than his recent average).
  private beat = 0;
  private closedFor = 1;
  private talkFor = 0;
  private wasTalking = false;
  constructor(private rig: BustRig) {}

  /** A short nod with a smile (he noticed a gesture). */
  nod() {
    this.nodLeft = 0.7;
    this.smileLeft = 1.6;
    this.browLeft = 0.6;
  }

  update(dt: number, voice: VoiceFeatures, hasTarget: boolean) {
    this.t += dt;
    const rig = this.rig;
    // Jaw follows the voice quickly when opening and a little slower when closing, as real speech looks.
    // With HeadAudio, the jaw follows the recognised mouth shapes (scaled a little by loudness); else loudness alone.
    const jawTarget = voice.mouth ? voice.mouth.jaw * Math.min(1, 0.6 + voice.level * 2) : voice.level;
    this.jaw = approach(this.jaw, jawTarget, jawTarget > this.jaw ? 28 : 14, dt);
    const talking = this.jaw > 0.05;

    // Lip shape from the sound: bright sounds spread the lips, dark sounds round them.
    const wideTarget = voice.mouth ? voice.mouth.wide : talking ? THREE.MathUtils.clamp((voice.bright - 0.42) * 3, -1, 1) * Math.min(1, this.jaw * 2) : 0;
    rig.wide = approach(rig.wide, Math.max(0, wideTarget), 16, dt);
    // Without HeadAudio, dark sounds round the lips.
    const m = voice.mouth;
    rig.round = approach(rig.round, m ? (m.round ?? Math.max(0, -m.wide)) : Math.max(0, -wideTarget), 14, dt);
    rig.upper = approach(rig.upper, m?.upper ?? (talking ? 0.25 * this.jaw : 0), 18, dt);
    rig.press = approach(rig.press, m?.press ?? 0, 30, dt);
    rig.tuck = approach(rig.tuck, m?.tuck ?? 0, 24, dt);
    rig.tongue = approach(rig.tongue, m?.tongue ?? 0, 22, dt);

    // Brows rise on a stressed word (louder than his recent average) and on surprise.
    this.loudAvg = approach(this.loudAvg, voice.level, 0.8, dt);
    if (talking && voice.level > this.loudAvg * 1.7 && voice.level > 0.35 && this.browLeft <= 0) this.browLeft = 0.45;
    this.browLeft -= dt;
    // A beat on a syllable that opens after a near-close and is stressed.
    if (this.jaw < 0.2) this.closedFor += dt;
    else if (this.closedFor > 0.06 && this.jaw > 0.35 && voice.level > this.loudAvg * 1.25) {
      this.beat = 1;
      this.closedFor = 0;
    } else if (this.jaw >= 0.2) this.closedFor = 0;
    this.beat = Math.max(0, this.beat - dt * 4);
    // At the end of a phrase people often blink.
    this.talkFor = talking ? this.talkFor + dt : this.talkFor;
    if (this.wasTalking && !talking && this.talkFor > 0.8 && Math.random() < 0.6) this.nextBlink = Math.min(this.nextBlink, 0.12);
    if (!talking && !this.wasTalking) this.talkFor = 0;
    this.wasTalking = talking;
    rig.brow = approach(rig.brow, this.browLeft > 0 ? 1 : 0, this.browLeft > 0 ? 14 : 5, dt);

    // A friendly half-smile while listening; a full one when greeted.
    this.smileLeft -= dt;
    rig.smile = approach(rig.smile, this.smileLeft > 0 ? 1 : talking ? 0.1 : 0.3, 4, dt);

    // Blinks every 2–6 s, sometimes twice in a row, about 160 ms each.
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0;
      this.nextBlink = Math.random() < 0.2 ? 0.3 : 2 + Math.random() * 4;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      rig.blink = this.blinkT < 0.16 ? Math.sin((this.blinkT / 0.16) * Math.PI) : 0;
      if (this.blinkT >= 0.16) this.blinkT = -1;
    }

    // Without anyone to look at, an occasional slow glance.
    this.glance -= dt;
    if (this.glance <= 0) {
      this.glance = 3 + Math.random() * 4;
      this.glanceYaw = (Math.random() - 0.5) * 0.35;
    }
    const yaw = hasTarget ? this.targetYaw : this.glanceYaw;
    // The head turns most of the way; the eyes do the rest.
    const headYaw = yaw * 0.75;
    const pitch = hasTarget ? this.targetPitch : 0.03;
    this.nodLeft = Math.max(0, this.nodLeft - dt);
    const ack = this.nodLeft > 0 ? Math.sin(((0.7 - this.nodLeft) / 0.7) * Math.PI * 2) * 0.13 : 0;
    const nod = ack + this.beat * this.beat * 0.045 + (talking ? Math.sin(this.t * 1.7) * 0.015 : 0);
    // Quick while talking too, or the speech beats would be smoothed away.
    const ease = Math.min(1, dt * (hasTarget || this.nodLeft > 0 || talking ? 6 : 1.6));
    rig.yaw += (headYaw - rig.yaw) * ease;
    rig.pitch += (pitch + nod - rig.pitch) * ease;
    rig.roll = Math.sin(this.t * 0.6) * 0.02 + (talking ? Math.sin(this.t * 2.3) * 0.015 : 0);

    // The eyes get there before the head: they look at the rest of the way, plus tiny saccades.
    this.nextSaccade -= dt;
    if (this.nextSaccade <= 0) {
      this.nextSaccade = 0.4 + Math.random() * 1.6;
      this.saccade.set((Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.003);
    }
    const gx = THREE.MathUtils.clamp((yaw - rig.yaw) * 0.06 + this.saccade.x, -0.012, 0.012);
    const gy = THREE.MathUtils.clamp(-(pitch - rig.pitch) * 0.05 + this.saccade.y, -0.007, 0.007);
    rig.gaze.set(approach(rig.gaze.x, gx, 30, dt), approach(rig.gaze.y, gy, 30, dt));

    rig.breath = Math.sin(this.t * 1.35) * 0.5 + 0.5;
    rig.jaw = Math.min(1, this.jaw * 1.2);
    rig.apply();
  }
}
