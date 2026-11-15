// Fast WebGL Multi-Angle 3D Statue, Monument & Artifact Recognition Engine for Alqami
// Uses 4-Window Foreground-Masked MobileNetV2 (1280-D) + 64-D 3-Zone Statue Anatomy Signature
import { FeatureExtractor } from './feature-extractor.js';
import { SimilarityMetrics } from './similarity.js';
import { TemporalStabilityFilter } from './temporal-filter.js';
import { ArtifactDatabase } from '../database/artifact-db.js';

export class ClosedSetRecognitionEngine {
  constructor(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    
    this.featureExtractor = new FeatureExtractor();
    this.db = new ArtifactDatabase();
    this.temporalFilter = new TemporalStabilityFilter({
      windowSize: 4,
      requiredVotes: 2,
      lossGraceMs: 1400,
      emaAlpha: 0.50
    });

    this.artifacts = [];
    this.globalThreshold = 0.60; // Calibrated for Foreground-Masked WebGL MobileNetV2 + 64-D 3-Zone Signature
    this.isRunning = false;
    this.isModelReady = false;
    this.initPromise = null;
    this.animFrameId = null;
    this.isProcessingFrame = false;

    // Auto 360° Sweep state
    this.isSweeping = false;

    // Callbacks
    this.onEvaluation = null;
    this.onArtifactConfirmed = null;
    this.onArtifactLost = null;
    
    this.lastConfirmedId = null;
    this.lastMatchedView = null;
  }

  async init() {
    if (this.isModelReady && this.artifacts.length > 0) return true;
    if (this.initPromise) return this.initPromise;

    console.log('Initializing Fast WebGL Multi-Angle 3D Recognition Engine...');
    this.initPromise = (async () => {
      await Promise.all([
        this.featureExtractor.init(),
        this.db.init()
      ]);
      this.artifacts = await this.db.getAll();
      this.isModelReady = true;
      console.log(`Loaded ${this.artifacts.length} registered multi-angle artifacts into recognition index.`);
      return true;
    })();

    return this.initPromise;
  }

  async reloadDatabase() {
    this.artifacts = await this.db.getAll();
    console.log(`Reloaded ${this.artifacts.length} artifacts in recognition engine.`);
  }

  setThreshold(thresholdValue) {
    this.globalThreshold = Math.max(0.0, Math.min(1.0, parseFloat(thresholdValue)));
    if (this.artifacts) {
      this.artifacts.forEach(a => {
        a._liveThresholdOverride = this.globalThreshold;
      });
    }
    console.log(`Updated recognition threshold: ${this.globalThreshold}`);
  }

  async _getOrCreateArtifact(targetArtifactId, targetTitle) {
    let artifact = await this.db.get(targetArtifactId);
    if (!artifact) {
      artifact = {
        id: targetArtifactId,
        identifier: `IPKSN:${targetArtifactId}`,
        title: targetTitle || `مجسم متعدد الزوايا (${targetArtifactId})`,
        type: 'statue_3d',
        description: 'مجسم ثلاثي الأبعاد تم مسحه ميدانياً عبر الهاتف من زوايا متعددة (360° Multi-Angle Object).',
        collection: 'المسح الميداني المباشر (Live 360° 3D Scanner)',
        institution: 'مختبر القمي للرؤية المكانية',
        date: new Date().getFullYear().toString(),
        materials: ['مجسم حقيقي متعدد الزوايا'],
        recognitionThreshold: 0.60,
        bibframe: { ttlPath: 'astronaut.ttl' },
        arModel: { glb: 'procedural:astronaut', scale: 0.85 },
        images: [],
        embeddings: []
      };
    }
    if (!artifact.images) artifact.images = [];
    if (!artifact.embeddings) artifact.embeddings = [];
    return artifact;
  }

