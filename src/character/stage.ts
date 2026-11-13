import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BustMotion, rigBust } from './bustRig';
import { GyroCamera } from './gyro';

export type StageMode = 'studio' | 'ar';

/**
 * The 3D scene of the character.
 *  - studio: he faces the screen in a soft studio light (front camera or no camera);
 *  - ar: the canvas is transparent over the back camera and he hovers in the room, about 1.3 m away, held in place
 *    by the phone's gyroscope.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  private holder = new THREE.Group();
  private ring: THREE.Mesh;
  private motion: BustMotion | null = null;
  private gyro = new GyroCamera();
  private needsPlacement = false;
  private t = 0;
  mode: StageMode = 'studio';
  /** Extra turn of his whole body, set by pinching or dragging. */
  bodyYaw = 0;
  arScale = 1;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none' });

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.scene.add(new THREE.HemisphereLight(0xfff4e6, 0x30261c, 0.7));
    const key = new THREE.DirectionalLight(0xfff1dc, 1.7);
    key.position.set(-1.2, 1.6, 2.4);
    const rim = new THREE.DirectionalLight(0xbcd4ff, 0.9);
    rim.position.set(1.5, 1.2, -2);
    this.scene.add(key, rim, this.holder);

    // The glow he hovers above in AR.
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.62, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = -1.08;
    this.ring.visible = false;
    this.holder.add(this.ring);
    this.resize();
  }

  async load(url: string, onProgress: (fraction: number) => void) {
    const gltf = await new GLTFLoader().loadAsync(url, (e) => e.total && onProgress(e.loaded / e.total));
    let mesh: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) throw new Error('no mesh');
    this.motion = new BustMotion(rigBust(mesh));
    this.holder.add(gltf.scene);
  }

  async setMode(mode: StageMode) {
    this.mode = mode;
    this.ring.visible = mode === 'ar';
    if (mode === 'ar') {
      this.camera.position.set(0, 0, 0);
      this.camera.fov = 62;
      this.needsPlacement = true;
      await this.gyro.start();
    } else {
      this.gyro.stop();
      this.camera.quaternion.identity();
      this.holder.position.set(0, 0, 0);
      this.holder.rotation.set(0, 0, 0);
      this.holder.scale.setScalar(1);
      this.camera.fov = 32;
    }
    this.resize();
  }

  /** In AR: put him in front of where the phone points now. */
  placeInFront() {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
    forward.normalize().multiplyScalar(1.3);
    this.holder.position.set(forward.x, -0.12, forward.z);
    this.bodyYaw = 0;
    this.needsPlacement = false;
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (this.mode === 'studio') {
      // Keep his head and shoulders in view whatever the screen shape.
      const vfov = THREE.MathUtils.degToRad(this.camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
      const dist = Math.max(1.55 / (2 * Math.tan(vfov / 2)), 1.25 / (2 * Math.tan(hfov / 2)));
      this.camera.position.set(0, 0.16, dist);
      this.camera.lookAt(0, 0.12, 0);
    }
    this.camera.updateProjectionMatrix();
  }

  /**
   * One frame. `look` is where the visitor is on screen (0..1), or null to let him glance around.
   * In AR with nobody seen, he looks at the phone.
   */
  frame(dt: number, voice: number, look: { x: number; y: number } | null) {
    this.t += dt;
    if (this.mode === 'ar') {
      this.gyro.apply(this.camera);
      if (this.needsPlacement && (this.gyro.available || this.t > 0.6)) this.placeInFront();
      // Face the phone, hover gently.
      const p = this.holder.position;
      this.holder.rotation.y = Math.atan2(-p.x, -p.z) + this.bodyYaw;
      p.y = -0.12 + Math.sin(this.t * 1.3) * 0.025;
      this.holder.scale.setScalar(0.36 * this.arScale);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(this.t * 2.6) * 0.1 + voice * 0.25;
    } else {
      this.holder.rotation.y = this.bodyYaw;
    }

    if (this.motion) {
      if (look) {
        this.motion.targetYaw = THREE.MathUtils.clamp((look.x - 0.5) * 1.1, -0.55, 0.55);
        this.motion.targetPitch = THREE.MathUtils.clamp((look.y - 0.45) * 0.7, -0.3, 0.3);
      } else if (this.mode === 'ar') {
        this.motion.targetYaw = 0;
        this.motion.targetPitch = 0;
      }
      this.motion.update(dt, voice, Boolean(look) || this.mode === 'ar');
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** A short nod, when he notices a gesture. */
  nod() {
    this.motion?.nod();
  }

  dispose() {
    this.gyro.stop();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
