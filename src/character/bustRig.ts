import * as THREE from 'three';

/**
 * Brings an unrigged bust scan to life without bones: the vertex shader bends the mesh by region.
 *  - jaw: the chin and lower lip turn down around a hinge when he speaks (driven by the voice's loudness), and the
 *    gap between the lips darkens like an open mouth;
 *  - head: everything above the collar turns and nods around the neck (to look at the visitor);
 *  - breath: the chest rises slowly.
 *
 * The regions are measured on public/characters/jawahiri.glb (model units; the bust faces +Z, Y up, lips meet at
 * y≈0.095, chin bottom y≈-0.10, front of the face z≈0.5). Another bust needs its own numbers.
 */
export interface BustRegions {
  lipLine: number;
  chinBottom: number;
  jawHinge: THREE.Vector3;
  neckPivot: THREE.Vector3;
  headFrom: number;
  headTo: number;
  headHalfWidth: number;
}

export const JAWAHIRI_REGIONS: BustRegions = {
  lipLine: 0.095,
  chinBottom: -0.11,
  jawHinge: new THREE.Vector3(0, 0.12, 0.12),
  neckPivot: new THREE.Vector3(0, -0.22, 0.0),
  headFrom: -0.26,
  headTo: -0.1,
  headHalfWidth: 0.36,
};

export interface BustRig {
  /** 0 (closed) .. 1 (wide open). */
  jaw: number;
  /** Radians: + turns to his left (screen right), + pitch looks down. */
  yaw: number;
  pitch: number;
  roll: number;
  breath: number;
  apply(): void;
}

export function rigBust(mesh: THREE.Mesh, r: BustRegions = JAWAHIRI_REGIONS): BustRig {
  const uniforms = {
    uJaw: { value: 0 },
    uHead: { value: new THREE.Matrix3() },
    uBreath: { value: 0 },
  };
  const material = mesh.material as THREE.MeshStandardMaterial;
  const f = (n: number) => n.toFixed(4);
  const v3 = (v: THREE.Vector3) => `vec3(${f(v.x)}, ${f(v.y)}, ${f(v.z)})`;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uJaw;
uniform mat3 uHead;
uniform float uBreath;
varying vec3 vRest;
float jawWeight(vec3 p) {
  return (1.0 - smoothstep(${f(r.lipLine - 0.018)}, ${f(r.lipLine + 0.002)}, p.y))
       * smoothstep(${f(r.chinBottom - 0.09)}, ${f(r.chinBottom)}, p.y)
       * (1.0 - smoothstep(0.10, 0.19, abs(p.x)))
       * smoothstep(0.22, 0.40, p.z);
}
float headWeight(vec3 p) {
  return smoothstep(${f(r.headFrom)}, ${f(r.headTo)}, p.y) * (1.0 - smoothstep(${f(r.headHalfWidth)}, ${f(r.headHalfWidth + 0.1)}, abs(p.x)));
}
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rigMatrix(vec3 p, out vec3 jawPivot, out vec3 neckPivot, out float hw) {
  jawPivot = ${v3(r.jawHinge)};
  neckPivot = ${v3(r.neckPivot)};
  hw = headWeight(p);
  return rotX(uJaw * 0.13 * jawWeight(p));
}
vec3 rigPosition(vec3 p) {
  vec3 jp; vec3 np; float hw;
  mat3 jaw = rigMatrix(p, jp, np, hw);
  vec3 q = jaw * (p - jp) + jp;
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
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = rigPosition(position);
vRest = position;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uJaw;
varying vec3 vRest;
float mouthMask() {
  // The strip of skin that stretches open between the lips, measured at rest, darkened per pixel.
  vec2 d = vec2(vRest.x / 0.08, (vRest.y - ${f(r.lipLine - 0.011)}) / 0.016);
  return (1.0 - smoothstep(0.55, 1.0, length(d))) * smoothstep(0.40, 0.46, vRest.z) * clamp(uJaw * 3.0, 0.0, 1.0);
}`)
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat mouth = mouthMask();\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.015, 0.015), mouth * 0.95);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, mouth);');
  };
  material.customProgramCacheKey = () => 'alqami-bust-rig';
  material.needsUpdate = true;

  const euler = new THREE.Euler();
  const m4 = new THREE.Matrix4();
  const rig: BustRig = {
    jaw: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    breath: 0,
    apply() {
      uniforms.uJaw.value = rig.jaw;
      uniforms.uBreath.value = rig.breath;
      euler.set(rig.pitch, rig.yaw, rig.roll, 'YXZ');
      uniforms.uHead.value.setFromMatrix4(m4.makeRotationFromEuler(euler));
    },
  };
  // The mesh bends in the shader, so its box must be loose enough not to be culled while turning.
  mesh.frustumCulled = false;
  return rig;
}

/** Natural motion on top of the targets: smoothing, breathing, idle glances, talking nods. */
export class BustMotion {
  targetYaw = 0;
  targetPitch = 0;
  private jaw = 0;
  private t = 0;
  private glance = 0;
  private glanceYaw = 0;
  private nodLeft = 0;
  /** A short nod (he noticed a gesture). */
  nod() {
    this.nodLeft = 0.7;
  }
  constructor(private rig: BustRig) {}

  update(dt: number, voiceLevel: number, hasTarget: boolean) {
    this.t += dt;
    // Jaw follows the voice quickly when opening and a little slower when closing, as real speech looks.
    const k = voiceLevel > this.jaw ? 28 : 14;
    this.jaw += (voiceLevel - this.jaw) * Math.min(1, dt * k);
    const talking = this.jaw > 0.05;

    // Without anyone to look at, an occasional slow glance.
    this.glance -= dt;
    if (this.glance <= 0) {
      this.glance = 3 + Math.random() * 4;
      this.glanceYaw = (Math.random() - 0.5) * 0.35;
    }
    const yaw = hasTarget ? this.targetYaw : this.glanceYaw;
    const pitch = hasTarget ? this.targetPitch : 0.03;
    this.nodLeft = Math.max(0, this.nodLeft - dt);
    const ack = this.nodLeft > 0 ? Math.sin(((0.7 - this.nodLeft) / 0.7) * Math.PI * 2) * 0.13 : 0;
    const nod = ack + (talking ? Math.sin(this.t * 5.3) * 0.025 * this.jaw + Math.sin(this.t * 1.7) * 0.02 : 0);
    const ease = Math.min(1, dt * (hasTarget || this.nodLeft > 0 ? 6 : 1.6));
    this.rig.yaw += (yaw - this.rig.yaw) * ease;
    this.rig.pitch += (pitch + nod - this.rig.pitch) * ease;
    this.rig.roll = Math.sin(this.t * 0.6) * 0.02 + (talking ? Math.sin(this.t * 2.3) * 0.015 : 0);
    this.rig.breath = Math.sin(this.t * 1.35) * 0.5 + 0.5;
    this.rig.jaw = Math.min(1, this.jaw * 1.2);
    this.rig.apply();
  }
}
