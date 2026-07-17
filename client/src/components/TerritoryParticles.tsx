"use client";

import { useEffect, useRef, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  hue: number;
  pulse: number;
  pulseSpeed: number;
  life: number;
  maxLife: number;
  shape: 'circle' | 'diamond' | 'dot';
}

interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
  speed: number;
  phase: number;
}

function hexToHue(hex: string): number {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else {
    return 110; // fallback to green
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 110;
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  return hue;
}

export default function TerritoryParticles({ className = '', factionColor }: { className?: string; factionColor?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const gridLinesRef = useRef<GridLine[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const baseHueRef = useRef(hexToHue(factionColor || ''));

  // Track when faction color changes — particles adopt the new hue gradually as they die and respawn
  useEffect(() => {
    baseHueRef.current = hexToHue(factionColor || '');
  }, [factionColor]);

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = [];
    const count = Math.min(60, Math.floor((width * height) / 15000));
    const baseHue = baseHueRef.current;

    for (let i = 0; i < count; i++) {
      const maxLife = 300 + Math.random() * 400;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 1 + Math.random() * 2.5,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3 - 0.1,
        opacity: 0.1 + Math.random() * 0.5,
        hue: baseHue + (Math.random() - 0.5) * 40, // spread around faction color
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.01 + Math.random() * 0.03,
        life: Math.random() * maxLife,
        maxLife,
        shape: Math.random() > 0.6 ? (Math.random() > 0.5 ? 'diamond' : 'dot') : 'circle',
      });
    }
    particlesRef.current = particles;

    // Grid scanlines
    const lines: GridLine[] = [];
    const lineCount = 12;
    for (let i = 0; i < lineCount; i++) {
      const horizontal = Math.random() > 0.5;
      lines.push({
        x1: horizontal ? 0 : Math.random() * width,
        y1: horizontal ? Math.random() * height : 0,
        x2: horizontal ? width : Math.random() * width,
        y2: horizontal ? Math.random() * height : height,
        opacity: 0.03 + Math.random() * 0.06,
        speed: 0.2 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
      });
    }
    gridLinesRef.current = lines;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
      initParticles(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    window.addEventListener('mousemove', handleMouse);

    const animate = () => {
      frameRef.current++;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const baseHue = baseHueRef.current;

      // ─── Scanline grid ───
      ctx.strokeStyle = `hsla(${baseHue}, 100%, 25%, 0.04)`;
      ctx.lineWidth = 0.5;
      const gridSize = 40;
      const offset = (frameRef.current * 0.3) % gridSize;
      for (let x = offset; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = offset; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // ─── Grid lines ───
      gridLinesRef.current.forEach(line => {
        const pulse = Math.sin(frameRef.current * line.speed * 0.01 + line.phase) * 0.5 + 0.5;
        ctx.strokeStyle = `hsla(${baseHue}, 80%, 30%, ${line.opacity * pulse})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      });

      // ─── Particles ───
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.pulse += p.pulseSpeed;

        // Mouse interaction
        const dx = mouseRef.current.x * w - p.x;
        const dy = mouseRef.current.y * h - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const force = (120 - dist) / 120 * 0.5;
          p.speedX -= (dx / dist) * force * 0.02;
          p.speedY -= (dy / dist) * force * 0.02;
        }

        // Damping
        p.speedX *= 0.995;
        p.speedY *= 0.995;

        p.x += p.speedX;
        p.y += p.speedY;

        // Wrap around edges
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        // Reset particle when it "dies"
        if (p.life > p.maxLife) {
          p.life = 0;
          p.x = Math.random() * w;
          p.y = Math.random() * h;
          p.maxLife = 300 + Math.random() * 400;
          // Use current faction hue when respawning
          p.hue = baseHue + (Math.random() - 0.5) * 40;
        }

        const lifeRatio = 1 - Math.abs(p.life / p.maxLife - 0.5) * 2;
        const pulseGlow = Math.sin(p.pulse) * 0.3 + 0.7;
        const alpha = p.opacity * lifeRatio * pulseGlow;

        ctx.save();

        if (p.shape === 'diamond') {
          ctx.translate(p.x, p.y);
          ctx.rotate(frameRef.current * 0.005);
          ctx.fillStyle = `hsla(${p.hue}, 70%, 60%, ${alpha * 0.6})`;
          ctx.strokeStyle = `hsla(${p.hue}, 80%, 70%, ${alpha * 0.3})`;
          ctx.lineWidth = 0.5;
          const s = p.size * 1.5;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s, 0);
          ctx.lineTo(0, s);
          ctx.lineTo(-s, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (p.shape === 'dot') {
          ctx.fillStyle = `hsla(${p.hue}, 60%, 70%, ${alpha * 0.4})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 1.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Circle with glow (layered simple fills instead of RadialGradient for perf)
          const r = p.size * 3;
          // Outer glow
          ctx.fillStyle = `hsla(${p.hue}, 60%, 50%, ${alpha * 0.08})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          // Mid glow
          ctx.fillStyle = `hsla(${p.hue}, 70%, 60%, ${alpha * 0.2})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.6, 0, Math.PI * 2);
          ctx.fill();
          // Core
          ctx.fillStyle = `hsla(${p.hue}, 90%, 80%, ${alpha * 0.7})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      // ─── Connection lines between nearby particles ───
      ctx.lineWidth = 0.3;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            const alpha = (1 - dist / 100) * 0.2;
            ctx.strokeStyle = `hsla(${(a.hue + b.hue) / 2}, 60%, 60%, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouse);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none z-0 ${className}`}
      aria-hidden="true"
    />
  );
}
