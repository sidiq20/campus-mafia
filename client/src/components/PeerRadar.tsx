"use client";

import { useEffect, useRef, useState } from 'react';
import { p2pManager, PeerPosition } from '@/lib/offline';
import { MapPin, Radio } from 'lucide-react';

export default function PeerRadar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [blips, setBlips] = useState<{ username: string; appearAt: number }[]>([]);

  const myPos = p2pManager.getMyPosition();
  const peers = p2pManager.getPeerPositions();

  // Track new peer appearances for blip animation
  useEffect(() => {
    setBlips(prev => {
      const current = new Set(prev.map(b => b.username));
      const newBlips = peers
        .filter(p => !current.has(p.username))
        .map(p => ({ username: p.username, appearAt: Date.now() }));
      // Keep existing blips if they appeared recently (< 2s ago) so they animate out
      const existing = prev.filter(b => Date.now() - b.appearAt < 2000);
      return [...existing, ...newBlips];
    });
  }, [peers.length]);

  // Draw the radar with continuous animation via requestAnimationFrame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;

    let drawing = true;

    const draw = () => {
      if (!drawing) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const cx = cw / 2;
      const cy = ch / 2;
      const radius = Math.min(cw, ch) / 2 - 8;

      ctx.clearRect(0, 0, cw, ch);
      const now = Date.now();

      // ─── Grid / Hex dots background ───
      ctx.fillStyle = 'rgba(34, 197, 94, 0.03)';
      for (let x = 0; x < cw; x += 12) {
        for (let y = 0; y < ch; y += 12) {
          ctx.beginPath();
          ctx.arc(x, y, 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ─── Radar rings ───
      for (let i = 1; i <= 4; i++) {
        const rr = (radius / 4) * i;
        const pulse = 0.08 + 0.04 * Math.sin(now / 1500 + i);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34, 197, 94, ${pulse})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // ─── Crosshairs ───
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.04)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // ─── Sweep beam with gradient trail ───
      const sweepAngle = (now / 4000) * Math.PI * 2;
      const sweepWidth = 0.6; // radians

      // Gradient sweep wedge
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, 'rgba(34, 197, 94, 0.12)');
      gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.04)');
      gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, sweepAngle - sweepWidth, sweepAngle);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Sweep leading edge (bright line)
      const edgeGlow = ctx.createRadialGradient(
        cx + Math.cos(sweepAngle) * radius * 0.3, cy + Math.sin(sweepAngle) * radius * 0.3, 0,
        cx + Math.cos(sweepAngle) * radius, cy + Math.sin(sweepAngle) * radius, radius * 0.15
      );
      edgeGlow.addColorStop(0, 'rgba(34, 197, 94, 0.15)');
      edgeGlow.addColorStop(1, 'rgba(34, 197, 94, 0)');

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(sweepAngle) * radius,
        cy + Math.sin(sweepAngle) * radius
      );
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(34, 197, 94, 0.3)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ─── Self dot at center ───
      const selfPulse = 0.8 + 0.2 * Math.sin(now / 600);

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(34, 197, 94, ${0.08 * selfPulse})`;
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.shadowColor = 'rgba(34, 197, 94, 0.6)';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('YOU', cx, cy + 14);

      // ─── Draw peer positions with blip effects ───
      const activeBlips = blips.filter(b => Date.now() - b.appearAt < 2000);

      peers.forEach(peer => {
        const blipEntry = activeBlips.find(b => b.username === peer.username);
        const blipAge = blipEntry ? (Date.now() - blipEntry.appearAt) / 2000 : 1;
        const blipScale = blipEntry ? Math.min(blipAge * 3, 1) : 1; // grow from 0 to 1

        let px: number, py: number, norm: number;

        if (myPos) {
          const dLat = peer.lat - myPos.lat;
          const dLng = peer.lng - myPos.lng;
          const dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
          const maxDist = Math.max(dist * 1.5, 100);
          norm = Math.min(dist / maxDist, 1) * radius * 0.85;
          const angle = Math.atan2(dLat, dLng);
          px = cx + Math.cos(angle) * norm;
          py = cy + Math.sin(angle) * norm;
        } else {
          const i = peers.indexOf(peer);
          const angle = (i / peers.length) * Math.PI * 2;
          norm = radius * (0.3 + (peer.username.charCodeAt(0) % 40) / 100);
          px = cx + Math.cos(angle) * norm;
          py = cy + Math.sin(angle) * norm;
        }

        // Blip expanding ring (appear animation)
        if (blipEntry && blipScale < 1) {
          ctx.beginPath();
          ctx.arc(px, py, 8 * (1 - blipScale * 0.7), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(168, 85, 247, ${0.6 * (1 - blipScale)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Flash
          ctx.beginPath();
          ctx.arc(px, py, 16 * (1 - blipScale), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(168, 85, 247, ${0.3 * (1 - blipScale)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // Peer dot with pulse
        const dotPulse = blipEntry && blipScale < 1
          ? blipScale
          : 0.7 + 0.3 * Math.sin(now / 800 + peers.indexOf(peer));

        ctx.beginPath();
        ctx.arc(px, py, 3 * Math.max(0.3, dotPulse), 0, Math.PI * 2);
        ctx.fillStyle = '#a855f7';
        ctx.shadowColor = 'rgba(168, 85, 247, 0.4)';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = '#a855f7';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`@${peer.username.slice(0, 10)}`, px, py + 12);

        // Distance
        if (myPos) {
          const dLat = peer.lat - myPos.lat;
          const dLng = peer.lng - myPos.lng;
          const distMeters = Math.round(Math.sqrt(dLat * dLat + dLng * dLng) * 111000);
          ctx.fillStyle = 'rgba(168, 85, 247, 0.5)';
          ctx.font = '6px monospace';
          ctx.fillText(
            distMeters > 1000 ? `${(distMeters / 1000).toFixed(1)}km` : `${distMeters}m`,
            px, py + 20
          );
        }
      });

      // ─── Scan status text ───
      const scanText = peers.length > 0 ? 'CONTACT' : 'SCANNING';
      const textGlow = 0.5 + 0.5 * Math.sin(now / 1000);

      ctx.fillStyle = peers.length > 0
        ? `rgba(34, 197, 94, ${0.2 + 0.1 * textGlow})`
        : 'rgba(234, 179, 8, 0.15)';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(scanText, cx, 16);

      // Draw a small blip indicator when contacts
      if (peers.length > 0) {
        for (let i = 0; i < Math.min(peers.length, 3); i++) {
          const bx = cx - 6 + i * 6;
          ctx.beginPath();
          ctx.arc(bx, 22, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(34, 197, 94, ${0.3 + 0.3 * Math.sin(now / 700 + i * 1.5)})`;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (drawing) {
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
      }
    });
    ro.observe(canvas);

    return () => {
      drawing = false;
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [peers, myPos, blips]);

  return (
    <div className="border border-zinc-800 bg-zinc-900/30 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Radio size={12} className="text-green-400" />
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Local Radar</span>
        <span className="text-[8px] text-zinc-700 ml-auto flex items-center gap-1.5">
          {peers.length > 0 ? (
            <>
              <span className="relative w-1.5 h-1.5">
                <span className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-60" />
                <span className="absolute inset-0 bg-green-500 rounded-full" />
              </span>
              {peers.length} peer{peers.length !== 1 ? 's' : ''}
            </>
          ) : (
            <span className="text-yellow-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-600 animate-pulse inline-block" />
              Scanning...
            </span>
          )}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-48 rounded-md cursor-crosshair"
        style={{ maxWidth: '320px', margin: '0 auto' }}
      />
      <div className="flex items-center gap-3 mt-2 text-[8px] text-zinc-700 justify-center">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block shadow-[0_0_4px_rgba(34,197,94,0.5)]" /> You
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-purple-500 inline-block shadow-[0_0_4px_rgba(168,85,247,0.5)]" /> Peer
        </span>
        {myPos ? (
          <span className="text-green-700">GPS active</span>
        ) : (
          <span className="text-yellow-700 animate-pulse">GPS off — scanning</span>
        )}
      </div>
    </div>
  );
}
