"use client";

import { useEffect, useRef } from 'react';

type Props = {
  active?: boolean;
  peerCount?: number;
  size?: 'sm' | 'md' | 'lg';
};

export default function P2PScanAnimation({ active = true, peerCount = 0, size = 'sm' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const dims = { sm: 40, md: 56, lg: 80 }[size];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims * dpr;
    canvas.height = dims * dpr;
    ctx.scale(dpr, dpr);

    let start = Date.now();

    const draw = () => {
      const elapsed = (Date.now() - start) / 1000;
      const c = dims / 2;
      const maxR = dims / 2 - 2;

      ctx.clearRect(0, 0, dims, dims);

      if (!active) {
        // Idle state — dim static circle
        ctx.beginPath();
        ctx.arc(c, c, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
        ctx.fill();
        return;
      }

      // Expanding rings (pulse outward)
      for (let i = 0; i < 3; i++) {
        const phase = (elapsed * 0.8 + i * 0.8) % 2;
        const r = phase * maxR;
        const alpha = Math.max(0, 1 - phase);

        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34, 197, 94, ${alpha * 0.3})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Scan line rotating
      const angle = elapsed * 1.5;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, maxR, angle - 0.4, angle);
      ctx.closePath();
      ctx.fillStyle = 'rgba(34, 197, 94, 0.06)';
      ctx.fill();

      // Leading edge
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(angle) * maxR, c + Math.sin(angle) * maxR);
      ctx.strokeStyle = `rgba(34, 197, 94, ${active ? 0.5 : 0.1})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(c, c, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = peerCount > 0 ? '#22c55e' : 'rgba(34, 197, 94, 0.5)';
      ctx.fill();

      // Peer count pulses
      if (peerCount > 0) {
        const pulse = 0.6 + 0.4 * Math.sin(elapsed * 3);
        ctx.beginPath();
        ctx.arc(c, c, 5 + 3 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34, 197, 94, ${0.15 * pulse})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [active, peerCount, dims]);

  return (
    <canvas
      ref={canvasRef}
      className="shrink-0"
      style={{ width: dims, height: dims }}
    />
  );
}
