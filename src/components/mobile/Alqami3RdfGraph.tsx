import React, { useEffect, useRef } from 'react';
import type { AlqamiArtifact } from '../../data/alqamiArtifacts';

interface GraphNode {
  id: string;
  label: string;
  group: 1 | 2 | 3; // 1: Resource (#0a84ff), 2: Literal (#ff9f0a), 3: Linked Entity (#30d158)
  x: number;
  y: number;
  radius: number;
}

interface GraphLink {
  source: GraphNode;
  target: GraphNode;
  predicate: string;
}

interface Alqami3RdfGraphProps {
  artifact: AlqamiArtifact;
  lang: 'ar' | 'en';
  lightTheme: boolean;
}

export const Alqami3RdfGraph: React.FC<Alqami3RdfGraphProps> = ({ artifact, lang, lightTheme }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    const width = parent ? parent.clientWidth : 340;
    const height = parent ? parent.clientHeight : 185;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.36;

    const trunc = (s: string, n = 18) => (s.length > n ? `${s.slice(0, n)}…` : s);

    const rawNodes: Array<{ id: string; label: string; group: 1 | 2 | 3; predicate?: string }> = [
      { id: 'root', label: trunc(lang === 'ar' ? artifact.title.ar : artifact.title.en, 16), group: 1 },
      { id: 'creator', label: trunc(lang === 'ar' ? artifact.creator.ar : artifact.creator.en), group: 3, predicate: 'dcterms:creator' },
      { id: 'institution', label: trunc(lang === 'ar' ? artifact.institution.ar : artifact.institution.en), group: 3, predicate: 'dcterms:publisher' },
      { id: 'category', label: trunc(lang === 'ar' ? artifact.categoryLabel.ar : artifact.categoryLabel.en), group: 3, predicate: 'rdf:type' },
      { id: 'period', label: trunc(lang === 'ar' ? artifact.period.ar : artifact.period.en), group: 2, predicate: 'dcterms:date' },
      { id: 'material', label: trunc(lang === 'ar' ? artifact.details.material.ar : artifact.details.material.en), group: 2, predicate: 'dcterms:medium' },
      { id: 'extent', label: trunc(artifact.details.dimensions || artifact.itemCode), group: 2, predicate: 'dcterms:extent' },
    ];

    const nodes: GraphNode[] = rawNodes.map((n, i) => {
      if (i === 0) {
        return { id: n.id, label: n.label, group: n.group, x: cx, y: cy, radius: 16 };
      }
      const angle = ((i - 1) / (rawNodes.length - 1)) * Math.PI * 2 - Math.PI / 2;
      const dist = n.group === 3 ? r * 0.85 : r * 1.05;
      return {
        id: n.id,
        label: n.label,
        group: n.group,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        radius: n.group === 3 ? 11 : 8,
      };
    });

    const rootNode = nodes[0];
    const links: GraphLink[] = rawNodes.slice(1).map((n, idx) => ({
      source: rootNode,
      target: nodes[idx + 1],
      predicate: n.predicate || 'rel',
    }));

    let dragNode: GraphNode | null = null;
    let rafId = 0;
    let tickCount = 0;

    const getPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      const p = getPos(e);
      for (const node of nodes) {
        if (Math.hypot(p.x - node.x, p.y - node.y) <= node.radius + 10) {
          dragNode = node;
          canvas.setPointerCapture(e.pointerId);
          break;
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragNode) return;
      const p = getPos(e);
      dragNode.x = Math.max(18, Math.min(width - 18, p.x));
      dragNode.y = Math.max(18, Math.min(height - 18, p.y));
    };
    const onUp = () => {
      dragNode = null;
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    const colors: Record<1 | 2 | 3, string> = {
      1: '#0a84ff',
      2: '#ff9f0a',
      3: '#30d158',
    };

    const draw = () => {
      if (tickCount < 60 && !dragNode) {
        tickCount++;
        for (let i = 1; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const d = Math.hypot(dx, dy) || 1;
            if (d < 85) {
              const push = (85 - d) * 0.04;
              nodes[i].x -= (dx / d) * push;
              nodes[i].y -= (dy / d) * push;
              nodes[j].x += (dx / d) * push;
              nodes[j].y += (dy / d) * push;
            }
          }
          nodes[i].x = Math.max(24, Math.min(width - 24, nodes[i].x));
          nodes[i].y = Math.max(20, Math.min(height - 20, nodes[i].y));
        }
      }

      ctx.clearRect(0, 0, width, height);

      // Links
      ctx.lineWidth = 1;
      for (const link of links) {
        ctx.strokeStyle = lightTheme ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.stroke();

        const mx = (link.source.x + link.target.x) / 2;
        const my = (link.source.y + link.target.y) / 2;
        ctx.fillStyle = lightTheme ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(link.predicate.replace(/^[^:]+:/, ''), mx, my - 3);
      }

      // Nodes
      for (const node of nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = colors[node.group];
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = lightTheme ? '#1d1d1f' : '#ffffff';
        ctx.font = node.group === 1 ? '600 10.5px Inter, sans-serif' : '500 9.5px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + node.radius + 11);
      }

      rafId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [artifact, lang, lightTheme]);

  return (
    <div>
      <div className="a3m-graph-wrap">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      </div>
      <div className="a3m-graph-legend">
        <div className="a3m-legend-item">
          <span className="a3m-dot" style={{ background: '#0a84ff' }} />
          <span>{lang === 'ar' ? 'المورد' : 'Resource'}</span>
        </div>
        <div className="a3m-legend-item">
          <span className="a3m-dot" style={{ background: '#30d158' }} />
          <span>{lang === 'ar' ? 'كيان مرتبط' : 'Linked Entity'}</span>
        </div>
        <div className="a3m-legend-item">
          <span className="a3m-dot" style={{ background: '#ff9f0a' }} />
          <span>{lang === 'ar' ? 'خاصية نصية' : 'Literal'}</span>
        </div>
      </div>
    </div>
  );
};
