"use client";

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Radio, Ban, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

type RateLimitStatus = {
  used: number;
  max: number;
  banned_until: string | null;
  window_reset: string;
};

export function BroadcastCooldown() {
  const [banCountdown, setBanCountdown] = useState<string | null>(null);
  const [windowCountdown, setWindowCountdown] = useState<string | null>(null);

  const { data: status } = useQuery<RateLimitStatus>({
    queryKey: ['rate-limit-status'],
    queryFn: async () => {
      const res = await apiFetch('/api/rate-limit/status');
      if (!res.ok) throw new Error('Failed to fetch rate limit');
      return res.json();
    },
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  // Live countdown timer
  useEffect(() => {
    if (!status) return;

    const update = () => {
      const now = Date.now();

      if (status.banned_until) {
        const remaining = new Date(status.banned_until).getTime() - now;
        if (remaining <= 0) {
          setBanCountdown(null);
        } else {
          const mins = Math.floor(remaining / 60000);
          const secs = Math.floor((remaining % 60000) / 1000);
          setBanCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
        }
      } else {
        setBanCountdown(null);
      }

      // Window reset countdown
      const resetMs = new Date(status.window_reset).getTime() - now;
      if (resetMs > 0 && resetMs <= 60000) {
        const secs = Math.ceil(resetMs / 1000);
        setWindowCountdown(`reset ${secs}s`);
      } else {
        setWindowCountdown(null);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (!status) return null;

  const remaining = status.max - status.used;

  // Banned state — show red countdown
  if (status.banned_until && banCountdown) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/15 border border-red-500/30 text-[10px] font-bold text-red-400 uppercase tracking-widest animate-pulse">
        <Ban size={12} />
        <span>Banned {banCountdown}</span>
      </div>
    );
  }

  // Warn when only 1 remaining
  if (remaining <= 1) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/15 border border-yellow-500/30 text-[10px] font-bold text-yellow-400 uppercase tracking-widest">
        <AlertTriangle size={12} />
        <span>{remaining}/{status.max}</span>
        {windowCountdown && <span className="text-[8px] text-yellow-500/70">({windowCountdown})</span>}
      </div>
    );
  }

  // Safe state
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 border border-green-500/20 text-[10px] font-bold text-green-500/70 uppercase tracking-widest">
      <Radio size={12} />
      <span>{remaining}/{status.max}</span>
    </div>
  );
}
