import * as THREE from 'three';

export class ARCardManager {
  constructor(anchorGroup) {
    this.anchor = anchorGroup;
    this.hotspotMeshes = [];
    this.hologramGroup = new THREE.Group();
    this.anchor.add(this.hologramGroup);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // High-resolution canvas texture for the Apple VisionOS style frosted glass board
    this.cardCanvas = document.createElement('canvas');
    this.cardCanvas.width = 1024;
    this.cardCanvas.height = 700;
    this.cardContext = this.cardCanvas.getContext('2d');
    this.cardTexture = new THREE.CanvasTexture(this.cardCanvas);
    this.cardTexture.minFilter = THREE.LinearFilter;

    this.cardMesh = null;
    this.gridMesh = null;
    this.axesGroup = null;
    this.hotspotGroup = new THREE.Group();
    this.hologramGroup.add(this.hotspotGroup);

    this.time = 0;
    this.currentMetadata = null;
    this.onHotspotClick = null;

    // Build Apple-style minimal AR frame and coordinate axes
    this._createARSurfaceFrameAndAxes();
  }

  _createARSurfaceFrameAndAxes() {
    const targetW = 1.0;
    const targetH = 0.88;
    const halfW = targetW / 2;
    const halfH = targetH / 2;

    const frameGroup = new THREE.Group();

    // 1. Sleek Minimal White/Silver Corner Brackets
    const bracketMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const cornerSize = 0.10;

    const addCorner = (x, y, dx, dy) => {
      const points = [
        new THREE.Vector3(x, y + dy * cornerSize, 0.002),
        new THREE.Vector3(x, y, 0.002),
        new THREE.Vector3(x + dx * cornerSize, y, 0.002)
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, bracketMat);
      frameGroup.add(line);
    };

    addCorner(-halfW, -halfH, 1, 1);    // Bottom-Left
    addCorner(halfW, -halfH, -1, 1);    // Bottom-Right
    addCorner(-halfW, halfH, 1, -1);    // Top-Left
    addCorner(halfW, halfH, -1, -1);    // Top-Right

    // Subtle hairline perimeter
    const perimeterGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfW, -halfH, 0.001),
      new THREE.Vector3(halfW, -halfH, 0.001),
      new THREE.Vector3(halfW, halfH, 0.001),
      new THREE.Vector3(-halfW, halfH, 0.001),
      new THREE.Vector3(-halfW, -halfH, 0.001)
    ]);
    const perimeterMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35
    });
    const perimeterLine = new THREE.Line(perimeterGeo, perimeterMat);
    frameGroup.add(perimeterLine);

    this.hologramGroup.add(frameGroup);

    // 2. Apple Precision 3D Coordinate Axis Gizmo
    const axes = new THREE.Group();
    axes.position.set(-halfW - 0.04, -halfH - 0.04, 0.002);
    const axisLength = 0.15;

    // X Axis (Red)
    const xGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(axisLength, 0, 0)]);
    const xMat = new THREE.LineBasicMaterial({ color: 0xff3b30, linewidth: 2 });
    axes.add(new THREE.Line(xGeo, xMat));

    // Y Axis (Green)
    const yGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axisLength, 0)]);
    const yMat = new THREE.LineBasicMaterial({ color: 0x34c759, linewidth: 2 });
    axes.add(new THREE.Line(yGeo, yMat));

    // Z Axis (Blue Elevation)
    const zGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, axisLength)]);
    const zMat = new THREE.LineBasicMaterial({ color: 0x0071e3, linewidth: 2 });
    axes.add(new THREE.Line(zGeo, zMat));

    this.axesGroup = axes;
    this.hologramGroup.add(axes);
  }

  createHolographicCard(metadata) {
    this.currentMetadata = metadata;
    this._renderCardTexture(metadata);

    if (!this.cardMesh) {
      // 3D Plane positioned floating above the top edge
      const geometry = new THREE.PlaneGeometry(0.96, 0.65);
      const material = new THREE.MeshBasicMaterial({
        map: this.cardTexture,
        transparent: true,
        opacity: 0.98,
        side: THREE.DoubleSide
      });

      this.cardMesh = new THREE.Mesh(geometry, material);
      this.cardMesh.position.set(0, 0.62, 0.15);
      this.cardMesh.rotation.x = -Math.PI * 0.11;

      // Subtle frosted back shadow plane
      const shadowGeo = new THREE.PlaneGeometry(0.98, 0.67);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.12
      });
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.position.z = -0.003;
      this.cardMesh.add(shadowMesh);

      // Clean anchor tether line
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.325, 0),
        new THREE.Vector3(0, -0.62, -0.15)
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x86868b,
        transparent: true,
        opacity: 0.5
      });
      const anchorLine = new THREE.Line(lineGeo, lineMat);
      this.cardMesh.add(anchorLine);

      this.hologramGroup.add(this.cardMesh);
    } else {
      this.cardTexture.needsUpdate = true;
    }
  }

  _renderCardTexture(meta) {
    const ctx = this.cardContext;
    const w = this.cardCanvas.width;
    const h = this.cardCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Vision Pro Dark Glass Card
    ctx.fillStyle = 'rgba(40, 40, 40, 0.8)'; // Dark translucent
    this._roundRect(ctx, 16, 16, w - 32, h - 32, 28);
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = 'rgba(201, 201, 201, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Top Header Badge
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    this._roundRect(ctx, 42, 38, 200, 36, 18);
    ctx.fill();

    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('ALQAMI INTELLIGENCE', 58, 61);

    // Identifier Badge
    ctx.font = '500 13px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'right';
    ctx.fillText(meta?.identifier || 'MS-SHIFA-1302', w - 45, 61);
    ctx.textAlign = 'left';

    // Title (English)
    ctx.font = '600 28px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(meta?.title || 'Kitab al-Shifa: Logic and Metaphysics', 45, 118);

    // Arabic Subtitle
    if (meta?.titleArabic) {
      ctx.font = '24px "Amiri", "Traditional Arabic", serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText(meta.titleArabic, 45, 158);
    }

    // Thin Hairline Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(45, 180);
    ctx.lineTo(w - 45, 180);
    ctx.stroke();

    // Properties Grid
    const drawProp = (label, val, x, y) => {
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(label.toUpperCase(), x, y);

      ctx.font = '500 17px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#ffffff';
      const truncated = val && val.length > 34 ? val.slice(0, 32) + '…' : (val || '—');
      ctx.fillText(truncated, x, y + 22);
    };

    drawProp('Author (dc:creator)', meta?.creator || 'Ibn Sina (Avicenna)', 45, 218);
    drawProp('Period (dc:date)', meta?.date || '16th-17th Century', 520, 218);

    drawProp('Material (schema:material)', meta?.material || 'Gold leaf, Lapis lazuli, Rag paper', 45, 290);
    drawProp('Holding Repository', meta?.publisher || 'Majlis Parliament Library', 520, 290);

    drawProp('Script Style', 'Naskh text with Marginal Nastaliq', 45, 362);
    drawProp('Dimensions', meta?.dimensions || '26.5 x 17.2 cm', 520, 362);

    // Bottom Quote / Transcription Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    this._roundRect(ctx, 45, 420, w - 90, 155, 16);
    ctx.fill();

    ctx.font = '600 11px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText('ONTOLOGY TRANSCRIPTION (dc:description)', 65, 448);

    ctx.font = '16px "Amiri", "Traditional Arabic", serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('« بسم الله الرحمن الرحيم - الحمد لله الواحد الأحد الصمد المصور... »', 65, 484);

    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('"In the Name of God... origination (ibda) and cosmic formation (takwin)..."', 65, 516);

    // Tracking Status Footer
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#34c759';
    ctx.fillText('Tracking Active (60 FPS)', 65, 550);

    this.cardTexture.needsUpdate = true;
  }

  _roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  createHotspots(hotspotsList) {
    while (this.hotspotGroup.children.length > 0) {
      const obj = this.hotspotGroup.children[0];
      this.hotspotGroup.remove(obj);
    }
    this.hotspotMeshes = [];

    const targetW = 1.0;
    const targetH = 0.88;

    hotspotsList.forEach((hs, idx) => {
      const posX = (hs.normX - 0.5) * targetW;
      const posY = (0.5 - hs.normY) * targetH;
      const posZ = hs.elevZ || 0.055;

      const group = new THREE.Group();
      group.position.set(posX, posY, posZ);
      group.userData = { hotspot: hs, index: idx };

      // 1. Subtle White Vertical Laser Line
      const beamGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -posZ)
      ]);
      const beamMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.75,
        linewidth: 2
      });
      const beam = new THREE.Line(beamGeo, beamMat);
      group.add(beam);

      // 2. Base Surface Ring on Manuscript
      const ringGeo = new THREE.RingGeometry(0.018, 0.032, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x0071e3,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.z = -posZ + 0.001;
      group.add(ring);

      // 3. Apple Minimal 3D Sphere / Pin Marker
      const pinGeo = new THREE.SphereGeometry(0.024, 24, 24);
      const pinMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0.2,
        emissive: 0x0071e3,
        emissiveIntensity: 0.3
      });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.name = 'pinMesh';
      group.add(pinMesh);

      // 4. Clean White Billboard Label -> Dark Glass Billboard
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 360;
      labelCanvas.height = 84;
      const lCtx = labelCanvas.getContext('2d');
      lCtx.fillStyle = 'rgba(40, 40, 40, 0.8)';
      this._roundRect(lCtx, 4, 4, 352, 76, 18);
      lCtx.fill();
      lCtx.strokeStyle = 'rgba(201, 201, 201, 0.6)';
      lCtx.lineWidth = 2;
      lCtx.stroke();

      lCtx.font = '600 20px -apple-system, BlinkMacSystemFont, sans-serif';
      lCtx.fillStyle = '#ffffff';
      lCtx.textAlign = 'center';
      const truncatedLabel = hs.label.length > 22 ? hs.label.slice(0, 20) + '…' : hs.label;
      lCtx.fillText(truncatedLabel, 180, 38);

      lCtx.font = '500 14px -apple-system, BlinkMacSystemFont, sans-serif';
      lCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      lCtx.fillText(hs.folio || 'Region', 180, 62);

      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelGeo = new THREE.PlaneGeometry(0.22, 0.052);
      const labelMat = new THREE.MeshBasicMaterial({
        map: labelTex,
        transparent: true,
        side: THREE.DoubleSide
      });
      const labelMesh = new THREE.Mesh(labelGeo, labelMat);
      labelMesh.position.y = 0.05;
      labelMesh.name = 'labelBillboard';
      group.add(labelMesh);

      this.hotspotGroup.add(group);
      this.hotspotMeshes.push(pinMesh);
    });
  }

  update(delta) {
    this.time += delta;

    if (this.cardMesh) {
      this.cardMesh.position.z = 0.15 + Math.sin(this.time * 2.0) * 0.01;
    }

    this.hotspotGroup.children.forEach((group, idx) => {
      const pin = group.getObjectByName('pinMesh');
      if (pin) {
        pin.position.z = Math.sin(this.time * 2.5 + idx) * 0.005;
      }
    });
  }

  checkRaycast(camera, screenX, screenY, width, height) {
    this.mouse.x = (screenX / width) * 2 - 1;
    this.mouse.y = -(screenY / height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObjects(this.hotspotMeshes, true);

    if (intersects.length > 0) {
      const hit = intersects[0].object.parent;
      if (hit && hit.userData && hit.userData.hotspot) {
        return hit.userData.hotspot;
      }
    }
    return null;
  }
}
