import * as THREE from 'three';
import { GyroCamera } from '../character/gyro';

/**
 * Keeps labels on recognised objects while the phone turns. When an object is recognised at a point of the view, the
 * direction of that point in the room is remembered; every frame each direction is projected back onto the screen
 * with the phone's current orientation (gyroscope). Walking around is not tracked; the next recognition pins the
 * label again where the object is now seen.
 *
 * iPhone Safari has no WebXR, so this is the stable way to keep AR labels on objects there. Without motion access
 * labels stay where they were recognised on screen.
 */
export type Direction = THREE.Vector3 & { readonly __pin?: true };

export class WorldPin {
  private gyro = new GyroCamera();
  private camera = new THREE.PerspectiveCamera(64, 1, 0.01, 10);
  private v = new THREE.Vector3();
  started = false;

  /** Asks for motion access (call from a tap on iPhone). */
  async start(): Promise<boolean> {
    this.started = await this.gyro.start();
    return this.started;
  }

  stop() {
    this.gyro.stop();
    this.started = false;
  }

  get tracking() {
    return this.gyro.available;
  }

  private sync(width: number, height: number, fov: number) {
    this.gyro.apply(this.camera);
    this.camera.fov = fov;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /**
   * The room direction of a point of the view now (0..1 across and down, as seen on screen).
   * `fov` is the camera's vertical field of view as shown on screen (the back camera filling a phone screen ≈ 64°).
   */
  directionAt(nx: number, ny: number, width: number, height: number, fov = 64): Direction {
    this.sync(width, height, fov);
    return new THREE.Vector3(nx * 2 - 1, 1 - ny * 2, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
  }

  /** Where a direction is on a screen of this size (pixels), or null when it is behind the phone. */
  project(direction: Direction, width: number, height: number, fov = 64): { x: number; y: number; onScreen: boolean } | null {
    this.sync(width, height, fov);
    this.v.copy(direction).add(this.camera.position).project(this.camera);
    if (this.v.z > 1) return null;
    const x = ((this.v.x + 1) / 2) * width;
    const y = ((1 - this.v.y) / 2) * height;
    return { x, y, onScreen: x >= -20 && x <= width + 20 && y >= -20 && y <= height + 20 };
  }
}
