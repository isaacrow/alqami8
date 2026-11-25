import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import {
  Box,
  Layers,
  Sliders,
  Scissors,
  Ruler,
  Sun,
  Eye,
  Upload,
  Download,
  RotateCcw,
  Sparkles,
  Maximize2,
  ChevronRight,
  Crosshair,
  Volume2,
} from 'lucide-react';
import { spatialSound } from '../../utils/spatialSound';
import { createLovbackenModel } from '../three/LovbackenModel';

type PresetModelId = 'drone' | 'watch' | 'heart' | 'car' | 'table';

interface PresetItem {
  id: PresetModelId;
  name: string;
  category: string;
  partsCount: number;
  dimensions: { w: number; h: number; d: number }; // cm
}

const PRESETS: PresetItem[] = [
  { id: 'drone', name: 'Cyberpunk Quad-Drone', category: 'Robotics', partsCount: 14, dimensions: { w: 42, h: 18, d: 38 } },
  { id: 'watch', name: 'Chronograph Tourbillon', category: 'Horology', partsCount: 22, dimensions: { w: 4.4, h: 1.6, d: 5.2 } },
  { id: 'heart', name: 'Holographic Human Heart', category: 'Anatomy', partsCount: 8, dimensions: { w: 12, h: 16, d: 11 } },
  { id: 'car', name: 'Apex GT Concept Car', category: 'Automotive', partsCount: 16, dimensions: { w: 205, h: 118, d: 465 } },
  { id: 'table', name: 'Lövbacken Coffee Table', category: 'Furniture', partsCount: 7, dimensions: { w: 77, h: 45, d: 39 } },
];

