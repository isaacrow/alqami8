// Real-Time Developer, Multi-Angle 360° Radar & Auto-Sweep Enroller HUD for Alqami (DINOv2-small)

export class TestInspectorHUD {
  constructor(containerElement, onThresholdChange, onLiveCaptureAngle, onAutoSweep360) {
    this.container = containerElement;
    this.onThresholdChange = onThresholdChange;
    this.onLiveCaptureAngle = onLiveCaptureAngle;
    this.onAutoSweep360 = onAutoSweep360;
    this.isCollapsed = false;
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div id="inspector-card" class="inspector-card vision-glass">
        <div class="inspector-header">
          <div class="inspector-title">
            <span class="inspector-dot"></span>
            <span>ماسح WebGL للمجسمات 360° (3D Statue Scanner)</span>
          </div>
          <button id="btn-inspector-toggle" class="btn-inspector-icon" title="طي / توسيع">▾</button>
        </div>

        <!-- Status Banner (Always Visible) -->
        <div id="inspector-status-badge" class="status-badge unknown">
          <span class="status-icon">🔍</span>
          <span class="status-text">جاري المسح متعدد الزوايا...</span>
        </div>

        <!-- Quick Live 360° Angle Calibration & Auto-Sweep Bar -->
        <div style="display: flex; flex-direction: column; gap: 6px; background: rgba(0, 242, 254, 0.07); border: 1px solid rgba(0, 242, 254, 0.25); border-radius: 12px; padding: 8px 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #00f2fe; font-weight: 600;">
            <span>📸 تدريب 360° حي (Live Teach):</span>
            <select id="live-teach-target" style="background: rgba(0,0,0,0.6); color: #fff; border: 1px solid rgba(255,255,255,0.25); border-radius: 6px; font-size: 11px; padding: 2px 6px;">
              <option value="ART-006">ART-006 (رائد الفضاء الذهبي)</option>
              <option value="ART-002">ART-002 (صندوق براغ)</option>
              <option value="ART-NEW">+ مجسم/تمثال جديد</option>
            </select>
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
            <button class="btn-live-angle" data-angle="front" style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); color: #fff; border-radius: 8px; padding: 5px 4px; font-size: 11px; font-weight: 600; cursor: pointer;">+ أمام</button>
            <button class="btn-live-angle" data-angle="left" style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); color: #fff; border-radius: 8px; padding: 5px 4px; font-size: 11px; font-weight: 600; cursor: pointer;">+ يسار</button>
            <button class="btn-live-angle" data-angle="right" style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); color: #fff; border-radius: 8px; padding: 5px 4px; font-size: 11px; font-weight: 600; cursor: pointer;">+ يمين</button>
            <button class="btn-live-angle" data-angle="wide" style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); color: #fff; border-radius: 8px; padding: 5px 4px; font-size: 11px; font-weight: 600; cursor: pointer;">+ شامل</button>
          </div>
          <button id="btn-auto-sweep-360" style="width: 100%; background: linear-gradient(90deg, rgba(0, 242, 254, 0.22), rgba(10, 132, 255, 0.28)); border: 1px solid rgba(0, 242, 254, 0.55); color: #00f2fe; border-radius: 9px; padding: 6px 8px; font-size: 11px; font-weight: 700; cursor: pointer;">
            🔄 مسح 360° تلقائي (6 ثوانٍ — التقط أثناء الدوران حول المجسم)
          </button>
        </div>

        <div id="inspector-body" class="inspector-body">
          <div class="inspector-field-row">
            <span class="field-lbl">القطعة / الزاوية:</span>
            <span id="inspector-artifact-id" class="field-val">—</span>
          </div>

          <div class="inspector-score-section">
            <div class="score-labels">
              <span>نسبة المطابقة: <strong id="inspector-score-val">0.0%</strong></span>
              <span>الحد الأدنى: <strong id="inspector-threshold-val">60%</strong></span>
            </div>
            <div class="meter-bar-track">
              <div id="inspector-score-bar" class="meter-bar-fill" style="width: 0%;"></div>
              <div id="inspector-threshold-line" class="meter-threshold-marker" style="left: 60%;"></div>
            </div>
          </div>

          <div class="threshold-slider-group">
            <div class="slider-label-row">
              <label for="threshold-slider">حساسية التعرف (Threshold):</label>
              <span id="threshold-slider-label">0.60</span>
            </div>
            <input type="range" id="threshold-slider" min="0.45" max="0.95" step="0.01" value="0.60" class="styled-slider" />
          </div>

          <div class="candidates-ranking-group">
            <div class="ranking-title">أفضل المرشحين (3D Masked Multi-Angle):</div>
            <div id="inspector-candidates-list" class="candidates-list">
              <div class="candidate-item empty">جاري تحليل المشهد...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const slider = this.container.querySelector('#threshold-slider');
    const sliderLbl = this.container.querySelector('#threshold-slider-label');
    const thresholdLine = this.container.querySelector('#inspector-threshold-line');
    const thresholdVal = this.container.querySelector('#inspector-threshold-val');

    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      sliderLbl.textContent = val.toFixed(2);
      thresholdVal.textContent = `${Math.round(val * 100)}%`;
      thresholdLine.style.left = `${Math.round(val * 100)}%`;
      if (this.onThresholdChange) {
        this.onThresholdChange(val);
      }
    });

    const btnToggle = this.container.querySelector('#btn-inspector-toggle');
    const body = this.container.querySelector('#inspector-body');
    btnToggle.addEventListener('click', () => {
      this.isCollapsed = !this.isCollapsed;
      body.style.display = this.isCollapsed ? 'none' : 'flex';
      btnToggle.textContent = this.isCollapsed ? '▸' : '▾';
    });

    const targetSelect = this.container.querySelector('#live-teach-target');
    const resolveTarget = () => {
      let targetId = targetSelect.value;
      let targetTitle = 'مجسم رائد الفضاء الذهبي (Golden Astronaut 3D Statue)';
      if (targetId === 'ART-002') {
        targetTitle = 'صندوق تحفة براغ (Prague Wooden Souvenir Box)';
      } else if (targetId === 'ART-NEW') {
        const customName = prompt('أدخل اسم المجسم أو التمثال الجديد:', 'تمثال ميداني متعدد الزوايا');
        if (!customName) return null;
        targetId = 'ART-CUSTOM-3D';
        targetTitle = customName;
      }
      return { targetId, targetTitle };
    };

    const angleBtns = this.container.querySelectorAll('.btn-live-angle');
    angleBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!this.onLiveCaptureAngle) return;
        const resolved = resolveTarget();
        if (!resolved) return;
        const angle = btn.getAttribute('data-angle');
        const origText = btn.textContent;
        btn.textContent = '⏳...';
        btn.disabled = true;
        try {
          await this.onLiveCaptureAngle(resolved.targetId, resolved.targetTitle, angle);
          btn.textContent = '✓ تم!';
          btn.style.borderColor = '#00f2fe';
          btn.style.color = '#00f2fe';
          setTimeout(() => {
            btn.textContent = origText;
            btn.disabled = false;
          }, 1200);
        } catch (err) {
          alert('خطأ أثناء التقاط الزاوية: ' + err.message);
          btn.textContent = origText;
          btn.disabled = false;
        }
      });
    });

    const btnSweep = this.container.querySelector('#btn-auto-sweep-360');
    btnSweep?.addEventListener('click', async () => {
      if (!this.onAutoSweep360) return;
      const resolved = resolveTarget();
      if (!resolved) return;
      const origText = btnSweep.textContent;
      btnSweep.disabled = true;
      try {
        const res = await this.onAutoSweep360(resolved.targetId, resolved.targetTitle, ({ pct, captured, maxKeyframes }) => {
          btnSweep.textContent = `🔄 جاري الدوران... ${pct}% (${captured}/${maxKeyframes} لقطات)`;
        });
        btnSweep.textContent = `✓ تم تسجيل ${res.capturedKeyframes} زوايا مختلفة بنجاح!`;
        setTimeout(() => {
          btnSweep.textContent = origText;
          btnSweep.disabled = false;
        }, 2000);
      } catch (err) {
        alert('خطأ أثناء المسح 360°: ' + err.message);
        btnSweep.textContent = origText;
        btnSweep.disabled = false;
      }
    });
  }

  update(report) {
    if (!report) return;

    const badge = this.container.querySelector('#inspector-status-badge');
    const artIdElem = this.container.querySelector('#inspector-artifact-id');
    const scoreVal = this.container.querySelector('#inspector-score-val');
    const scoreBar = this.container.querySelector('#inspector-score-bar');
    const candidatesList = this.container.querySelector('#inspector-candidates-list');

    const isRecognized = report.recognized;
    const best = report.bestCandidate;

    if (isRecognized && best) {
      badge.className = 'status-badge recognized';
      badge.querySelector('.status-icon').textContent = '✓';
      badge.querySelector('.status-text').textContent = `تم التعرف: ${best.title} [${(best.matchedView || 'FRONT').toUpperCase()}]`;
      artIdElem.textContent = `${best.id} • زاوية ${(best.matchedView || 'front').toUpperCase()} (${report.topScore}%)`;
    } else {
      badge.className = 'status-badge unknown';
      badge.querySelector('.status-icon').textContent = '🔍';
      badge.querySelector('.status-text').textContent = best
        ? `أقرب تطابق: ${best.id} [${best.matchedView}] (${report.topScore}% | خلفية ${report.negativeScore || 0}%)`
        : 'وجّه الكاميرا نحو المجسم من أي زاوية';
      artIdElem.textContent = best ? `${best.id} (${report.topScore}% < ${report.threshold}%)` : 'لا يوجد تطابق';
    }

    scoreVal.textContent = `${report.topScore}%`;
    scoreBar.style.width = `${Math.min(100, Math.max(0, report.topScore))}%`;
    scoreBar.style.backgroundColor = isRecognized ? '#00f2fe' : '#ff9f0a';

    if (report.candidates && report.candidates.length > 0) {
      candidatesList.innerHTML = report.candidates.map((c, idx) => `
        <div class="candidate-row ${idx === 0 && isRecognized ? 'active-match' : ''}">
          <div class="cand-info">
            <span class="cand-rank">#${idx + 1}</span>
            <span class="cand-title">${c.id} (${c.title})</span>
            <span class="cand-view">[${c.matchedView}]</span>
          </div>
          <div class="cand-score">${c.similarity}%</div>
        </div>
      `).join('');
    }
  }
}
