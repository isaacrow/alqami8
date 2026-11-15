// XR AR Spatial Deployment Engine for Alqami Custom Artifact & 3D Statue Recognition
// Renders 3D holographic metadata & angle-synced 3D models directly anchored on the physical artifact

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARCardManager } from '../ar-card.js';

export class XRArtifactDeployer {
  constructor(overlayContainer) {
    this.container = overlayContainer;
    this.baseUrl = (import.meta.env.BASE_URL || './') + 'models/'; // ALQAMI: 3D models are shared with the rest of the site

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.animFrameId = null;

    // Root 3D Anchor Group (Anchored onto physical artifact's screen coordinates)
    this.rootAnchorGroup = new THREE.Group();
    this.modelGroup = new THREE.Group();
    this.cardGroup = new THREE.Group();
    this.tetherGroup = new THREE.Group();

    this.cardManager = null;
    this.currentModel = null;
    this.gltfLoader = new GLTFLoader();

    // State & Animation
    this.isConfirmed = false;
    this.targetScale = 0;
    this.currentScale = 0;
    this.currentArtifactId = null;
    this.time = 0;
    this.rotationSpeed = 0.008;
    this.userRotating = false;
    this.previousTouchX = 0;
    this.targetAngleY = null; // When set, smoothly aligns 3D model with physical statue angle

    // 3D Skeletal / Morph Animation Mixer for Interactive Models
    this.clock = new THREE.Clock();
    this.mixer = null;
    this.animations = [];
    this.bookAction = null;
    this.currentClip = null;
    this.isBookOpen = false;
    this.onAnimationStateChange = null;

    // Screen-to-3D projection caches
    this.target3DPos = new THREE.Vector3(0, 0, -2.4);
    this.current3DPos = new THREE.Vector3(0, 0, -2.4);

    // Tether line geometry
    this.tetherLine = null;
  }

  async init() {
    console.log('Initializing XR Artifact Deployer (3D WebXR on Artifact)...');

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Scene & Perspective Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 0);

    // 2. WebGL Renderer with Alpha Transparency
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.container.appendChild(this.renderer.domElement);

    // 3. Realistic AR Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.9);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff5e6, 2.4);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    const goldRimLight = new THREE.PointLight(0xffd700, 2.6, 8);
    goldRimLight.position.set(-1.5, 1.2, 2);
    this.scene.add(goldRimLight);

    const cyanGlowLight = new THREE.PointLight(0x00f2fe, 2.8, 8);
    cyanGlowLight.position.set(1.2, 0.8, 1.5);
    this.scene.add(cyanGlowLight);

    // 4. Build Hierarchy
    this.rootAnchorGroup.scale.set(0, 0, 0);
    this.rootAnchorGroup.position.copy(this.current3DPos);
    this.scene.add(this.rootAnchorGroup);

    // 4a. 3D Model Group (Floats above/beside object)
    this.modelGroup.position.set(-0.35, 0.12, 0);
    this.rootAnchorGroup.add(this.modelGroup);

    // 4b. 3D Holographic Card Manager
    this.cardGroup.position.set(0.42, 0.18, 0);
    this.cardGroup.scale.set(0.68, 0.68, 0.68);
    this.rootAnchorGroup.add(this.cardGroup);
    this.cardManager = new ARCardManager(this.cardGroup);

    // 4c. Laser Tether Lines & Ground Base
    this._createLaserTethersAndGizmo();

    // 5. Setup Interactive Touch / Drag Rotation
    this._setupTouchInteractions();

    // Resize listener
    window.addEventListener('resize', () => this._handleResize());

