"use client";

import { useQuery } from '@tanstack/react-query';
import { Zap, Infinity, TrendingUp } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type DailyInfStats = {
  daily_earned: number;
  daily_cap: number;
  remaining: number;
  has_bypass: boolean;
};

export function DailyInfTracker() {
  const { data: stats, isLoading } = useQuery<DailyInfStats>({
    queryKey: ['daily-inf-stats'],
    queryFn: async () => {
      const res = await apiFetch('/api/inf/daily-stats');
      if (!res.ok) throw new Error('Failed to load daily stats');
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 30_000,
  });

  if (isLoading || !stats) return null;

  const { daily_earned, daily_cap, remaining, has_bypass } = stats;
  const isUnlimited = has_bypass || daily_cap === 2147483647;
  const progress = isUnlimited ? 0 : Math.min(100, (daily_earned / daily_cap) * 100);

  return (
    <div className={`p-4 rounded-lg border transition-all ${
      has_bypass
        ? 'border-yellow-500/40 bg-yellow-500/10'
        : remaining <= 50
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-zinc-800 bg-black/40'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap size={14} className={has_bypass ? 'text-yellow-400' : 'text-zinc-400'} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Daily INF Grind
          </span>
        </div>
        {has_bypass && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-400 uppercase tracking-widest">
            <Infinity size={12} />
            Unlimited
          </span>
        )}
        {!has_bypass && (
          <span className={`text-[10px] font-bold font-mono ${
            remaining <= 50 ? 'text-red-400' : 'text-zinc-400'
          }`}>
            {remaining.toLocaleString()} remaining
          </span>
        )}
      </div>

      {!isUnlimited && (
        <div className="space-y-1">
          <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progress >= 90 ? 'bg-red-500' : progress >= 70 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
            <span>{daily_earned.toLocaleString()} INF earned</span>
            <span>{daily_cap.toLocaleString()} INF cap</span>
          </div>
        </div>
      )}

      {has_bypass && (
        <p className="text-[10px] text-yellow-500/70 mt-1">
          <TrendingUp size={10} className="inline mr-1" />
          Syndicate Pass active — grind without limits!
        </p>
      )}
    </div>
  );
}
