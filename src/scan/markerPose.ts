import * as THREE from 'three';

/**
 * Where a square marker (a QR label) is in 3D, from its four corners in the camera image — classic marker AR
 * (as ARToolKit does): the homography from the square to the image, decomposed with the camera's focal length into a
 * rotation and a position. The marker's side is 1 unit; its plane is X–Y with +Z towards the camera.
 *
 * `corners`: top-left, top-right, bottom-right, bottom-left, in video pixels. `fovY`: the camera's vertical field of
 * view for that frame (degrees). Returns a matrix in three.js camera space (camera looking down -Z, Y up).
 */
export function markerPose(corners: Array<[number, number]>, width: number, height: number, fovY: number): THREE.Matrix4 | null {
  const f = height / 2 / Math.tan(THREE.MathUtils.degToRad(fovY) / 2);
  const cx = width / 2;
  const cy = height / 2;
  // Square corners in marker units (Y up), and normalised image points (OpenCV axes: x right, y down).
  const src: Array<[number, number]> = [
    [-0.5, 0.5],
    [0.5, 0.5],
    [0.5, -0.5],
    [-0.5, -0.5],
  ];
  const dst = corners.map(([x, y]) => [(x - cx) / f, (y - cy) / f] as [number, number]);
  const H = homography(src, dst);
  if (!H) return null;
  // H = λ [r1 r2 t]
  const h1 = new THREE.Vector3(H[0], H[3], H[6]);
  const h2 = new THREE.Vector3(H[1], H[4], H[7]);
  const h3 = new THREE.Vector3(H[2], H[5], H[8]);
  let lambda = 2 / (h1.length() + h2.length());
  if (h3.z * lambda < 0) lambda = -lambda; // the marker is in front of the camera
  const r1 = h1.multiplyScalar(lambda);
  const r2 = h2.multiplyScalar(lambda);
  const t = h3.multiplyScalar(lambda);
  // Orthonormalise (r1, r2) and complete the rotation.
  r1.normalize();
  const r3 = new THREE.Vector3().crossVectors(r1, r2).normalize();
  const r2o = new THREE.Vector3().crossVectors(r3, r1).normalize();
  // OpenCV camera (x right, y down, z forward) → three.js camera (x right, y up, z backward).
  const flip = (v: THREE.Vector3) => new THREE.Vector3(v.x, -v.y, -v.z);
  const m = new THREE.Matrix4().makeBasis(flip(r1), flip(r2o), flip(r3));
  const p = flip(t);
  m.setPosition(p);
  if (p.z > -0.05) return null;
  return m;
}

/** 3×3 homography (row-major) mapping src → dst from 4 point pairs (DLT with h33 = 1). */
function homography(src: Array<[number, number]>, dst: Array<[number, number]>): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return h ? [...h, 1] : null;
}

/** Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