  /**
   * Captures the current camera frame ROI across 4 scales (including Foreground-Masked) and saves to DB.
   */
  async captureLiveAngle(targetArtifactId, targetTitle, viewName = 'angle') {
    await this.init();
    if (!this.video || this.video.readyState < 2) {
      throw new Error('Camera stream not ready');
    }

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = vw;
    snapCanvas.height = vh;
    const snapCtx = snapCanvas.getContext('2d');
    snapCtx.drawImage(this.video, 0, 0, vw, vh);

    const viewLabels = {
      front: 'الزاوية الأمامية (Front 0°)',
      left: 'الزاوية اليسرى (Left -60°)',
      right: 'الزاوية اليمنى (Right +60°)',
      wide: 'زاوية شاملة / علوية (Wide 3D)',
      back: 'الزاوية الخلفية (Back 180°)'
    };
    const label = viewLabels[viewName] || `زاوية مخصصة (${viewName.toUpperCase()})`;

    const newEmbeddings = await this.featureExtractor.extractMultiScaleFromImage(snapCanvas, viewName, label);
    const artifact = await this._getOrCreateArtifact(targetArtifactId, targetTitle);

    artifact.images.push({
      view: viewName,
      label: `${label} • ${new Date().toLocaleTimeString()}`,
      file: 'live-camera-capture'
    });
    artifact.embeddings.push(...newEmbeddings);

    await this.db.save(artifact);
    await this.reloadDatabase();
    return {
      artifact,
      addedScales: newEmbeddings.length,
      totalEmbeddings: artifact.embeddings.length
    };
  }

  /**
   * Guided 6-Second 360° Orbit Auto-Capture:
   * Samples frames as the user walks around the statue, filters out blurry frames,
   * deduplicates near-identical frames (cosine > 0.94), and saves up to 12 diverse keyframes!
   */
  async startAutoSweep360(targetArtifactId, targetTitle, onProgress) {
    await this.init();
    if (!this.video || this.video.readyState < 2) {
      throw new Error('Camera stream not ready');
    }
    if (this.isSweeping) return;

    this.isSweeping = true;
    const durationMs = 6000;
    const intervalMs = 350;
    const maxKeyframes = 12;
    const startTime = performance.now();

    const capturedVectors = [];
    const artifact = await this._getOrCreateArtifact(targetArtifactId, targetTitle);

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const roiSize = Math.round(Math.min(vw, vh) * 0.68);
    const roi = {
      x: Math.round((vw - roiSize) / 2),
      y: Math.round((vh - roiSize) / 2),
      width: roiSize,
      height: roiSize
    };

    try {
      while (performance.now() - startTime < durationMs && capturedVectors.length < maxKeyframes && this.isRunning) {
        const elapsed = performance.now() - startTime;
        const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));

        const query = await this.featureExtractor.extractFromCrop(this.video, roi);
        const sharpness = query.salientRoi?.sharpness ?? 10;

        if (sharpness >= 2.5) {
          let maxSim = 0;
          for (const prev of capturedVectors) {
            const s = SimilarityMetrics.cosineSimilarity(query.maskedVector || query.tightVector, prev);
            if (s > maxSim) maxSim = s;
          }

          if (capturedVectors.length === 0 || maxSim < 0.94) {
            const refVec = query.maskedVector || query.tightVector;
            capturedVectors.push(refVec);
            const idx = capturedVectors.length;
            const angleTag = idx <= 3 ? 'front' : idx <= 6 ? 'left' : idx <= 9 ? 'right' : 'wide';
            artifact.embeddings.push({
              view: angleTag,
              scale: 'sweep-masked',
              label: `مسح 360° معزول #${idx}`,
              vector: Array.from(refVec).map(n => Math.round(n * 10000) / 10000),
              colorSignature: Array.from(query.colorSignature).map(n => Math.round(n * 10000) / 10000)
            });
            artifact.embeddings.push({
              view: angleTag,
              scale: 'sweep-tight',
              label: `مسح 360° تلقائي #${idx}`,
              vector: Array.from(query.tightVector).map(n => Math.round(n * 10000) / 10000),
              colorSignature: Array.from(query.colorSignature).map(n => Math.round(n * 10000) / 10000)
            });
          }
        }

        if (onProgress) {
          onProgress({ pct, captured: capturedVectors.length, maxKeyframes });
        }

        await new Promise(r => setTimeout(r, intervalMs));
      }