    this._animate();
    return true;
  }

  _createLaserTethersAndGizmo() {
    const points = [
      new THREE.Vector3(0, -0.45, 0),
      new THREE.Vector3(0, -0.15, 0),
      new THREE.Vector3(-0.35, 0.12, 0),
      new THREE.Vector3(0, -0.15, 0),
      new THREE.Vector3(0.42, 0.18, 0)
    ];
    const tetherGeo = new THREE.BufferGeometry().setFromPoints(points);
    const tetherMat = new THREE.LineBasicMaterial({
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.75,
      linewidth: 2
    });
    this.tetherLine = new THREE.Line(tetherGeo, tetherMat);
    this.rootAnchorGroup.add(this.tetherLine);

    const ringGeo = new THREE.RingGeometry(0.18, 0.22, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.45;
    this.rootAnchorGroup.add(ring);

    const beaconGeo = new THREE.SphereGeometry(0.024, 16, 16);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.y = -0.45;
    this.rootAnchorGroup.add(beacon);
  }

  /**
   * Builds a high-detail 3D replica of the user's real-life White & Gold Astronaut Figurine
   */
  _buildProceduralAstronaut3D() {
    const group = new THREE.Group();

    const suitMat = new THREE.MeshStandardMaterial({
      color: 0xf4f6fb,
      roughness: 0.36,
      metalness: 0.08
    });

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffc400,
      roughness: 0.16,
      metalness: 0.92,
      emissive: 0x442b00,
      emissiveIntensity: 0.35
    });

    const hologramRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });

    // 1. Helmet Outer Shell (Matte White)
    const helmetGeo = new THREE.SphereGeometry(0.145, 32, 32);
    const helmet = new THREE.Mesh(helmetGeo, suitMat);
    helmet.position.set(0, 0.21, 0);
    group.add(helmet);

    // Helmet Rim Ridge
    const rimGeo = new THREE.TorusGeometry(0.115, 0.018, 16, 32);
    const rim = new THREE.Mesh(rimGeo, suitMat);
    rim.position.set(0, 0.21, 0.068);
    group.add(rim);

    // 2. Metallic Gold Visor (Front Spherical Dome)
    const visorGeo = new THREE.SphereGeometry(0.118, 32, 32);
    const visor = new THREE.Mesh(visorGeo, goldMat);
    visor.scale.set(0.95, 0.92, 0.75);
    visor.position.set(0, 0.21, 0.062);
    group.add(visor);

    // Helmet Side Ear Pods (Left & Right)
    const earGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.03, 20);
    earGeo.rotateZ(Math.PI / 2);
    const leftEar = new THREE.Mesh(earGeo, suitMat);
    leftEar.position.set(-0.145, 0.21, 0);
    const rightEar = new THREE.Mesh(earGeo, suitMat);
    rightEar.position.set(0.145, 0.21, 0);
    group.add(leftEar, rightEar);

    // 3. Torso & Ribbed Waist
    const torsoGeo = new THREE.CapsuleGeometry(0.105, 0.14, 16, 24);
    const torso = new THREE.Mesh(torsoGeo, suitMat);
    torso.position.set(0, 0.0, 0);
    group.add(torso);

    // Waist Belt Ring
    const beltGeo = new THREE.TorusGeometry(0.102, 0.016, 12, 28);
    beltGeo.rotateX(Math.PI / 2);
    const belt = new THREE.Mesh(beltGeo, suitMat);
    belt.position.set(0, -0.065, 0);
    group.add(belt);

    // 4. Chest Control Unit (PLSS Box + Gold Indicators)
    const chestBoxGeo = new THREE.BoxGeometry(0.095, 0.075, 0.04);
    const chestBox = new THREE.Mesh(chestBoxGeo, suitMat);
    chestBox.position.set(0, 0.02, 0.095);
    group.add(chestBox);

    // Gold buttons on chest box (matching the real figurine's 4 gold marks)
    const dotGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.01, 12);
    dotGeo.rotateX(Math.PI / 2);
    const dot1 = new THREE.Mesh(dotGeo, goldMat);
    dot1.position.set(-0.022, 0.036, 0.115);
    const dot2 = new THREE.Mesh(dotGeo, goldMat);
    dot2.position.set(0, 0.036, 0.115);
    const dot3 = new THREE.Mesh(dotGeo, goldMat);
    dot3.position.set(-0.022, 0.010, 0.115);
    const barGeo = new THREE.BoxGeometry(0.034, 0.012, 0.01);
    const bar = new THREE.Mesh(barGeo, goldMat);
    bar.position.set(0.014, 0.010, 0.115);
    group.add(dot1, dot2, dot3, bar);

    // Backpack (PLSS)
    const packGeo = new THREE.BoxGeometry(0.15, 0.18, 0.08);
    const pack = new THREE.Mesh(packGeo, suitMat);
    pack.position.set(0, 0.02, -0.095);
    group.add(pack);

    // 5. Left & Right Arms + Dual Gold Stripes
    const buildArm = (sideSign) => {
      const armGroup = new THREE.Group();
      armGroup.position.set(sideSign * 0.135, 0.04, 0);
      armGroup.rotation.z = -sideSign * 0.24;

      const armMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.13, 12, 16), suitMat);
      armMesh.position.set(0, -0.05, 0);
      armGroup.add(armMesh);

      // Two Gold Stripes on Arm
      const stripeGeo = new THREE.TorusGeometry(0.039, 0.006, 10, 24);
      stripeGeo.rotateX(Math.PI / 2);
      const stripe1 = new THREE.Mesh(stripeGeo, goldMat);
      stripe1.position.set(0, -0.02, 0);
      const stripe2 = new THREE.Mesh(stripeGeo, goldMat);
      stripe2.position.set(0, -0.055, 0);
      armGroup.add(stripe1, stripe2);

      // Glove
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 16), suitMat);
      glove.position.set(0, -0.135, 0);
      armGroup.add(glove);

      return armGroup;
    };

    group.add(buildArm(-1), buildArm(1));

    // 6. Left & Right Legs + Gold Knee Pads + Boots
    const buildLeg = (sideSign) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(sideSign * 0.052, -0.16, 0);

      const legMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.12, 12, 16), suitMat);
      legGroup.add(legMesh);

      // Gold Knee Pad
      const kneeGeo = new THREE.SphereGeometry(0.026, 16, 16);
      kneeGeo.scale(1.1, 0.85, 0.6);
      const knee = new THREE.Mesh(kneeGeo, goldMat);
      knee.position.set(0, -0.01, 0.038);
      legGroup.add(knee);

      // Astronaut Boot
      const bootGeo = new THREE.BoxGeometry(0.072, 0.048, 0.11);
      const boot = new THREE.Mesh(bootGeo, suitMat);
      boot.position.set(0, -0.085, 0.018);
      legGroup.add(boot);

      return legGroup;
    };

    group.add(buildLeg(-1), buildLeg(1));

    // 7. 360° Multi-Angle Orbital Scanner Ring around the Astronaut
    const orbitRingGeo = new THREE.RingGeometry(0.24, 0.255, 48);
    orbitRingGeo.rotateX(Math.PI / 2);
    const orbitRing = new THREE.Mesh(orbitRingGeo, hologramRingMat);
    orbitRing.position.set(0, -0.24, 0);
    group.add(orbitRing);

    group.scale.set(0.95, 0.95, 0.95);
    return group;
  }

  async _load3DModel(modelUrl) {
    if (modelUrl && modelUrl.includes('procedural:astronaut')) {
      if (this.currentModel) {
        this.modelGroup.remove(this.currentModel);
      }
      if (this.mixer) {
        this.mixer.stopAllAction();
        this.mixer = null;
      }
      this.currentModel = this._buildProceduralAstronaut3D();
      this.modelGroup.add(this.currentModel);
      if (this.onAnimationStateChange) {
        this.onAnimationStateChange({ hasAnimation: false, isOpen: false, clipName: null });
      }
      console.log('Loaded Procedural 3D Multi-Angle Astronaut Hologram!');
      return this.currentModel;
    }

    return new Promise((resolve) => {
      this.gltfLoader.load(
        modelUrl,
        (gltf) => {
          if (this.currentModel) {
            this.modelGroup.remove(this.currentModel);
          }
          if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
          }

          this.currentModel = gltf.scene;

          this.animations = gltf.animations || [];
          if (this.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(this.currentModel);
            const clip = this.animations.find(a => a.name === 'Open_Book') || this.animations[0];
            this.currentClip = clip;
            const action = this.mixer.clipAction(clip);
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
            this.bookAction = action;
            this.isBookOpen = false;

            if (this.onAnimationStateChange) {
              this.onAnimationStateChange({
                hasAnimation: true,
                isOpen: false,
                clipName: clip.name
              });
            }
          } else {
            this.bookAction = null;
            this.currentClip = null;
            this.isBookOpen = false;
            if (this.onAnimationStateChange) {
              this.onAnimationStateChange({
                hasAnimation: false,
                isOpen: false,
                clipName: null
              });
            }
          }

          const box = new THREE.Box3().setFromObject(this.currentModel);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const desiredScale = 0.55 / maxDim;
          this.currentModel.scale.set(desiredScale, desiredScale, desiredScale);

          const center = box.getCenter(new THREE.Vector3());
          this.currentModel.position.sub(center.multiplyScalar(desiredScale));

          this.modelGroup.add(this.currentModel);
          resolve(this.currentModel);
        },
        undefined,
        (err) => {
          console.warn('Could not load 3D GLB model for XR layer:', err);
          resolve(null);
        }
      );
    });
  }

  toggleBookAnimation() {
    if (!this.mixer || !this.bookAction) return false;

    if (!this.isBookOpen) {
      this.bookAction.reset();
      this.bookAction.timeScale = 1.0;
      this.bookAction.paused = false;
      this.bookAction.setLoop(THREE.LoopOnce);
      this.bookAction.clampWhenFinished = true;
      this.bookAction.play();
      this.isBookOpen = true;
    } else {
      this.bookAction.paused = false;
      this.bookAction.timeScale = -1.0;
      this.bookAction.setLoop(THREE.LoopOnce);
      this.bookAction.clampWhenFinished = true;
      this.bookAction.play();
      this.isBookOpen = false;
    }

    if (this.onAnimationStateChange) {
      this.onAnimationStateChange({
        hasAnimation: true,
        isOpen: this.isBookOpen,
        clipName: this.currentClip?.name || 'Open_Book'
      });
    }

    return this.isBookOpen;
  }

  _setupTouchInteractions() {
    const el = this.renderer.domElement;
    let startX = 0;
    let startY = 0;
    let hasMoved = false;

    const onStart = (clientX, clientY) => {
      this.userRotating = true;
      this.targetAngleY = null; // allow manual override
      this.previousTouchX = clientX;
      startX = clientX;
      startY = clientY;
      hasMoved = false;
    };

    const onMove = (clientX, clientY) => {
      if (!this.userRotating) return;
      const deltaX = clientX - this.previousTouchX;
      if (Math.abs(clientX - startX) > 6 || Math.abs(clientY - startY) > 6) {
        hasMoved = true;
      }
      this.previousTouchX = clientX;
      this.modelGroup.rotation.y += deltaX * 0.015;
    };

    const onEnd = (clientX, clientY) => {
      this.userRotating = false;
      if (!hasMoved && this.mixer && this.camera) {
        const rect = el.getBoundingClientRect();
        const mouseX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);
        const hits = raycaster.intersectObjects(this.modelGroup.children, true);
        if (hits.length > 0) {
          this.toggleBookAnimation();
        }
      }
    };

    el.addEventListener('pointerdown', (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('pointerup', (e) => onEnd(e.clientX, e.clientY));
    window.addEventListener('pointercancel', () => { this.userRotating = false; });
  }

  _handleResize() {
    if (!this.renderer || !this.camera) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Synchronizes the 3D hologram's orientation with the physical angle detected by the multi-angle engine
   */
  syncDetectedAngle(matchedView) {
    if (this.userRotating) return;
    const view = (matchedView || 'front').toLowerCase();
    if (view === 'left' || view === 'side1') {
      this.targetAngleY = -0.95; // Left profile (-55 deg)
    } else if (view === 'right' || view === 'side2') {
      this.targetAngleY = 0.95;  // Right profile (+55 deg)
    } else if (view === 'front') {
      this.targetAngleY = 0.0;   // Direct front (0 deg)
    } else if (view === 'wide' || view === 'angle' || view === 'top') {
      this.targetAngleY = 0.35;  // Slight 3/4 perspective
    } else if (view === 'back') {
      this.targetAngleY = Math.PI;
    }
  }

  deployArtifactXR(artifactData, metadata, roi, matchedView, similarityPct) {
    this.isConfirmed = true;
    this.targetScale = 1.0;

    this._compute3DPositionFromROI(roi);
    this.syncDetectedAngle(matchedView);

    const enrichedMeta = {
      title: metadata?.title || artifactData.title || 'Alqami 3D Artifact',
      titleArabic: artifactData.title || metadata?.titleArabic || 'مجسم متعدد الزوايا',
      identifier: `${artifactData.id} • [${(matchedView || 'FRONT').toUpperCase()}] ${similarityPct}%`,
      creator: metadata?.creator || artifactData.institution || 'مختبر القمي للرؤية المكانية',
      date: metadata?.date || artifactData.date || '2026',
      material: metadata?.material || (artifactData.materials ? artifactData.materials.join('، ') : 'مجسم ثلاثي الأبعاد'),
      publisher: metadata?.publisher || artifactData.collection || 'مؤسسة القمي للتراث المعرفي',
      dimensions: metadata?.dimensions || 'مسح متعدد الزوايا 360°',
      description: metadata?.description || artifactData.description || ''
    };

    if (this.cardManager) {
      this.cardManager.createHolographicCard(enrichedMeta);
      if (metadata?.hotspots) {
        this.cardManager.createHotspots(metadata.hotspots);
      }
    }

    if (this.currentArtifactId !== artifactData.id) {
      this.currentArtifactId = artifactData.id;
      const baseUrl = (import.meta.env.BASE_URL || './') + 'models/';
      let modelFile = 'model.glb';
      if (artifactData.id === 'ART-006' || artifactData.arModel?.glb === 'procedural:astronaut') {
        this._load3DModel('procedural:astronaut');
        return;
      } else if (artifactData.arModel?.glb) {
        modelFile = artifactData.arModel.glb;
      } else if (artifactData.id === 'ART-003') {
        modelFile = 'Old_Islamic_Helmet.glb';
      } else if (artifactData.id?.toLowerCase().includes('nahj') || (artifactData.title && artifactData.title.includes('نهج'))) {
        modelFile = 'nahj_al_balagha.glb';
      }
      this._load3DModel(`${baseUrl}${modelFile}`);
    }
  }

  collapseArtifactXR() {
    this.isConfirmed = false;
    this.targetScale = 0.0;
  }

  _compute3DPositionFromROI(roi) {
    if (!roi || !this.camera) return;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    const centerX = roi.x + roi.width / 2;
    const centerY = roi.y + roi.height / 2;

    const ndcX = (centerX / width) * 2 - 1;
    const ndcY = -(centerY / height) * 2 + 1;

    const depth = 2.2;
    const vFOV = (this.camera.fov * Math.PI) / 180;
    const visibleH = 2 * Math.tan(vFOV / 2) * depth;
    const visibleW = visibleH * this.camera.aspect;

    this.target3DPos.set(
      (ndcX * visibleW) / 2,
      (ndcY * visibleH) / 2 + 0.12,
      -depth
    );
  }

  _animate() {
    this.animFrameId = requestAnimationFrame(() => this._animate());

    this.time += 0.018;

    if (this.clock) {
      const delta = this.clock.getDelta();
      if (this.mixer) {
        this.mixer.update(delta);
      }
    }

    this.currentScale += (this.targetScale - this.currentScale) * 0.14;
    this.rootAnchorGroup.scale.set(this.currentScale, this.currentScale, this.currentScale);

    this.current3DPos.lerp(this.target3DPos, 0.15);
    this.rootAnchorGroup.position.copy(this.current3DPos);

    if (this.currentScale > 0.02) {
      const levitation = Math.sin(this.time * 2.2) * 0.035;
      this.modelGroup.position.y = 0.12 + levitation;
      this.cardGroup.position.y = 0.18 + levitation * 0.5;

      if (!this.userRotating) {
        if (this.targetAngleY !== null && this.currentArtifactId === 'ART-006') {
          // Smoothly orient the 3D Astronaut to match the real-world detected angle + gentle breathing
          const desiredY = this.targetAngleY + Math.sin(this.time * 1.6) * 0.12;
          this.modelGroup.rotation.y += (desiredY - this.modelGroup.rotation.y) * 0.10;
        } else {
          this.modelGroup.rotation.y += this.rotationSpeed;
        }
      }

      this.cardGroup.rotation.y = -Math.PI * 0.04 + Math.sin(this.time * 1.5) * 0.02;

      if (this.tetherLine && this.tetherLine.material) {
        this.tetherLine.material.opacity = 0.55 + Math.sin(this.time * 4) * 0.25;
      }

      if (this.cardManager) {
        this.cardManager.update(0.018);
      }
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  stop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.collapseArtifactXR();
  }

  start() {
    if (!this.animFrameId) {
      this._animate();
    }
  }
}
