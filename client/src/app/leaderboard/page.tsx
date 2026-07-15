"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { Trophy, Swords, Shield, Crown, Medal, TrendingUp, Users, Map as MapIcon } from 'lucide-react';
import Link from 'next/link';
import { RankBadgeSmall } from '@/components/RankBadge';

type LeaderboardUser = {
  id: string;
  username: string;
  display_name: string;
  faction_name: string | null;
  influence: number;
  rank: { level: number; name: string; tier: string; min_influence: number; next_min_influence: number | null; progress: number };
};

type LeaderboardFaction = {
  id: string;
  name: string;
  influence: number;
  member_count: number;
  territory_count: number;
};

type LeaderboardRaider = {
  id: string;
  username: string;
  display_name: string;
  faction_name: string | null;
  total_influence_committed: number;
  raid_count: number;
};

type Tab = 'users' | 'factions' | 'raiders';

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('users');

  const { data: users } = useQuery<LeaderboardUser[]>({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const res = await apiFetch('/api/leaderboard');
      return res.ok ? res.json() : [];
    },
    staleTime: 30_000,
  });

  const { data: factions } = useQuery<LeaderboardFaction[]>({
    queryKey: ['leaderboard-factions'],
    queryFn: async () => {
      const res = await apiFetch('/api/leaderboard/factions');
      return res.ok ? res.json() : [];
    },
    staleTime: 30_000,
  });

  const { data: raiders } = useQuery<LeaderboardRaider[]>({
    queryKey: ['leaderboard-raiders'],
    queryFn: async () => {
      const res = await apiFetch('/api/leaderboard/raiders');
      return res.ok ? res.json() : [];
    },
    staleTime: 30_000,
  });

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'users', label: 'Top INF', icon: <TrendingUp size={14} /> },
    { key: 'factions', label: 'Factions', icon: <Shield size={14} /> },
    { key: 'raiders', label: 'Top Raiders', icon: <Swords size={14} /> },
  ];

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center px-4 sm:px-8 bg-black/60 backdrop-blur-md">
        <h2 className="text-sm font-bold text-yellow-500 uppercase tracking-widest glow-text flex items-center gap-2">
          <Trophy size={16} /> Leaderboards
        </h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#050505]">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Tab Switcher */}
          <div className="flex gap-1.5 p-1 bg-black/60 border border-zinc-800 rounded-lg">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition-all ${
                  tab === t.key
                    ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 shadow-[0_0_10px_rgba(250,204,21,0.1)]'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Top INF Tab */}
          {tab === 'users' && (
            <div className="space-y-2">
              {(users || []).map((user, i) => (
                <Link
                  key={user.id}
                  href={`/profile/${user.username}`}
                  className="flex items-center gap-4 p-4 bg-black/60 border border-zinc-800 rounded-lg hover:border-yellow-500/20 transition-all group"
                >
                  {/* Rank Number */}
                  <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    {i === 0 ? <Crown size={14} className="text-yellow-400" /> :
                     i === 1 ? <Medal size={14} className="text-zinc-300" /> :
                     i === 2 ? <Medal size={14} className="text-amber-600" /> :
                     <span className="text-xs font-bold text-zinc-600">#{i + 1}</span>}
                  </div>

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-zinc-200 group-hover:text-yellow-400 transition-colors truncate">
                        {user.display_name}
                      </span>
                      <RankBadgeSmall rank={user.rank} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-500">@{user.username}</span>
                      {user.faction_name && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span className="text-[10px] text-purple-400/70">{user.faction_name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* INF */}
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-yellow-500">{user.influence.toLocaleString()}</div>
                    <div className="text-[8px] text-zinc-600 uppercase tracking-widest">INF</div>
                  </div>
                </Link>
              ))}
              {users?.length === 0 && (
                <div className="text-center text-zinc-600 py-12 text-xs italic">No operatives found</div>
              )}
            </div>
          )}

          {/* Factions Tab */}
          {tab === 'factions' && (
            <div className="space-y-2">
              {(factions || []).map((faction, i) => (
                <Link
                  key={faction.id}
                  href={`/factions/${faction.id}`}
                  className="flex items-center gap-4 p-4 bg-black/60 border border-zinc-800 rounded-lg hover:border-purple-500/20 transition-all group"
                >
                  {/* Rank */}
                  <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    {i === 0 ? <Crown size={14} className="text-yellow-400" /> :
                     i === 1 ? <Medal size={14} className="text-zinc-300" /> :
                     i === 2 ? <Medal size={14} className="text-amber-600" /> :
                     <span className="text-xs font-bold text-zinc-600">#{i + 1}</span>}
                  </div>

                  {/* Faction Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-zinc-200 group-hover:text-purple-400 transition-colors truncate">
                        {faction.name}
                      </span>
                      <Shield size={12} className="text-purple-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Users size={10} /> {faction.member_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapIcon size={10} /> {faction.territory_count} territories
                      </span>
                    </div>
                  </div>

                  {/* INF */}
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-purple-400">{faction.influence.toLocaleString()}</div>
                    <div className="text-[8px] text-zinc-600 uppercase tracking-widest">INF</div>
                  </div>
                </Link>
              ))}
              {factions?.length === 0 && (
                <div className="text-center text-zinc-600 py-12 text-xs italic">No factions found</div>
              )}
            </div>
          )}

          {/* Top Raiders Tab */}
          {tab === 'raiders' && (
            <div className="space-y-2">
              {(raiders || []).map((raider, i) => (
                <Link
                  key={raider.id}
                  href={`/profile/${raider.username}`}
                  className="flex items-center gap-4 p-4 bg-black/60 border border-zinc-800 rounded-lg hover:border-red-500/20 transition-all group"
                >
                  {/* Rank */}
                  <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    {i === 0 ? <Crown size={14} className="text-yellow-400" /> :
                     i === 1 ? <Medal size={14} className="text-zinc-300" /> :
                     i === 2 ? <Medal size={14} className="text-amber-600" /> :
                     <span className="text-xs font-bold text-zinc-600">#{i + 1}</span>}
                  </div>

                  {/* Raider Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-zinc-200 group-hover:text-red-400 transition-colors truncate">
                        {raider.display_name}
                      </span>
                      <Swords size={12} className="text-red-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-500">@{raider.username}</span>
                      {raider.faction_name && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span className="text-[10px] text-purple-400/70">{raider.faction_name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-red-400">{raider.total_influence_committed.toLocaleString()}</div>
                    <div className="text-[8px] text-zinc-600 flex items-center gap-1 justify-end">
                      <Swords size={8} />
                      {raider.raid_count} raid{raider.raid_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                </Link>
              ))}
              {raiders?.length === 0 && (
                <div className="text-center text-zinc-600 py-12 text-xs italic">No raiders found</div>
              )}
            </div>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}