      if (capturedVectors.length > 0) {
        artifact.images.push({
          view: '360-sweep',
          label: `مسح 360° تلقائي (${capturedVectors.length} لقطات) • ${new Date().toLocaleTimeString()}`,
          file: 'auto-sweep-360'
        });
        await this.db.save(artifact);
        await this.reloadDatabase();
      }

      return {
        capturedKeyframes: capturedVectors.length,
        totalEmbeddings: artifact.embeddings.length
      };
    } finally {
      this.isSweeping = false;
    }
  }

  async start() {
    this.isRunning = true;
    this.temporalFilter.reset();

    // Start model + database initialization in parallel without blocking camera startup!
    this.init().catch(err => console.error('Background engine init error:', err));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      this.video.srcObject = stream;
      await this.video.play();
    } catch (err) {
      console.error('Camera access error in Closed-Set Engine:', err);
      throw err;
    }

    const onLoaded = () => {
      this.canvas.width = this.video.videoWidth || 1280;
      this.canvas.height = this.video.videoHeight || 720;
      this._loop();
    };

    if (this.video.readyState >= 2) {
      onLoaded();
    } else {
      this.video.addEventListener('loadeddata', onLoaded, { once: true });
    }
  }

  stop() {
    this.isRunning = false;
    this.isSweeping = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop());
      this.video.srcObject = null;
    }
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.temporalFilter.reset();
    this.lastConfirmedId = null;
    this.lastMatchedView = null;
  }

  _loop() {
    if (!this.isRunning) return;

    if (!this.isProcessingFrame && this.video.readyState >= 2) {
      this.isProcessingFrame = true;
      this._processFrame().finally(() => {
        this.isProcessingFrame = false;
      });
    }

    this.animFrameId = requestAnimationFrame(() => this._loop());
  }

  async _processFrame() {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (vw === 0 || vh === 0) return;

    if (this.canvas.width !== vw || this.canvas.height !== vh) {
      this.canvas.width = vw;
      this.canvas.height = vh;
    }

    const roiSize = Math.round(Math.min(vw, vh) * 0.68);
    const roi = {
      x: Math.round((vw - roiSize) / 2),
      y: Math.round((vh - roiSize) / 2),
      width: roiSize,
      height: roiSize
    };

    // If model is still warming up on first frame, draw reticle immediately so user sees live UI
    if (!this.isModelReady || !this.artifacts || this.artifacts.length === 0) {
      this._renderVisuals(roi, null, false, { status: 'WARMING_UP' }, null, 0, this.globalThreshold, 0, 0);
      return;
    }

    // 1. Extract 4-Window Foreground-Masked WebGL Embedding + Auto-Saliency ROI + 64-D Part Signature
    let queryEmbedding;
    try {
      queryEmbedding = await this.featureExtractor.extractFromCrop(this.video, roi);
    } catch (e) {
      console.warn('Embedding extraction skipped frame:', e);
      return;
    }

    // 2. Vector search against multi-angle artifacts + _NEGATIVE_BACKGROUND distractors
    const evalResult = SimilarityMetrics.evaluate(queryEmbedding, this.artifacts);
    const bestCandidate = evalResult.bestMatch;
    const topScore = evalResult.topScore;
    const margin = evalResult.margin || 0;
    const negativeScore = evalResult.negativeScore || 0;

    // 3. Closed-Set Gate: Threshold + Negative Background Rejection + Runner-Up Margin
    const targetThreshold = bestCandidate?.artifact?._liveThresholdOverride
      ?? bestCandidate?.artifact?.recognitionThreshold
      ?? this.globalThreshold;

    const beatsNegative = topScore > (negativeScore + 0.015);
    const passesDirect = bestCandidate && topScore >= targetThreshold && beatsNegative;
    const passesMarginGate = bestCandidate && topScore >= (targetThreshold - 0.045) && margin >= 0.045 && beatsNegative;
    const passesThreshold = Boolean(passesDirect || passesMarginGate);

    if (bestCandidate) {
      bestCandidate.roi = queryEmbedding.salientRoi || roi;
    }

    // 4. Sliding-Window Temporal Voting
    const filterInput = passesThreshold ? bestCandidate : null;
    const temporalResult = this.temporalFilter.process(filterInput);

    // 5. Render AR Reticle, Live Saliency Auto-ROI Box & 360° Angle Compass Bar
    this._renderVisuals(roi, queryEmbedding.salientRoi, passesThreshold, temporalResult, bestCandidate, topScore, targetThreshold, margin, negativeScore);

    // 6. Notify subscribers
    const evalReport = {
      recognized: temporalResult.status === 'CONFIRMED',
      status: temporalResult.status,
      bestCandidate: bestCandidate,
      topScore: Math.round(topScore * 1000) / 10,
      margin: Math.round(margin * 1000) / 10,
      negativeScore: Math.round(negativeScore * 1000) / 10,
      threshold: Math.round(targetThreshold * 1000) / 10,
      roi: queryEmbedding.salientRoi || roi,
      candidates: evalResult.candidates.map(c => ({
        id: c.id,
        title: c.title,
        similarity: Math.round(c.similarity * 1000) / 10,
        matchedView: c.matchedView,
        angleBreakdown: c.angleBreakdown
      }))
    };

    if (this.onEvaluation) {
      this.onEvaluation(evalReport);
    }

    if (temporalResult.status === 'CONFIRMED' && temporalResult.candidate) {
      const cand = temporalResult.candidate;
      if (this.lastConfirmedId !== cand.id) {
        this.lastConfirmedId = cand.id;
        this.lastMatchedView = cand.matchedView;
        if (this.onArtifactConfirmed) {
          this.onArtifactConfirmed(cand);
        }
      } else if (this.lastMatchedView !== cand.matchedView) {
        this.lastMatchedView = cand.matchedView;
      }
    } else if (temporalResult.status === 'UNKNOWN') {
      if (this.lastConfirmedId !== null) {
        this.lastConfirmedId = null;
        this.lastMatchedView = null;
        if (this.onArtifactLost) {
          this.onArtifactLost();
        }
      }
    }
  }

  _renderVisuals(roi, salientRoi, passesThreshold, temporal, bestCandidate, topScore, threshold, margin, negativeScore) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const x = roi.x;
    const y = roi.y;
    const w = roi.width;
    const h = roi.height;
    const corner = 34;

    ctx.save();

    const isConfirmed = temporal.status === 'CONFIRMED';
    const isUnknown = temporal.status === 'UNKNOWN';

    let color = 'rgba(255, 255, 255, 0.45)';
    let glow = 'transparent';

    if (isConfirmed) {
      color = '#00f2fe';
      glow = 'rgba(0, 242, 254, 0.65)';
    } else if (isUnknown && topScore > 0) {
      color = '#ff9f0a';
      glow = 'rgba(255, 159, 10, 0.4)';
    }

    // 1. Draw Outer Medium ROI Corner Brackets
    ctx.lineWidth = isConfirmed ? 5 : 3;
    ctx.strokeStyle = color;
    ctx.shadowColor = glow;
    ctx.shadowBlur = isConfirmed ? 16 : 6;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x, y + corner); ctx.lineTo(x, y); ctx.lineTo(x + corner, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + w - corner, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + corner);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y + h - corner); ctx.lineTo(x, y + h); ctx.lineTo(x + corner, y + h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + w - corner, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - corner);
    ctx.stroke();

    // 2. Draw Live Edge-Saliency Auto-ROI Lock Box + Foreground Ellipse Guide
    if (salientRoi) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = isConfirmed ? 'rgba(0, 242, 254, 0.78)' : 'rgba(255, 215, 0, 0.60)';
      ctx.strokeRect(salientRoi.x, salientRoi.y, salientRoi.width, salientRoi.height);
      ctx.restore();
    }

    // 3. Floating Top Badge above Reticle
    const badgeW = Math.min(w, 400);
    const badgeH = 64;
    const badgeX = x + (w - badgeW) / 2;
    const badgeY = Math.max(16, y - badgeH - 14);

    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';

    if (temporal.status === 'WARMING_UP') {
      ctx.fillStyle = '#00f2fe';
      ctx.font = 'bold 14px -apple-system, sans-serif';
      ctx.fillText('⚡ جاري تفعيل محرك الرؤية ثلاثية الأبعاد (WebGL GPU)...', badgeX + badgeW / 2, badgeY + 36);
    } else if (isConfirmed && bestCandidate) {
      const pct = Math.round(topScore * 100);
      const viewTag = (bestCandidate.matchedView || 'FRONT').toUpperCase();
      ctx.fillStyle = '#00f2fe';
      ctx.font = 'bold 15px -apple-system, sans-serif';
      ctx.fillText(`✓ ${bestCandidate.id} • ${pct}% [3D MASKED • ${viewTag}]`, badgeX + badgeW / 2, badgeY + 24);

      ctx.fillStyle = '#ffffff';
      ctx.font = '600 13px -apple-system, sans-serif';
      const shortTitle = bestCandidate.title.length > 36 ? bestCandidate.title.slice(0, 34) + '…' : bestCandidate.title;
      ctx.fillText(shortTitle, badgeX + badgeW / 2, badgeY + 46);
    } else {
      ctx.fillStyle = '#ff9f0a';
      ctx.font = 'bold 14px -apple-system, sans-serif';
      ctx.fillText(`🔍 مسح ثلاثي الأبعاد سريع (360° Auto-Mask)`, badgeX + badgeW / 2, badgeY + 24);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.font = '12px -apple-system, sans-serif';
      const topPct = Math.round(topScore * 100);
      const thPct = Math.round(threshold * 100);
      const negPct = Math.round(negativeScore * 100);
      const candName = bestCandidate ? `${bestCandidate.id} (${bestCandidate.matchedView})` : '—';
      ctx.fillText(`${candName}: ${topPct}% | العتبة: ${thPct}% | خلفية: ${negPct}%`, badgeX + badgeW / 2, badgeY + 45);
    }

    // 4. Draw 360° Multi-Angle Compass Bar at Bottom of Reticle
    const angles = [
      { key: 'left', label: '◀ يسار LEFT' },
      { key: 'front', label: '▲ أمام FRONT' },
      { key: 'right', label: '▶ يمين RIGHT' },
      { key: 'wide', label: '🌐 شامل WIDE' }
    ];
    const barW = Math.min(w, 380);
    const barH = 32;
    const barX = x + (w - barW) / 2;
    const barY = y + h + 10;
    const cellW = barW / angles.length;

    const activeView = isConfirmed && bestCandidate ? (bestCandidate.matchedView || '').toLowerCase() : '';
    const breakdown = bestCandidate?.angleBreakdown || {};

    angles.forEach((ang, idx) => {
      const cxCell = barX + idx * cellW;
      const isMatch = activeView === ang.key || (ang.key === 'wide' && (activeView === 'angle' || activeView === 'top' || activeView === 'back'));
      const angScore = breakdown[ang.key] ? Math.round(breakdown[ang.key] * 100) : 0;

      ctx.fillStyle = isMatch ? 'rgba(0, 242, 254, 0.28)' : 'rgba(15, 23, 42, 0.82)';
      ctx.strokeStyle = isMatch ? '#00f2fe' : 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = isMatch ? 2 : 1;

      ctx.beginPath();
      ctx.roundRect(cxCell + 3, barY, cellW - 6, barH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isMatch ? '#00f2fe' : 'rgba(255, 255, 255, 0.7)';
      ctx.font = isMatch ? 'bold 11px -apple-system, sans-serif' : '500 11px -apple-system, sans-serif';
      const scoreSuffix = angScore > 0 ? ` ${angScore}%` : '';
      ctx.fillText(`${ang.label}${scoreSuffix}`, cxCell + cellW / 2, barY + 20);
    });

    ctx.restore();
  }
}
