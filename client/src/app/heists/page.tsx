"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { Swords, Target, Zap, Users, Clock, Shield, UserPlus, Eye, Activity, Crosshair } from 'lucide-react';
import Link from 'next/link';

type RaidPlan = {
  id: string;
  faction_id: string;
  target_territory_id: string;
  target_territory_name: string;
  total_influence: number;
  status: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  executes_at: string;
  participant_count: number;
};

export default function HeistsPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [commitInfluence, setCommitInfluence] = useState<Record<string, number>>({});
  const [joiningRaid, setJoiningRaid] = useState<string | null>(null);

  const { data: raids, isLoading } = useQuery<RaidPlan[]>({
    queryKey: ['planned-raids'],
    queryFn: async () => {
      const res = await apiFetch('/api/raids/planned');
      return res.ok ? res.json() : [];
    },
    staleTime: 15_000,
    refetchInterval: 30000,
  });

  const joinRaidMutation = useMutation({
    mutationFn: async ({ raidId, influence }: { raidId: string; influence: number }) => {
      const res = await apiFetch(`/api/raids/${raidId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ influence_commitment: influence }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onMutate: ({ raidId }) => setJoiningRaid(raidId),
    onSuccess: (data) => {
      toast.success(`Joined the heist! (+${data.influence_committed} INF committed)`);
      queryClient.invalidateQueries({ queryKey: ['planned-raids'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setCommitInfluence({});
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setJoiningRaid(null),
  });

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-orange-500/30 flex items-center gap-3 px-4 sm:px-8 bg-black/60 backdrop-blur-md">
        <Swords className="text-orange-500" size={20} />
        <h2 className="text-sm font-bold text-orange-500 uppercase tracking-widest">Cooperative Heists</h2>
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest ml-auto flex items-center gap-1">
          <Activity size={10} /> {raids?.length || 0} Active
        </span>
      </header>

      <div className="flex-1 overflow-y-auto bg-[#050505] p-4 sm:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Info Banner */}
          <div className="border border-orange-500/20 bg-orange-950/10 rounded-xl p-4 sm:p-6">
            <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Shield size={14} /> Faction Raids
            </h3>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Raids are cooperative faction operations against enemy territories. Join an active raid by committing INF,
              or plan a new raid from the Territory page. Each raid has a 30-minute planning window — the more INF committed,
              the higher the chances of capturing the target. All participants share in the spoils.
            </p>
            <Link
              href="/territory"
              className="inline-flex items-center gap-1.5 mt-3 text-[10px] font-bold text-orange-400 hover:text-orange-300 transition-colors uppercase tracking-widest"
            >
              <Crosshair size={12} /> Plan Raid from Territory Map
            </Link>
          </div>

          {isLoading ? (
            <div className="text-center text-zinc-500 text-sm py-12 animate-pulse">Loading active heists...</div>
          ) : !raids || raids.length === 0 ? (
            <div className="border border-dashed border-zinc-800 rounded-xl p-12 text-center">
              <Swords size={40} className="mx-auto mb-4 text-zinc-800" />
              <p className="text-sm text-zinc-600 font-medium">No active heists</p>
              <p className="text-[10px] text-zinc-700 mt-1">Your faction has no planned raids. Visit the Territory page to start one.</p>
              <Link
                href="/territory"
                className="inline-block mt-4 px-4 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-orange-500/20 transition-all"
              >
                Go to Territory Map
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {raids.map(raid => {
                const timeLeft = Math.max(0, Math.floor((new Date(raid.executes_at).getTime() - Date.now()) / 1000));
                const mins = Math.floor(timeLeft / 60);
                const secs = timeLeft % 60;
                const commitAmt = commitInfluence[raid.id] || 50;

                return (
                  <div
                    key={raid.id}
                    className="border border-zinc-800 bg-black/60 rounded-xl p-4 sm:p-6 hover:border-orange-500/20 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                          <Target size={22} className="text-orange-500" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-sm text-zinc-200">{raid.target_territory_name}</h3>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                            <span>Planned by</span>
                            <Link href={`/profile/${raid.created_by_name}`} className="text-green-400 hover:text-green-300">
                              @{raid.created_by_name}
                            </Link>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 mt-2">
                            <div className="flex items-center gap-1 text-[10px] text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded">
                              <Zap size={10} /> {raid.total_influence} INF
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded">
                              <Users size={10} /> {raid.participant_count} member{raid.participant_count !== 1 ? 's' : ''}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-yellow-400 font-bold bg-yellow-500/10 px-2 py-0.5 rounded">
                              <Clock size={10} /> {mins}:{secs.toString().padStart(2, '0')}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={commitAmt}
                            onChange={e => setCommitInfluence(prev => ({ ...prev, [raid.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                            min={1}
                            className="w-20 bg-black border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-orange-500/50 text-center"
                          />
                          <span className="text-[10px] text-zinc-500">INF</span>
                        </div>
                        <button
                          onClick={() => joinRaidMutation.mutate({ raidId: raid.id, influence: commitAmt })}
                          disabled={joinRaidMutation.isPending || joiningRaid === raid.id}
                          className="flex items-center gap-1.5 px-3 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded-lg text-[10px] font-bold hover:bg-orange-500/20 transition-all disabled:opacity-50 uppercase tracking-widest"
                        >
                          <UserPlus size={12} />
                          {joiningRaid === raid.id ? 'Joining...' : 'Join'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
