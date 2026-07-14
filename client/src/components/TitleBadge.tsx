"use client";

import { useQuery } from '@tanstack/react-query';
import { Trophy, Award, Medal, Star, Sparkles, Swords, ShoppingBag, Crown, User, Loader2, MessageSquare } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type UserTitle = {
  title_id: string;
  name: string;
  description: string;
  category: string;
  earned_at: string;
};

const categoryConfig: Record<string, { icon: React.ReactNode; color: string; border: string; bg: string }> = {
  social:    { icon: <MessageSquare size={12} />,    color: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-500/10' },
  warfare:   { icon: <Swords size={12} />,           color: 'text-red-400',    border: 'border-red-500/30',    bg: 'bg-red-500/10' },
  economy:   { icon: <ShoppingBag size={12} />,      color: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-500/10' },
  rank:      { icon: <Medal size={12} />,            color: 'text-blue-400',   border: 'border-blue-500/30',   bg: 'bg-blue-500/10' },
  leadership:{ icon: <Crown size={12} />,            color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10' },
  special:   { icon: <Sparkles size={12} />,         color: 'text-cyan-400',   border: 'border-cyan-500/30',   bg: 'bg-cyan-500/10' },
};

function TitleCard({ title }: { title: UserTitle }) {
  const cfg = categoryConfig[title.category] || categoryConfig.special;
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.border} ${cfg.bg} hover:scale-[1.02] transition-all duration-200`}>
      <div className={`mt-0.5 ${cfg.color}`}>{cfg.icon}</div>
      <div className="min-w-0">
        <p className={`text-xs font-bold ${cfg.color}`}>{title.name}</p>
        <p className="text-[10px] text-zinc-500 mt-0.5">{title.description}</p>
        <p className="text-[9px] text-zinc-600 mt-1 font-mono">
          Earned {new Date(title.earned_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}



export function TitleSection({ userId }: { userId?: string }) {
  const { data: titles, isLoading } = useQuery<UserTitle[]>({
    queryKey: ['titles', userId],
    queryFn: async () => {
      const res = await apiFetch('/api/titles');
      if (!res.ok) throw new Error('Failed to load titles');
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500 py-4 animate-pulse">
        <Loader2 size={14} className="animate-spin" />
        Loading titles...
      </div>
    );
  }

  if (!titles || titles.length === 0) {
    return (
      <div className="border border-dashed border-zinc-800 rounded-lg p-6 text-center">
        <Trophy size={24} className="text-zinc-700 mx-auto mb-2" />
        <p className="text-xs text-zinc-600">No titles earned yet. Complete achievements to unlock titles!</p>
      </div>
    );
  }

  // Group by category
  const grouped = titles.reduce<Record<string, UserTitle[]>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  const categoryNames: Record<string, string> = {
    social: 'Social',
    warfare: 'Warfare',
    economy: 'Economy',
    rank: 'Rank',
    leadership: 'Leadership',
    special: 'Special',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Trophy size={16} className="text-yellow-500" />
        <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">
          Titles ({titles.length})
        </h3>
      </div>
      <div className="space-y-3">
        {Object.entries(grouped).map(([category, categoryTitles]) => (
          <div key={category}>
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">
              {categoryNames[category] || category}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {categoryTitles.map(t => (
                <TitleCard key={t.title_id} title={t} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
