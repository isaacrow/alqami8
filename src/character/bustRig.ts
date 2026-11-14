import * as THREE from 'three';

/**
 * Brings an unrigged bust scan to life without bones: the shaders bend and repaint the mesh by region.
 *  - jaw: the chin and lower lip turn down around a hinge with the voice's loudness; the gap between the lips darkens;
 *  - lips: wider for bright sounds (ee, s), rounder and forward for dark ones (oo, o); the corners lift in a smile,
 *    and the cheeks with them;
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
  return (1.0 - smoothstep(${f(r.lipLine - 0.018)}, ${f(r.lipLine + 0.002)}, p.y))
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
  float lips = (1.0 - smoothstep(0.06, 0.10, abs(dx))) * (1.0 - smoothstep(0.03, 0.06, abs(p.y - ${LIP}))) * front;
  q.x += dx * uWide * 0.10 * lips;
  q.z += max(-uWide, 0.0) * 0.009 * lips;
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
  return rotX(uJaw * 0.13 * jawWeight(p));
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
uniform float uBlink;
uniform vec2 uGaze;
uniform vec3 uLidL;
uniform vec3 uLidR;
varying vec3 vRest;
float mouthMask() {
  // The strip of skin that stretches open between the lips, measured at rest, darkened per pixel.
  vec2 d = vec2((vRest.x - ${CX}) / 0.08, (vRest.y - ${f(r.lipLine - 0.011)}) / 0.016);
  return (1.0 - smoothstep(0.55, 1.0, length(d))) * smoothstep(0.40, 0.46, vRest.z) * clamp(uJaw * 3.0, 0.0, 1.0);
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
  vec4 skin = texture2D( map, vMapUv - inLeft * (uvPerUnit * uGaze) );
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
float mouth = mouthMask();
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.015, 0.015), mouth * 0.95);`
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, max(mouth, max(lidL, lidR)));');
  };
  material.customProgramCacheKey = () => 'alqami-bust-rig-2';
  material.needsUpdate = true;

  const euler = new THREE.Euler();
  const m4 = new THREE.Matrix4();
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
      uniforms.uJaw.value = rig.jaw;
      uniforms.uWide.value = rig.wide;
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

export interface VoiceFeatures {
  /** Loudness 0..1. */
  level: number;
  /** Where the sound's energy sits, 0 (dark: oo, o) .. 1 (bright: ee, s). */
  bright: number;
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
    this.jaw = approach(this.jaw, voice.level, voice.level > this.jaw ? 28 : 14, dt);
    const talking = this.jaw > 0.05;

    // Lip shape from the sound: bright sounds spread the lips, dark sounds round them.
    rig.wide = approach(rig.wide, talking ? THREE.MathUtils.clamp((voice.bright - 0.42) * 3, -1, 1) * Math.min(1, this.jaw * 2) : 0, 16, dt);

    // Brows rise on a stressed word (louder than his recent average) and on surprise.
    this.loudAvg = approach(this.loudAvg, voice.level, 0.8, dt);
    if (talking && voice.level > this.loudAvg * 1.7 && voice.level > 0.35 && this.browLeft <= 0) this.browLeft = 0.45;
    this.browLeft -= dt;
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
    const nod = ack + (talking ? Math.sin(this.t * 5.3) * 0.025 * this.jaw + Math.sin(this.t * 1.7) * 0.02 : 0);
    const ease = Math.min(1, dt * (hasTarget || this.nodLeft > 0 ? 6 : 1.6));
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
