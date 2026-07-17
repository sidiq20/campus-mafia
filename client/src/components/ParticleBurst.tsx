"use client";

import { useEffect, useRef, useCallback, useState } from 'react';

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;
  opacity: number;
  life: number;
  maxLife: number;
  decay: number;
  trail: { x: number; y: number; opacity: number }[];
  shape: 'circle' | 'spark' | 'ring';
}

interface BurstEvent {
  x: number;
  y: number;
  intensity: 'subtle' | 'normal' | 'intense';
  type: 'attack' | 'capture' | 'raid' | 'nuke';
}

const INTENSITY_CONFIG = {
  subtle:  { count: 15,  speed: 2,   size: 1.5, life: 600, hueRange: 20 },
  normal:  { count: 35,  speed: 3.5, size: 2.5, life: 900, hueRange: 40 },
  intense: { count: 60,  speed: 5,   size: 3.5, life: 1200, hueRange: 60 },
};

const TYPE_COLORS: Record<string, { baseHue: number }> = {
  attack:  { baseHue: 0 },    // red
  capture: { baseHue: 40 },   // amber/gold
  raid:    { baseHue: 30 },   // orange
  nuke:    { baseHue: 140 },  // green
};

export default function ParticleBurst({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<BurstParticle[]>([]);
  const animFrameRef = useRef<number>(0);
  const [burstKey, setBurstKey] = useState(0);

  const spawnBurst = useCallback((event: BurstEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = event.x * w;
    const cy = event.y * h;
    const config = INTENSITY_CONFIG[event.intensity];
    const colorInfo = TYPE_COLORS[event.type] || TYPE_COLORS.attack;
    const particles: BurstParticle[] = [];

    for (let i = 0; i < config.count; i++) {
      const angle = (Math.PI * 2 * i) / config.count + (Math.random() - 0.5) * 0.5;
      const speed = config.speed * (0.5 + Math.random() * 1.0);
      const hueOffset = (Math.random() - 0.5) * config.hueRange;
      const maxLife = config.life * (0.4 + Math.random() * 0.6);
      const isRing = i % 5 === 0;

      particles.push({
        x: cx + (Math.random() - 0.5) * 4,
        y: cy + (Math.random() - 0.5) * 4,
        vx: Math.cos(angle) * speed * (isRing ? 1.4 : 1),
        vy: Math.sin(angle) * speed * (isRing ? 1.4 : 1),
        size: isRing ? config.size * 0.5 : config.size * (0.3 + Math.random() * 0.7),
        hue: colorInfo.baseHue + hueOffset,
        opacity: 0.7 + Math.random() * 0.3,
        life: 0,
        maxLife,
        decay: 0.008 + Math.random() * 0.012,
        trail: [],
        shape: isRing ? 'ring' : Math.random() > 0.7 ? 'spark' : 'circle',
      });
    }

    particlesRef.current = particles;
    setBurstKey(k => k + 1);
  }, []);

  // Listen for custom events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as BurstEvent;
      if (detail) spawnBurst(detail);
    };
    window.addEventListener('territory-burst', handler);
    return () => window.removeEventListener('territory-burst', handler);
  }, [spawnBurst]);

  // Expose spawnBurst globally so DashboardLayout can call it
  useEffect(() => {
    (window as any).__territoryBurst = spawnBurst;
    return () => { delete (window as any).__territoryBurst; };
  }, [spawnBurst]);

  // ─── Canvas animation ───
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
    };
    resize();
    window.addEventListener('resize', resize);

    let running = true;

    const animate = () => {
      if (!running) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const particles = particlesRef.current;
      let alive = 0;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life++;

        if (p.life > p.maxLife) continue;
        alive++;

        // Store trail
        p.trail.push({ x: p.x, y: p.y, opacity: p.opacity });
        if (p.trail.length > 6) p.trail.shift();

        // Physics
        p.vx *= 0.97;
        p.vy += 0.015;
        p.x += p.vx;
        p.y += p.vy;

        // Fade
        const lifeProgress = p.life / p.maxLife;
        const opacity = Math.max(0, (1 - lifeProgress) * (1 - lifeProgress) * 0.8);
        const sizeDecay = 1 - lifeProgress * p.decay;
        const currentSize = p.size * Math.max(0.1, sizeDecay);

        // Draw trail
        for (let t = 0; t < p.trail.length; t++) {
          const trailAlpha = (t / p.trail.length) * opacity * 0.2;
          ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${trailAlpha})`;
          ctx.beginPath();
          ctx.arc(p.trail[t].x, p.trail[t].y, p.size * 0.3 * (t / p.trail.length), 0, Math.PI * 2);
          ctx.fill();
        }

        if (p.shape === 'ring') {
          ctx.strokeStyle = `hsla(${p.hue}, 90%, 65%, ${opacity * 0.5})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize * 3, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.shape === 'spark') {
          ctx.strokeStyle = `hsla(${p.hue}, 100%, 80%, ${opacity * 0.7})`;
          ctx.lineWidth = 1;
          const len = currentSize * 4;
          const angle = Math.atan2(p.vy, p.vx);
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(angle) * len, p.y - Math.sin(angle) * len);
          ctx.lineTo(p.x + Math.cos(angle) * len, p.y + Math.sin(angle) * len);
          ctx.stroke();
        } else {
          // Outer glow
          ctx.fillStyle = `hsla(${p.hue}, 70%, 55%, ${opacity * 0.1})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize * 4, 0, Math.PI * 2);
          ctx.fill();
          // Mid glow
          ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${opacity * 0.25})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize * 2, 0, Math.PI * 2);
          ctx.fill();
          // Core
          ctx.fillStyle = `hsla(${p.hue}, 100%, 90%, ${opacity * 0.9})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (alive > 0) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [burstKey]);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 pointer-events-none z-50 ${className}`}
      aria-hidden="true"
    />
  );
}
