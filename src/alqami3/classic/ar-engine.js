import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import * as THREE from 'three';

export class AREngine {
  constructor(containerElement, targetSrc = '/targets/manuscript.mind') {
    this.container = containerElement;
    this.targetSrc = targetSrc;
    this.mindarThree = null;
    this.anchor = null;
    this.isRunning = false;
    this.isTargetFound = false;

    this.onTargetFound = null;
    this.onTargetLost = null;
    this.onError = null;
  }

  async init() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API (getUserMedia) not supported in this browser. Please ensure HTTPS is enabled or use Chrome/Safari.');
      }

      this.mindarThree = new MindARThree({
        container: this.container,
        imageTargetSrc: this.targetSrc,
        filterMinCF: 0.0005, // Ultra-smooth filter for jitter reduction
        filterBeta: 500,
        warmupTolerance: 4,
        missTolerance: 6,
        uiLoading: 'no',
        uiScanning: 'no'
      });

      const { renderer, scene, camera } = this.mindarThree;

      if (renderer.outputEncoding !== undefined) {
        renderer.outputEncoding = THREE.sRGBEncoding;
      }
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      // Lighting for AR 3D models
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffeedd, 1.8);
      dirLight.position.set(1, 3, 2);
      scene.add(dirLight);

      const pointLight = new THREE.PointLight(0x00d2ff, 2.0, 8);
      pointLight.position.set(0, 1, 1);
      scene.add(pointLight);

      this.anchors = [];
      this.activeTargetIndex = -1;
      // Support multiple targets (we compiled exactly 5 targets: 0, 1, 2, 3, 4)
      for (let i = 0; i < 5; i++) {
        try {
          const anchor = this.mindarThree.addAnchor(i);
          this.anchors.push(anchor);
          
          anchor.onTargetFound = () => {
            this.activeTargetIndex = i;
            if (this.onTargetFound) this.onTargetFound(i);
          };
          
          anchor.onTargetLost = () => {
            if (this.activeTargetIndex === i) {
              this.activeTargetIndex = -1;
              if (this.onTargetLost) this.onTargetLost(i);
            }
          };
        } catch (e) {
          // Ignore if .mind file has fewer targets
          console.log(`Target ${i} not in mind file`);
        }
      }

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.anchorGroup = this.anchors[0] ? this.anchors[0].group : null; // fallback for card manager to attach to primary

      return {
        renderer,
        scene,
        camera,
        anchorGroup: this.anchorGroup,
        anchors: this.anchors
      };
    } catch (err) {
      console.error('AREngine init error:', err);
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  async start(onFrameUpdate) {
    if (!this.mindarThree) return;
    try {
      await this.mindarThree.start();
      this.isRunning = true;

      // Start the official Three.js animation render loop
      const { renderer, scene, camera } = this.mindarThree;
      renderer.setAnimationLoop(() => {
        if (onFrameUpdate) onFrameUpdate();
        renderer.render(scene, camera);
      });
    } catch (err) {
      console.error('Error starting MindAR:', err);
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  stop() {
    if (this.mindarThree) {
      try {
        const { renderer } = this.mindarThree;
        if (renderer) {
          renderer.setAnimationLoop(null);
        }
        if (this.isRunning) {
          this.mindarThree.stop();
        }
      } catch (e) {
        console.warn('Error during MindAR stop:', e);
      }
      this.isRunning = false;
      this.isTargetFound = false;
    }
  }

  getAnchorGroup() {
    return this.anchor ? this.anchor.group : null;
  }

  getCamera() {
    return this.mindarThree ? this.mindarThree.camera : null;
  }

  getRenderer() {
    return this.mindarThree ? this.mindarThree.renderer : null;
  }
}
