"use client";

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { Skull, MessageSquare, Users, MapIcon, Shield, TrendingUp } from 'lucide-react';

type LiveStatsData = {
  total_operatives: number;
  operatives_online: number;
  total_posts: number;
  territories_controlled: number;
  total_factions: number;
  total_influence_circulating: number;
};

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ref.current) clearInterval(ref.current);
    const steps = 20;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    ref.current = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplay(current);
      if (step >= steps) {
        if (ref.current) clearInterval(ref.current);
      }
    }, 40);

    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [value]);

  return <span>{display.toLocaleString()}{suffix}</span>;
}

const statCards = [
  {
    key: 'operatives_online' as const,
    icon: Users,
    label: 'Online Now',
    color: 'text-green-400',
    bg: 'border-green-500/30',
    suffix: '',
  },
  {
    key: 'total_operatives' as const,
    icon: Users,
    label: 'Total Operatives',
    color: 'text-blue-400',
    bg: 'border-blue-500/30',
    suffix: '',
  },
  {
    key: 'total_posts' as const,
    icon: MessageSquare,
    label: 'Intel Broadcasts',
    color: 'text-purple-400',
    bg: 'border-purple-500/30',
    suffix: '',
  },
  {
    key: 'territories_controlled' as const,
    icon: MapIcon,
    label: 'Zones Held',
    color: 'text-orange-400',
    bg: 'border-orange-500/30',
    suffix: '',
  },
  {
    key: 'total_factions' as const,
    icon: Shield,
    label: 'Syndicates',
    color: 'text-yellow-400',
    bg: 'border-yellow-500/30',
    suffix: '',
  },
  {
    key: 'total_influence_circulating' as const,
    icon: TrendingUp,
    label: 'INF in Circulation',
    color: 'text-cyan-400',
    bg: 'border-cyan-500/30',
    suffix: '',
  },
];

export default function LiveStats() {
  const { data, isLoading } = useQuery<LiveStatsData>({
    queryKey: ['live-stats'],
    queryFn: async () => {
      const res = await apiFetch('/api/stats');
      return res.ok ? res.json() : null;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((card) => (
          <div key={card.key} className="p-4 border border-zinc-800 rounded-lg bg-black/30 animate-pulse">
            <div className="h-8 bg-zinc-800 rounded mb-2" />
            <div className="h-3 bg-zinc-800 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {statCards.map((card) => {
        const Icon = card.icon;
        const value = data[card.key];
        return (
          <div
            key={card.key}
            className={`group p-4 border ${card.bg} rounded-lg bg-black/40 hover:bg-black/60 transition-all duration-300 hover:-translate-y-0.5`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon size={14} className={card.color} />
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">{card.label}</span>
            </div>
            <div className={`text-xl sm:text-2xl font-extrabold ${card.color} tabular-nums`}>
              {value !== undefined ? <AnimatedCounter value={value} suffix={card.suffix} /> : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
