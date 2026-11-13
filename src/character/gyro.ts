import * as THREE from 'three';

/**
 * The phone's orientation as a camera rotation, so a character placed in front of the visitor stays put while they
 * turn the phone (rotation only; walking around is not tracked, which iPhone Safari cannot do without WebXR).
 */
export class GyroCamera {
  private q = new THREE.Quaternion();
  private has = false;
  private euler = new THREE.Euler();
  private q0 = new THREE.Quaternion();
  private q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // camera looks out of the back
  private z = new THREE.Vector3(0, 0, 1);
  private onEvent = (e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const d = THREE.MathUtils.degToRad;
    const screenAngle = d((screen.orientation?.angle as number | undefined) ?? (window as any).orientation ?? 0);
    this.euler.set(d(e.beta), d(e.alpha), -d(e.gamma), 'YXZ');
    this.q.setFromEuler(this.euler).multiply(this.q1).multiply(this.q0.setFromAxisAngle(this.z, -screenAngle));
    this.has = true;
  };

  /** Must be called from a tap on iPhone (it asks for motion permission). */
  async start(): Promise<boolean> {
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE?.requestPermission) {
      try {
        if ((await DOE.requestPermission()) !== 'granted') return false;
      } catch {
        return false;
      }
    }
    window.addEventListener('deviceorientation', this.onEvent);
    return true;
  }

  stop() {
    window.removeEventListener('deviceorientation', this.onEvent);
    this.has = false;
  }

  get available() {
    return this.has;
  }

  apply(camera: THREE.Camera) {
    if (this.has) camera.quaternion.copy(this.q);
  }
}
