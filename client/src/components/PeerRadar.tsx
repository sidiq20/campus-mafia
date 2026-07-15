"use client";

import { useEffect, useRef } from 'react';
import { p2pManager, PeerPosition } from '@/lib/offline';
import { MapPin } from 'lucide-react';

export default function PeerRadar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const myPos = p2pManager.getMyPosition();
  const peers = p2pManager.getPeerPositions();

  // Draw the radar map (runs on every render — parent's polling drives updates)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width = canvas.clientWidth * dpr;
    const h = canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const cx = cw / 2;
    const cy = ch / 2;
    const radius = Math.min(cw, ch) / 2 - 8;

    ctx.clearRect(0, 0, cw, ch);

    // Radar rings
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (radius / 3) * i, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(34, 197, 94, ${0.08 + i * 0.04})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Radar sweep (animated via time)
    const sweepAngle = (Date.now() / 3000) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, sweepAngle - 0.3, sweepAngle);
    ctx.closePath();
    ctx.fillStyle = 'rgba(34, 197, 94, 0.04)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(sweepAngle) * radius,
      cy + Math.sin(sweepAngle) * radius
    );
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Self dot at center
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YOU', cx, cy + 14);

    // Draw peer positions
    if (myPos && peers.length > 0) {
      peers.forEach(peer => {
        const dLat = peer.lat - myPos.lat;
        const dLng = peer.lng - myPos.lng;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
        const maxDist = Math.max(dist * 1.5, 100);
        const norm = Math.min(dist / maxDist, 1) * radius * 0.85;
        const angle = Math.atan2(dLat, dLng);
        const px = cx + Math.cos(angle) * norm;
        const py = cy + Math.sin(angle) * norm;

        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#a855f7';
        ctx.fill();
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#a855f7';
        ctx.font = '7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`@${peer.username.slice(0, 10)}`, px, py + 12);

        const distMeters = Math.round(dist);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.5)';
        ctx.font = '6px monospace';
        ctx.fillText(distMeters > 1000 ? `${(distMeters / 1000).toFixed(1)}km` : `${distMeters}m`, px, py + 20);
      });
    } else if (peers.length > 0) {
      peers.forEach((peer, i) => {
        const angle = (i / peers.length) * Math.PI * 2;
        const dist = radius * (0.3 + (peer.username.charCodeAt(0) % 40) / 100);
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;

        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#a855f7';
        ctx.fill();
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#a855f7';
        ctx.font = '7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`@${peer.username.slice(0, 10)}`, px, py + 12);
      });
    }
  });

  if (peers.length === 0 && !myPos) {
    return (
      <div className="border border-zinc-800 bg-zinc-900/30 rounded-lg p-4 text-center">
        <MapPin size={20} className="text-zinc-700 mx-auto mb-2" />
        <p className="text-[10px] text-zinc-600">No peer locations available</p>
        <p className="text-[8px] text-zinc-700 mt-1">Grant location access to see peers on radar</p>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 bg-zinc-900/30 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <MapPin size={12} className="text-green-400" />
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Local Radar</span>
        <span className="text-[8px] text-zinc-700 ml-auto">
          {peers.length} peer{peers.length !== 1 ? 's' : ''}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-40 rounded-md cursor-crosshair"
        style={{ maxWidth: '300px', margin: '0 auto' }}
      />
      <div className="flex items-center gap-3 mt-2 text-[8px] text-zinc-700 justify-center">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> You
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> Peer
        </span>
        {myPos && <span className="text-zinc-800">GPS active</span>}
        {!myPos && <span className="text-yellow-700">GPS off</span>}
      </div>
    </div>
  );
}
