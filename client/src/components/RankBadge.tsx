"use client";

import { Shield, ChevronUp } from 'lucide-react';
import type { RankInfo } from '@/contexts/UserContext';

const tierColors: Record<string, { bg: string; text: string; border: string; glow: string; bar: string }> = {
  Street:     { bg: 'bg-zinc-900',       text: 'text-zinc-400',   border: 'border-zinc-700',   glow: 'shadow-[0_0_8px_rgba(113,113,122,0.3)]',    bar: 'bg-zinc-500' },
  Bronze:     { bg: 'bg-amber-950',       text: 'text-amber-400',  border: 'border-amber-700',  glow: 'shadow-[0_0_8px_rgba(251,191,36,0.3)]',    bar: 'bg-amber-500' },
  Silver:     { bg: 'bg-slate-900',       text: 'text-slate-300',  border: 'border-slate-600',  glow: 'shadow-[0_0_8px_rgba(203,213,225,0.3)]',   bar: 'bg-slate-400' },
  Gold:       { bg: 'bg-yellow-950',      text: 'text-yellow-400', border: 'border-yellow-600', glow: 'shadow-[0_0_8px_rgba(250,204,21,0.4)]',    bar: 'bg-yellow-500' },
  Platinum:   { bg: 'bg-cyan-950',        text: 'text-cyan-300',   border: 'border-cyan-700',   glow: 'shadow-[0_0_8px_rgba(34,211,238,0.3)]',   bar: 'bg-cyan-400' },
  Diamond:    { bg: 'bg-blue-950',        text: 'text-blue-300',   border: 'border-blue-700',   glow: 'shadow-[0_0_8px_rgba(96,165,250,0.4)]',   bar: 'bg-blue-400' },
  Legendary:  { bg: 'bg-purple-950',      text: 'text-purple-400', border: 'border-purple-700', glow: 'shadow-[0_0_8px_rgba(192,132,252,0.4)]',  bar: 'bg-purple-500' },
  Mythic:     { bg: 'bg-red-950',         text: 'text-red-400',    border: 'border-red-700',    glow: 'shadow-[0_0_8px_rgba(248,113,113,0.4)]',  bar: 'bg-red-500' },
};

export function RankBadgeSmall({ rank }: { rank?: RankInfo }) {
  if (!rank || !rank.tier) return null;
  const c = tierColors[rank.tier] || tierColors.Street;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${c.bg} ${c.text} ${c.border} border ${c.glow}`}>
      <Shield size={10} className="shrink-0" />
      <span>{rank.tier} {rank.level}</span>
    </div>
  );
}

export function RankBadgeFull({ rank, influence }: { rank?: RankInfo; influence: number }) {
  if (!rank || !rank.tier) return null;
  const c = tierColors[rank.tier] || tierColors.Street;
  const isMaxRank = rank.next_min_influence === null;

  return (
    <div className={`inline-flex flex-col gap-1.5 p-3 rounded-lg border ${c.border} ${c.bg} ${c.glow} min-w-[200px]`}>
      {/* Header: Tier + Level */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={16} className={c.text} />
          <span className={`text-xs font-bold uppercase tracking-widest ${c.text}`}>
            {rank.tier} · Level {rank.level}
          </span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">#{rank.level}</span>
      </div>

      {/* Rank Name */}
      <p className={`text-lg font-extrabold tracking-tight ${c.text}`}>{rank.name}</p>

      {/* Progress Bar */}
      {isMaxRank ? (
        <div className="flex items-center gap-1 text-[10px] text-yellow-500 font-bold uppercase tracking-widest">
          <ChevronUp size={12} />
          MAX RANK ACHIEVED
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex justify-between text-[9px] font-mono text-zinc-500">
            <span>{rank.min_influence.toLocaleString()} INF</span>
            <span>{rank.next_min_influence!.toLocaleString()} INF</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-black/50 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${c.bar}`}
              style={{ width: `${(rank.progress * 100).toFixed(1)}%` }}
            />
          </div>
          <p className="text-[10px] text-zinc-500 text-right">
            {(rank.progress * 100).toFixed(0)}% to next rank
          </p>
        </div>
      )}
    </div>
  );
}

export function RankTierIcon({ tier, size = 16 }: { tier: string; size?: number }) {
  const c = tierColors[tier] || tierColors.Street;
  return <Shield size={size} className={c.text} />;
}
