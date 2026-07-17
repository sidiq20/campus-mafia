"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { Swords, Skull, User, Target, Zap, Clock, X, Crosshair, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import UserAutocomplete from '@/components/UserAutocomplete';

type Bounty = {
  id: string;
  target_user_id: string;
  target_username: string;
  target_display_name: string;
  placed_by_user_id: string;
  placed_by_username: string;
  amount: number;
  status: string;
  created_at: string;
  expires_at: string;
};

export default function BountiesPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [showPlaceBounty, setShowPlaceBounty] = useState(false);
  const [targetUsername, setTargetUsername] = useState('');
  const [bountyAmount, setBountyAmount] = useState(50);
  const [filterTarget, setFilterTarget] = useState('');

  const { data: bounties, isLoading, refetch } = useQuery<Bounty[]>({
    queryKey: ['bounties', filterTarget],
    queryFn: async () => {
      const url = filterTarget.trim()
        ? `/api/bounties?target=${encodeURIComponent(filterTarget.trim())}`
        : '/api/bounties';
      const res = await apiFetch(url);
      return res.ok ? res.json() : [];
    },
    staleTime: 15_000,
  });

  const placeBountyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/bounties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_username: targetUsername, amount: bountyAmount }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast.success(`Bounty of ${bountyAmount} INF placed on @${targetUsername}!`);
      setShowPlaceBounty(false);
      setTargetUsername('');
      setBountyAmount(50);
      queryClient.invalidateQueries({ queryKey: ['bounties'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Check if user has active bounty hunter status (from using a bounty_kill item)

  const collectBountyMutation = useMutation({
    mutationFn: async (bountyId: string) => {
      const res = await apiFetch(`/api/bounties/${bountyId}/collect`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Bounty collected! +${data.amount} INF`);
      queryClient.invalidateQueries({ queryKey: ['bounties'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [collectTarget, setCollectTarget] = useState('');

  const collectByTargetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/bounties/collect-by-target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_username: collectTarget }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Collected ${data.bounties_collected} bounty${data.bounties_collected > 1 ? 'ies' : 'y'} on @${collectTarget}! +${data.total_collected} INF`);
      setCollectTarget('');
      queryClient.invalidateQueries({ queryKey: ['bounties'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-red-500/30 flex items-center justify-between px-4 sm:px-8 bg-black/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Skull className="text-red-500" size={20} />
          <h2 className="text-sm font-bold text-red-500 uppercase tracking-widest">Bounty Board</h2>
        </div>
        <button
          onClick={() => setShowPlaceBounty(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 rounded-lg text-[10px] font-bold text-red-400 hover:text-red-300 hover:border-red-500/30 transition-all"
        >
          <Crosshair size={14} />
          Place Bounty
        </button>
      </header>

      <div className="flex-1 overflow-y-auto bg-[#050505] p-4 sm:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Place Bounty Modal */}
          {showPlaceBounty && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowPlaceBounty(false)}>
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
              <div className="relative bg-zinc-950 border border-zinc-800 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] max-w-lg w-full p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-bold text-red-400 uppercase tracking-widest flex items-center gap-2">
                    <Skull size={16} /> Place Bounty
                  </h3>
                  <button onClick={() => setShowPlaceBounty(false)} className="text-zinc-600 hover:text-zinc-400"><X size={16} /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block">Target Username</label>
                    <UserAutocomplete
                      value={targetUsername}
                      onChange={setTargetUsername}
                      placeholder="Search by username..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block">Bounty Amount (min 50 INF)</label>
                    <input
                      type="number"
                      value={bountyAmount}
                      onChange={e => setBountyAmount(Math.max(50, parseInt(e.target.value) || 0))}
                      min={50}
                      className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-red-500/50 text-zinc-200"
                    />
                  </div>
                  <button
                    onClick={() => placeBountyMutation.mutate()}
                    disabled={!targetUsername.trim() || bountyAmount < 50 || placeBountyMutation.isPending}
                    className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-bold transition-all"
                  >
                    {placeBountyMutation.isPending ? 'Placing...' : `Place ${bountyAmount} INF Bounty`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Info banner — anyone can collect */}
          {user && (
            <div className="px-4 py-3 rounded-lg border border-green-500/20 bg-green-950/10 text-green-400 text-xs flex items-center gap-3">
              <ShieldAlert size={16} />
              <div>
                Anyone can collect bounties — no special status needed. Just find a target and collect!
              </div>
            </div>
          )}

          {/* Collect by Target — always available */}
          <div className="border border-red-500/20 bg-red-950/10 p-4 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <UserAutocomplete
                  value={collectTarget}
                  onChange={setCollectTarget}
                  placeholder="Collect bounties on target..."
                />
              </div>
              <button
                onClick={() => collectByTargetMutation.mutate()}
                disabled={!collectTarget.trim() || collectByTargetMutation.isPending}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5"
              >
                {collectByTargetMutation.isPending ? 'Collecting...' : 'Collect All'}
              </button>
            </div>
            <p className="text-[9px] text-zinc-600 mt-2">
              Collect all active bounties on a target in one click.
            </p>
          </div>

          {/* Filter by target */}
          <div className="flex items-center gap-3">
            <div className="flex-1 max-w-xs">
              <UserAutocomplete
                value={filterTarget}
                onChange={setFilterTarget}
                placeholder="Filter by target username..."
                className="!border-zinc-700 !focus:border-red-500/50 !text-[11px]"
              />
            </div>
            {filterTarget && (
              <button
                onClick={() => setFilterTarget('')}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1"
              >
                <X size={12} /> Clear
              </button>
            )}
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest ml-auto flex items-center gap-2">
              <Swords size={14} className="text-red-500" /> Active Contracts
            </span>
          </div>

          {isLoading ? (
            <div className="text-center text-zinc-500 text-sm py-12 animate-pulse">Loading bounty board...</div>
          ) : !bounties || bounties.length === 0 ? (
            <div className="border border-dashed border-zinc-800 rounded-xl p-12 text-center">
              <Skull size={40} className="mx-auto mb-4 text-zinc-800" />
              <p className="text-sm text-zinc-600 font-medium">No active contracts</p>
              <p className="text-[10px] text-zinc-700 mt-1">Place a bounty to put a target on someone's back</p>
              <button
                onClick={() => setShowPlaceBounty(true)}
                className="mt-4 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-red-500/20 transition-all"
              >
                + Place Bounty
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {bounties.map(b => {
                const expiresIn = Math.max(0, Math.floor((new Date(b.expires_at).getTime() - Date.now()) / 3600000));
                const isMyPlacer = user?.id === b.placed_by_user_id;
                const isMyTarget = user?.id === b.target_user_id;
                const canCollect = user && !isMyPlacer && !isMyTarget;

                return (
                  <div
                    key={b.id}
                    className="border border-zinc-800 bg-black/60 rounded-xl p-4 hover:border-red-500/20 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-zinc-900 border border-red-500/20 flex items-center justify-center shrink-0">
                          <Target size={18} className="text-red-500" />
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/profile/${b.target_username}`}
                            className="font-bold text-sm text-zinc-200 hover:text-red-400 transition-colors"
                          >
                            @{b.target_username}
                          </Link>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                            <span>Bounty by</span>
                            <Link href={`/profile/${b.placed_by_username}`} className="text-zinc-400 hover:text-green-400">
                              @{b.placed_by_username}
                            </Link>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-red-500">{b.amount}</div>
                        <div className="text-[9px] text-zinc-600 uppercase tracking-widest">INF</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/50">
                      <div className="flex items-center gap-2 text-[9px] text-zinc-600">
                        <Clock size={10} />
                        <span>{expiresIn}h remaining</span>
                      </div>
                      {canCollect && (
                        <button
                          onClick={() => collectBountyMutation.mutate(b.id)}
                          disabled={collectBountyMutation.isPending}
                          className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded text-[10px] font-bold hover:bg-red-500/20 transition-all disabled:opacity-50"
                        >
                          {collectBountyMutation.isPending ? 'Collecting...' : 'Collect'}
                        </button>
                      )}
                      {isMyPlacer && (
                        <span className="text-[10px] text-zinc-500 italic">Your bounty</span>
                      )}
                      {isMyTarget && (
                        <span className="text-[10px] text-red-600 animate-pulse">⚠️ Targeted</span>
                      )}
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