export const Spatial3DStudioApp: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const originalPositionsRef = useRef<Map<THREE.Object3D, THREE.Vector3>>(new Map());
  const clippingPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, -1, 0), 10));

  // Studio UI state
  const [activePreset, setActivePreset] = useState<PresetModelId>('drone');
  const [activeTab, setActiveTab] = useState<'inspect' | 'materials' | 'explode' | 'slice' | 'measure'>('inspect');
  const [wireframe, setWireframe] = useState(false);
  const [roughness, setRoughness] = useState(0.35);
  const [metalness, setMetalness] = useState(0.85);
  const [transmission, setTransmission] = useState(0.0);
  const [explodeFactor, setExplodeFactor] = useState(0);
  const [clippingActive, setClippingActive] = useState(false);
  const [clipOffset, setClipOffset] = useState(0);
  const [clipAxis, setClipAxis] = useState<'x' | 'y' | 'z'>('y');
  const [lightingMode, setLightingMode] = useState<'studio' | 'sunset' | 'cyber' | 'deepspace'>('studio');
  const [customModelName, setCustomModelName] = useState<string | null>(null);
  const [modelStats, setModelStats] = useState({ vertices: 0, triangles: 0, meshes: 0 });
  const [isAutoRotating, setIsAutoRotating] = useState(false);

  // 1. Procedural 3D Model Builders for High-Detail Presets
  const buildPresetModel = (id: PresetModelId): THREE.Group => {
    const group = new THREE.Group();
    group.name = `preset_${id}`;

    if (id === 'table') {
      const table = createLovbackenModel();
      table.scale.setScalar(2.2);
      group.add(table);
      return group;
    }

    if (id === 'drone') {
      // Fuselage Center
      const bodyGeo = new THREE.CylinderGeometry(0.7, 0.9, 0.45, 8);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness, metalness });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.name = 'Fuselage Core';
      group.add(body);

      // Glass Sensor Dome
      const domeGeo = new THREE.SphereGeometry(0.45, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const domeMat = new THREE.MeshPhysicalMaterial({
        color: 0x00f5d4,
        roughness: 0.1,
        metalness: 0.1,
        transmission: 0.85,
        transparent: true,
        opacity: 0.8,
      });
      const dome = new THREE.Mesh(domeGeo, domeMat);
      dome.position.y = 0.22;
      dome.name = 'LiDAR Sensor Dome';
      group.add(dome);

      // 4 Carbon Arms & Dual Turbines
      const armAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
      armAngles.forEach((angle, i) => {
        const armGroup = new THREE.Group();
        armGroup.name = `Rotor Arm ${i + 1}`;
        const armGeo = new THREE.BoxGeometry(1.6, 0.08, 0.14);
        const armMat = new THREE.MeshStandardMaterial({ color: 0x2e323b, roughness: 0.5, metalness: 0.7 });
        const arm = new THREE.Mesh(armGeo, armMat);
        arm.position.x = 0.8;
        armGroup.add(arm);

        // Turbine Motor Pod
        const motorGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.35, 16);
        const motorMat = new THREE.MeshStandardMaterial({ color: 0xff0055, roughness: 0.2, metalness: 0.9 });
        const motor = new THREE.Mesh(motorGeo, motorMat);
        motor.position.x = 1.6;
        motor.position.y = 0.15;
        armGroup.add(motor);

        // Rotor Blades
        const bladeGeo = new THREE.BoxGeometry(0.9, 0.02, 0.12);
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0x00f5d4, roughness: 0.2, metalness: 0.4 });
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.set(1.6, 0.35, 0);
        armGroup.add(blade);

        armGroup.rotation.y = angle;
        group.add(armGroup);
      });

      // Landing skids
      [-0.45, 0.45].forEach((z, i) => {
        const skid = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8),
          new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.2 })
        );
        skid.rotation.z = Math.PI / 2;
        skid.position.set(0, -0.4, z);
        skid.name = `Landing Skid ${i + 1}`;
        group.add(skid);
      });
    } else if (id === 'watch') {
      // Watch Case
      const caseGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.35, 32);
      const caseMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.15, metalness: 0.95 });
      const watchCase = new THREE.Mesh(caseGeo, caseMat);
      watchCase.name = '18K Gold Case';
      group.add(watchCase);

      // Dial Face
      const dialGeo = new THREE.CylinderGeometry(1.05, 1.05, 0.02, 32);
      const dialMat = new THREE.MeshStandardMaterial({ color: 0x0a1128, roughness: 0.3, metalness: 0.2 });
      const dial = new THREE.Mesh(dialGeo, dialMat);
      dial.position.y = 0.18;
      dial.name = 'Enamel Sunburst Dial';
      group.add(dial);

      // Tourbillon Open-Heart Gear
      const gearGeo = new THREE.TorusGeometry(0.3, 0.06, 12, 24);
      const gearMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.1, metalness: 0.95 });
      const gear = new THREE.Mesh(gearGeo, gearMat);
      gear.position.set(0.35, 0.22, 0.3);
      gear.rotation.x = Math.PI / 2;
      gear.name = 'Tourbillon Balance Wheel';
      group.add(gear);

      // Hands
      const handGeo = new THREE.BoxGeometry(0.65, 0.03, 0.04);
      const handMat = new THREE.MeshStandardMaterial({ color: 0x00f5d4, emissive: 0x00f5d4, emissiveIntensity: 0.4 });
      const handHour = new THREE.Mesh(handGeo, handMat);
      handHour.position.set(0.28, 0.22, 0);
      handHour.rotation.y = 0.8;
      handHour.name = 'Hour Hand';
      group.add(handHour);

      // Sapphire Crystal Glass Cover
      const crystalGeo = new THREE.CylinderGeometry(1.15, 1.15, 0.08, 32);
      const crystalMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transmission: 0.95,
        roughness: 0.02,
        metalness: 0.05,
        transparent: true,
        opacity: 0.75,
      });
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.y = 0.26;
      crystal.name = 'Sapphire Crystal Glass';
      group.add(crystal);
    } else if (id === 'heart') {
      // Holographic Beating Heart Volume
      const heartMat = new THREE.MeshStandardMaterial({
        color: 0xff1744,
        roughness: 0.25,
        metalness: 0.4,
        wireframe,
      });

      const leftVentricle = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 24), heartMat);
      leftVentricle.position.set(-0.35, -0.2, 0);
      leftVentricle.scale.set(0.8, 1.3, 0.85);
      leftVentricle.name = 'Left Ventricle';
      group.add(leftVentricle);

      const rightVentricle = new THREE.Mesh(new THREE.SphereGeometry(0.8, 24, 24), heartMat);
      rightVentricle.position.set(0.4, -0.25, 0.1);
      rightVentricle.scale.set(0.75, 1.2, 0.8);
      rightVentricle.name = 'Right Ventricle';
      group.add(rightVentricle);

      // Aorta Arch
      const aortaGeo = new THREE.TorusGeometry(0.55, 0.2, 16, 24, Math.PI * 0.9);
      const aortaMat = new THREE.MeshStandardMaterial({ color: 0x9b0000, roughness: 0.3, metalness: 0.2 });
      const aorta = new THREE.Mesh(aortaGeo, aortaMat);
      aorta.position.set(0, 0.7, 0);
      aorta.rotation.z = Math.PI * 0.15;
      aorta.name = 'Aortic Arch';
      group.add(aorta);
    } else if (id === 'car') {
      // Aerodynamic Monocoque Chassis
      const chassisGeo = new THREE.BoxGeometry(1.6, 0.45, 3.4);
      const chassisMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, roughness: 0.12, metalness: 0.95 });
      const chassis = new THREE.Mesh(chassisGeo, chassisMat);
      chassis.name = 'Carbon Monocoque Chassis';
      group.add(chassis);

      // Cockpit Canopy
      const cockpitGeo = new THREE.SphereGeometry(0.65, 16, 16);
      const cockpitMat = new THREE.MeshPhysicalMaterial({
        color: 0x111118,
        transmission: 0.7,
        roughness: 0.1,
        metalness: 0.2,
        transparent: true,
      });
      const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
      cockpit.scale.set(1.1, 0.75, 2.0);
      cockpit.position.set(0, 0.35, -0.2);
      cockpit.name = 'Panoramic Cockpit Canopy';
      group.add(cockpit);

      // 4 Turbine Wheels
      const wheelPositions = [
        [-0.9, -0.15, 1.1],
        [0.9, -0.15, 1.1],
        [-0.9, -0.15, -1.1],
        [0.9, -0.15, -1.1],
      ];
      wheelPositions.forEach((pos, idx) => {
        const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 24);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.7, metalness: 0.8 });
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos[0], pos[1], pos[2]);
        wheel.name = `Titanium Alloy Wheel ${idx + 1}`;
        group.add(wheel);
      });

      // Rear Aero Wing
      const wingGeo = new THREE.BoxGeometry(1.8, 0.05, 0.4);
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2, metalness: 0.9 });
      const wing = new THREE.Mesh(wingGeo, wingMat);
      wing.position.set(0, 0.55, -1.5);
      wing.name = 'Active Aero Downforce Wing';
      group.add(wing);
    }

    return group;
  };

  // 2. Initialize Three.js Viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(3.2, 2.4, 4.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.localClippingEnabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 15;
    controls.minDistance = 0.8;
    controlsRef.current = controls;

    // Soft Contact Shadow Plane
    const shadowGeo = new THREE.PlaneGeometry(8, 8);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -1.0;
    scene.add(shadowMesh);

    // Initial Lighting
    updateLighting(scene, lightingMode);

    // Load Default Model
    loadModel(activePreset);

    let animId = 0;
    let clock = new THREE.Clock();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      controls.update();

      if (isAutoRotating && modelRootRef.current) {
        modelRootRef.current.rotation.y += delta * 0.5;
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // Update Environment Lighting
  const updateLighting = (scene: THREE.Scene, mode: string) => {
    // Remove existing lights
    const toRemove = scene.children.filter((c) => c instanceof THREE.Light);
    toRemove.forEach((l) => scene.remove(l));

    if (mode === 'studio') {
      scene.add(new THREE.AmbientLight(0xffffff, 1.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.0);
      key.position.set(5, 8, 5);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xbad7ff, 0.9);
      fill.position.set(-5, 3, -4);
      scene.add(fill);
    } else if (mode === 'sunset') {
      scene.add(new THREE.AmbientLight(0x402030, 0.9));
      const sun = new THREE.DirectionalLight(0xff7733, 2.8);
      sun.position.set(6, 4, 3);
      scene.add(sun);
      const sky = new THREE.DirectionalLight(0x7799ff, 0.7);
      sky.position.set(-4, 6, -5);
      scene.add(sky);
    } else if (mode === 'cyber') {
      scene.add(new THREE.AmbientLight(0x050515, 0.8));
      const cyan = new THREE.DirectionalLight(0x00f5d4, 2.5);
      cyan.position.set(-5, 4, 3);
      scene.add(cyan);
      const magenta = new THREE.DirectionalLight(0xff007f, 2.5);
      magenta.position.set(5, 3, -3);
      scene.add(magenta);
    } else {
      // Deep Space
      scene.add(new THREE.AmbientLight(0x101525, 0.5));
      const star = new THREE.DirectionalLight(0xffffff, 3.2);
      star.position.set(8, 10, 6);
      scene.add(star);
    }
  };

  useEffect(() => {
    if (sceneRef.current) {
      updateLighting(sceneRef.current, lightingMode);
    }
  }, [lightingMode]);

  // Load Model Preset or Custom
  const loadModel = (id: PresetModelId) => {
    if (!sceneRef.current) return;
    if (modelRootRef.current) {
      sceneRef.current.remove(modelRootRef.current);
    }

    const model = buildPresetModel(id);
    modelRootRef.current = model;
    sceneRef.current.add(model);

    // Cache original positions for exploded view
    originalPositionsRef.current.clear();
    let verts = 0,
      tris = 0,
      meshCount = 0;

    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshCount++;
        originalPositionsRef.current.set(child, child.position.clone());
        if (child.geometry) {
          verts += child.geometry.attributes.position ? child.geometry.attributes.position.count : 0;
          tris += child.geometry.index ? child.geometry.index.count / 3 : child.geometry.attributes.position.count / 3;
        }
      }
    });

    setModelStats({ vertices: Math.round(verts), triangles: Math.round(tris), meshes: meshCount });
    applyMaterials();
    setExplodeFactor(0);
  };

  // Material & Shader Updates
  const applyMaterials = useCallback(() => {
    if (!modelRootRef.current) return;
    modelRootRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach(updateMat);
        } else if (child.material) {
          updateMat(child.material);
        }
      }
    });

    function updateMat(mat: THREE.Material) {
      if ('wireframe' in mat) {
        (mat as THREE.Material & { wireframe: boolean }).wireframe = wireframe;
      }
      if (clippingActive) {
        mat.clippingPlanes = [clippingPlaneRef.current];
        mat.clipShadows = true;
      } else {
        mat.clippingPlanes = [];
      }
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.roughness = roughness;
        mat.metalness = metalness;
      }
      if (mat instanceof THREE.MeshPhysicalMaterial) {
        mat.transmission = transmission;
        mat.roughness = roughness;
      }
      mat.needsUpdate = true;
    }
  }, [wireframe, roughness, metalness, transmission, clippingActive]);

  useEffect(() => {
    applyMaterials();
  }, [applyMaterials]);

  // Exploded View Disassembler calculation
  useEffect(() => {
    if (!modelRootRef.current) return;
    const center = new THREE.Vector3(0, 0, 0);

    modelRootRef.current.traverse((child) => {
      const orig = originalPositionsRef.current.get(child);
      if (orig && child instanceof THREE.Mesh) {
        const dir = orig.clone().sub(center).normalize();
        if (dir.lengthSq() === 0) dir.set(0, 1, 0);
        child.position.copy(orig).addScaledVector(dir, explodeFactor * 1.5);
      }
    });
  }, [explodeFactor]);

  // Dynamic Cross-Section Clipping Plane calculation
  useEffect(() => {
    const normal =
      clipAxis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : clipAxis === 'y'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
    clippingPlaneRef.current.set(normal, clipOffset);
    applyMaterials();
  }, [clipAxis, clipOffset, applyMaterials]);

  // Handle Custom File Upload (GLTF / GLB / OBJ)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();

    reader.onload = (event) => {
      const buffer = event.target?.result;
      if (!buffer || !sceneRef.current) return;

      if (extension === 'gltf' || extension === 'glb') {
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder); // models/alkafeel* are meshopt-packed (scripts/compress-glb.mjs)
        loader.parse(
          buffer as ArrayBuffer,
          '',
          (gltf) => {
            if (modelRootRef.current) sceneRef.current?.remove(modelRootRef.current);
            const loadedModel = gltf.scene;

            // Center and normalize size
            const bbox = new THREE.Box3().setFromObject(loadedModel);
            const size = bbox.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            loadedModel.scale.setScalar(2.2 / (maxDim || 1));
            loadedModel.position.set(0, 0, 0);

            modelRootRef.current = loadedModel;
            sceneRef.current?.add(loadedModel);
            setCustomModelName(file.name);
            spatialSound.playAnchorDrop();

            originalPositionsRef.current.clear();
            loadedModel.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                originalPositionsRef.current.set(child, child.position.clone());
              }
            });
            applyMaterials();
          },
          (err) => console.error('Error loading glTF', err)
        );
      } else if (extension === 'obj') {
        const text = new TextDecoder().decode(buffer as ArrayBuffer);
        const loader = new OBJLoader();
        const obj = loader.parse(text);
        if (modelRootRef.current) sceneRef.current.remove(modelRootRef.current);
        const bbox = new THREE.Box3().setFromObject(obj);
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        obj.scale.setScalar(2.2 / (maxDim || 1));
        modelRootRef.current = obj;
        sceneRef.current.add(obj);
        setCustomModelName(file.name);
        spatialSound.playAnchorDrop();
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const currentPresetItem = PRESETS.find((p) => p.id === activePreset);

  return (
    <div className="flex flex-col h-full w-full select-none text-white overflow-hidden rounded-2xl relative bg-black/40 backdrop-blur-2xl">
      {/* Top Studio Control Bar */}
      <div className="h-12 px-4 border-b border-white/10 flex items-center justify-between bg-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
            <Box className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-wide">Spatial 3D Model Studio & PBR Lab</h2>
            <p className="text-[10px] text-white/50">Universal Asset Inspector, Exploded Views & Cross-Sections</p>
          </div>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/10 border border-white/10 text-xs">
          {[
            { id: 'inspect', label: 'Inspector', icon: Eye },
            { id: 'materials', label: 'Materials', icon: Sliders },
            { id: 'explode', label: 'Explode', icon: Layers },
            { id: 'slice', label: 'Cross-Section', icon: Scissors },
            { id: 'measure', label: 'Dimensions', icon: Ruler },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  spatialSound.playHover();
                }}
                className={`px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors ${
                  activeTab === tab.id ? 'bg-white/30 text-white font-medium shadow' : 'text-white/60 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Import 3D Model File Button */}
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-300 text-xs cursor-pointer shadow transition-all">
          <Upload className="w-3.5 h-3.5" />
          <span>Upload GLTF / OBJ</span>
          <input type="file" accept=".gltf,.glb,.obj,.stl" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      {/* Main Studio Workspace: 3D Viewport + Left Model Drawer + Right Tool Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Preset Drawer */}
        <div className="w-56 border-r border-white/10 p-3 flex flex-col gap-2 overflow-y-auto bg-black/20">
          <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider px-1">
            Library Presets
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setActivePreset(p.id);
                setCustomModelName(null);
                loadModel(p.id);
                spatialSound.playPinchTap();
              }}
              className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                activePreset === p.id && !customModelName
                  ? 'bg-white/20 border-emerald-400/60 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                  : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">{p.name}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/70">{p.category}</span>
              </div>
              <span className="text-[10px] text-white/50">{p.partsCount} Sub-components</span>
            </button>
          ))}

          {customModelName && (
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs">
              <span className="text-[10px] uppercase tracking-wider block font-bold">Custom Model</span>
              <span className="truncate block font-medium mt-0.5">{customModelName}</span>
            </div>
          )}

          {/* Real-Time Polygon & Mesh Telemetry Box */}
          <div className="mt-auto p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-[10px] space-y-1 text-white/60">
            <div className="flex justify-between">
              <span>Triangles:</span>
              <span className="font-mono text-white">{modelStats.triangles.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Vertices:</span>
              <span className="font-mono text-white">{modelStats.vertices.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Meshes:</span>
              <span className="font-mono text-white">{modelStats.meshes}</span>
            </div>
          </div>
        </div>

        {/* Center Three.js Viewport */}
        <div className="flex-1 h-full relative overflow-hidden" ref={containerRef}>
          {/* Floating Viewport Quick Controls */}
          <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs">
            <button
              onClick={() => setIsAutoRotating((r) => !r)}
              className={`p-1.5 rounded-full transition-colors ${isAutoRotating ? 'text-emerald-300' : 'text-white/60'}`}
              title="Auto-rotate turntable"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <div className="h-3 w-px bg-white/20" />
            <button
              onClick={() => {
                if (cameraRef.current && controlsRef.current) {
                  cameraRef.current.position.set(3.2, 2.4, 4.2);
                  controlsRef.current.target.set(0, 0, 0);
                  controlsRef.current.update();
                }
              }}
              className="text-[10px] text-white/70 hover:text-white"
            >
              Reset View
            </button>
          </div>

          {/* Place in Physical AR Button */}
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={() => {
                spatialSound.playPinchTap();
                window.dispatchEvent(new Event('visionos:place-product'));
              }}
              className="vision-btn px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(52,211,153,0.6)]"
            >
              <Crosshair className="w-4 h-4" />
              <span>Place Model in AR</span>
            </button>
          </div>
        </div>

        {/* Right Inspection & Parameter Panel */}
        <div className="w-72 border-l border-white/10 p-4 flex flex-col gap-4 overflow-y-auto bg-black/20">
          {activeTab === 'inspect' && (
            <div className="space-y-4">
              <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider">
                Environment Lighting
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'studio', label: 'Studio White' },
                  { id: 'sunset', label: 'Golden Sunset' },
                  { id: 'cyber', label: 'Cyberpunk Neon' },
                  { id: 'deepspace', label: 'Deep Space' },
                ].map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setLightingMode(l.id as any)}
                    className={`p-2 rounded-xl border text-xs text-center transition-colors ${
                      lightingMode === l.id
                        ? 'bg-white/25 border-emerald-400 text-white font-medium'
                        : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-white/10 space-y-2">
                <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider">
                  Shading Overlays
                </span>
                <label className="flex items-center justify-between p-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs cursor-pointer">
                  <span>Wireframe Mesh Overlay</span>
                  <input
                    type="checkbox"
                    checked={wireframe}
                    onChange={(e) => setWireframe(e.target.checked)}
                    className="accent-emerald-400 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}

          {activeTab === 'materials' && (
            <div className="space-y-4">
              <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider">
                PBR Material Shader
              </span>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span>Metalness</span>
                    <span className="font-mono text-white/70">{metalness.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={metalness}
                    onChange={(e) => setMetalness(Number(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span>Roughness</span>
                    <span className="font-mono text-white/70">{roughness.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={roughness}
                    onChange={(e) => setRoughness(Number(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span>Frosted Glass Transmission</span>
                    <span className="font-mono text-white/70">{transmission.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={transmission}
                    onChange={(e) => setTransmission(Number(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'explode' && (
            <div className="space-y-4">
              <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider">
                Exploded View Disassembler
              </span>
              <p className="text-[11px] text-white/60 leading-relaxed">
                Smoothly separate sub-components along their centroid vectors to inspect internal engineering.
              </p>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span>Disassembly Distance</span>
                  <span className="font-mono text-emerald-300 font-bold">{Math.round(explodeFactor * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.01"
                  value={explodeFactor}
                  onChange={(e) => setExplodeFactor(Number(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>

              <button
                onClick={() => setExplodeFactor(0)}
                className="w-full py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium border border-white/10"
              >
                Reassemble Model
              </button>
            </div>
          )}

          {activeTab === 'slice' && (
            <div className="space-y-4">
              <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider">
                Cross-Section Clipping Plane
              </span>
              <label className="flex items-center justify-between p-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs cursor-pointer">
                <span>Active Clipping Plane</span>
                <input
                  type="checkbox"
                  checked={clippingActive}
                  onChange={(e) => setClippingActive(e.target.checked)}
                  className="accent-emerald-400 cursor-pointer"
                />
              </label>

              {clippingActive && (
                <div className="space-y-3 text-xs animate-fadeIn">
                  <div className="flex gap-1.5">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <button
                        key={axis}
                        onClick={() => setClipAxis(axis)}
                        className={`flex-1 py-1 rounded-lg uppercase font-bold text-[11px] border ${
                          clipAxis === axis
                            ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200'
                            : 'bg-white/10 border-white/10'
                        }`}
                      >
                        {axis}-Axis
                      </button>
                    ))}
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span>Cut Offset Depth</span>
                      <span className="font-mono text-white/70">{clipOffset.toFixed(2)}m</span>
                    </div>
                    <input
                      type="range"
                      min="-2.0"
                      max="2.0"
                      step="0.05"
                      value={clipOffset}
                      onChange={(e) => setClipOffset(Number(e.target.value))}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'measure' && (
            <div className="space-y-4">
              <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider">
                Real-World Dimensions
              </span>
              {currentPresetItem && (
                <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-white/60">Width (X):</span>
                    <span className="font-mono font-bold text-emerald-300">{currentPresetItem.dimensions.w} cm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Height (Y):</span>
                    <span className="font-mono font-bold text-emerald-300">{currentPresetItem.dimensions.h} cm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Depth (Z):</span>
                    <span className="font-mono font-bold text-emerald-300">{currentPresetItem.dimensions.d} cm</span>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-white/50 leading-relaxed">
                Models are automatically calibrated to 1:1 metric scale when placed in real physical rooms.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
