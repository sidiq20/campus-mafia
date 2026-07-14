"use client";

import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { Shield, Target, Users, Bomb, Clock, UserPlus, Zap, X, Swords } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/contexts/UserContext';
import { useState, useEffect } from 'react';

type Territory = {
  id: string;
  name: string;
  controlling_faction_id: string | null;
  controlling_faction_name: string | null;
  defense_score: number;
};

type InventoryItem = {
  item_id: string;
  quantity: number;
};

type Faction = {
  id: string;
  name: string;
  influence: number;
  member_count: number;
};

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

function useCountdown(targetDate: string) {
  const [remaining, setRemaining] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const target = new Date(targetDate).getTime();
      const diff = target - now;
      if (diff <= 0) {
        setRemaining('Executing...');
        setExpired(true);
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
      setExpired(false);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return { remaining, expired };
}

function RaidTimer({ executesAt }: { executesAt: string }) {
  const { remaining, expired } = useCountdown(executesAt);
  return (
    <span className={`flex items-center gap-1 font-mono text-xs ${expired ? 'text-green-500 animate-pulse' : 'text-yellow-500'}`}>
      <Clock size={12} />
      {remaining}
    </span>
  );
}

export default function TerritoryPage() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [planAmount, setPlanAmount] = useState<Record<string, string>>({});
  const [joinAmount, setJoinAmount] = useState<Record<string, string>>({});
  
  const { data: territories, isLoading } = useQuery<Territory[]>({
    queryKey: ['territories'],
    queryFn: async () => {
      const res = await apiFetch('/api/territories');
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
    staleTime: 15_000,
  });

  const { data: plannedRaids, refetch: refetchRaids } = useQuery<RaidPlan[]>({
    queryKey: ['planned-raids'],
    queryFn: async () => {
      const res = await apiFetch('/api/raids/planned');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const { data: inventory } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: async () => {
      const res = await apiFetch('/api/blackmarket/inventory');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: factions } = useQuery<Faction[]>({
    queryKey: ['factions'],
    queryFn: async () => {
      const res = await apiFetch('/api/factions');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const planRaidMutation = useMutation({
    mutationFn: async ({ territoryId, influence }: { territoryId: string, influence: number }) => {
      const res = await apiFetch(`/api/territories/${territoryId}/plan-raid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ influence_commitment: influence })
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Raid Planned!', { description: 'Planning phase started. Other faction members can join!' });
      queryClient.invalidateQueries({ queryKey: ['planned-raids'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setPlanAmount({});
    },
    onError: (err: Error) => {
      toast.error('Planning Failed', { description: err.message });
    }
  });

  const joinRaidMutation = useMutation({
    mutationFn: async ({ raidId, influence }: { raidId: string, influence: number }) => {
      const res = await apiFetch(`/api/raids/${raidId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ influence_commitment: influence })
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Joined Raid!`, { description: `Committed ${data.influence_committed} INF to the raid.` });
      queryClient.invalidateQueries({ queryKey: ['planned-raids'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setJoinAmount({});
    },
    onError: (err: Error) => {
      toast.error('Failed to Join', { description: err.message });
    }
  });

  const cancelRaidMutation = useMutation({
    mutationFn: async (raidId: string) => {
      const res = await apiFetch(`/api/raids/${raidId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Raid Cancelled', { description: 'All INF has been refunded to participants.' });
      queryClient.invalidateQueries({ queryKey: ['planned-raids'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => {
      toast.error('Cancel Failed', { description: err.message });
    }
  });

  const useItemMutation = useMutation({
    mutationFn: async ({ itemId, targetId }: { itemId: string, targetId: string }) => {
      const res = await apiFetch('/api/blackmarket/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, target_id: targetId })
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      const names: Record<string, string> = {
        cyber_nuke: '☢️ Cyber Nuke deployed! -50 defense.',
        firewall_upgrade: '🛡️ Firewall upgraded! +50 defense.',
        ddos_attack: '⚡ DDoS launched! Faction locked for 1 hour.',
      };
      toast.success(names[variables.itemId] || 'Item deployed!');
      queryClient.invalidateQueries({ queryKey: ['territories'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    }
  });

  const getQuantity = (itemId: string) => inventory?.find(i => i.item_id === itemId)?.quantity || 0;
  const hasNukes = getQuantity('cyber_nuke') > 0;
  const hasFirewalls = getQuantity('firewall_upgrade') > 0;
  const hasDdos = getQuantity('ddos_attack') > 0;

  // Track which user proposed which raid
  const myFactionRaids = plannedRaids?.filter(r => r.created_by === user?.id) || [];

  // Count territories per faction
  const factionTerritories: Record<string, number> = {};
  territories?.forEach(t => {
    if (t.controlling_faction_name) {
      factionTerritories[t.controlling_faction_name] = (factionTerritories[t.controlling_faction_name] || 0) + 1;
    }
  });

  return (
    <DashboardLayout>
      <header className="h-14 border-b border-green-500/20 flex items-center px-6 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Swords size={16} className="text-green-500" />
          <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">Tactical Map</h2>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {((user?.faction_id && plannedRaids && plannedRaids.length > 0) || hasNukes || hasFirewalls || hasDdos) && (
            <div className="flex items-center gap-2">
              {plannedRaids && plannedRaids.length > 0 && (
                <span className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                  <Clock size={10} /> {plannedRaids.length} active
                </span>
              )}
              {hasNukes && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-bold">☢️ x{getQuantity('cyber_nuke')}</span>}
              {hasFirewalls && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-bold">🛡️ x{getQuantity('firewall_upgrade')}</span>}
              {hasDdos && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded font-bold">⚡ x{getQuantity('ddos_attack')}</span>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-green-500" />
            <span className="text-xs text-green-500/70">Live</span>
          </div>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-24">
        {/* Active Raid Plans */}
        {plannedRaids && plannedRaids.length > 0 && (
          <div className="border border-orange-500/20 bg-orange-500/5 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-orange-500/10 flex items-center gap-2">
              <Swords size={16} className="text-orange-400" />
              <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest">Active Raid Plans</h3>
              <span className="text-[10px] text-orange-600 ml-auto font-mono">{plannedRaids.length} planning</span>
            </div>
            <div className="divide-y divide-orange-500/10">
              {plannedRaids.map(raid => (
                <div key={raid.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-zinc-200">{raid.target_territory_name}</span>
                        <RaidTimer executesAt={raid.executes_at} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {raid.participant_count} participant{raid.participant_count !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap size={12} className="text-yellow-600" />
                          <span className="text-yellow-500 font-mono">{raid.total_influence} INF</span>
                        </span>
                        <span className="text-zinc-600">by @{raid.created_by_name}</span>
                      </div>

                      {/* Join raid input */}
                      <div className="flex items-center gap-2 mt-3">
                        <input
                          type="number"
                          min={1}
                          placeholder="Commit INF..."
                          value={joinAmount[raid.id] || ''}
                          onChange={e => setJoinAmount(prev => ({ ...prev, [raid.id]: e.target.value }))}
                          className="w-28 bg-black/60 border border-zinc-800 rounded px-2.5 py-1.5 text-xs outline-none focus:border-green-500/50 text-zinc-200 placeholder-zinc-600"
                        />
                        <button
                          onClick={() => {
                            const amount = parseInt(joinAmount[raid.id] || '0');
                            if (!amount || amount <= 0) { toast.error('Enter a positive INF amount'); return; }
                            if (!user) { toast.error("Create an identity first."); return; }
                            joinRaidMutation.mutate({ raidId: raid.id, influence: amount });
                          }}
                          disabled={joinRaidMutation.isPending || !joinAmount[raid.id]}
                          className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded text-xs font-bold transition-all disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <UserPlus size={12} />
                          Join Raid
                        </button>
                        {(raid.created_by === user?.id) && (
                          <button
                            onClick={() => cancelRaidMutation.mutate(raid.id)}
                            disabled={cancelRaidMutation.isPending}
                            className="px-2 py-1.5 text-zinc-500 hover:text-red-400 rounded text-xs transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <div className="w-14 h-14 rounded-full bg-orange-500/10 border-2 border-orange-500/30 flex items-center justify-center">
                        <Swords size={20} className="text-orange-400" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Territory Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="text-zinc-500 text-sm animate-pulse col-span-full">Scanning territories...</div>
          ) : (
            territories?.map((t) => {
              const isUnowned = !t.controlling_faction_name;
              const isMine = t.controlling_faction_name === user?.faction_name;
              const color = isMine ? 'text-green-500' : isUnowned ? 'text-zinc-400' : 'text-red-400';
              const borderColor = isMine ? 'border-green-500/30' : isUnowned ? 'border-zinc-800' : 'border-red-500/20';
              const isExpanded = expanded === t.id;
              const hasActivePlan = plannedRaids?.some(r => r.target_territory_id === t.id && r.status === 'planning');
              
              return (
                <div key={t.id} className={`border ${borderColor} bg-black/40 p-4 rounded transition-colors group relative overflow-hidden ${hasActivePlan ? 'ring-1 ring-orange-500/30' : ''}`}>
                  {hasActivePlan && (
                    <div className="absolute top-2 right-2 bg-orange-500/20 text-orange-400 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
                      Planning
                    </div>
                  )}
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-zinc-200">{t.name}</h3>
                      <Shield className={color} size={16} />
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-zinc-500 uppercase">Controller</span>
                        <span className={`font-bold ${color}`}>{t.controlling_faction_name || 'Rogue'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500 uppercase">Defense</span>
                        <span className="text-zinc-300 font-mono">{t.defense_score}</span>
                      </div>
                      {/* Defense bar */}
                      <div className="w-full bg-zinc-900 rounded-full h-1.5 mt-1">
                        <div 
                          className={`h-1.5 rounded-full transition-all ${isMine ? 'bg-green-500' : isUnowned ? 'bg-zinc-600' : 'bg-red-500'}`} 
                          style={{ width: `${Math.min(100, t.defense_score)}%` }}
                        />
                      </div>
                    </div>
                
                    {/* Plan Raid Button (for non-owned territories) */}
                    {!isMine && user?.faction_id && (
                      <div className="mt-4">
                        {!hasActivePlan ? (
                          <>
                            <button 
                              onClick={() => setExpanded(isExpanded ? null : t.id)}
                              className="w-full py-2 bg-zinc-900 border border-zinc-700 rounded text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 hover:border-orange-500/50 hover:text-orange-400 transition-all flex justify-center items-center gap-2"
                            >
                              <Swords size={14} />
                              Plan Raid
                            </button>
                            {isExpanded && (
                              <div className="mt-2 p-3 bg-zinc-900/50 border border-zinc-800 rounded space-y-2">
                                <p className="text-[10px] text-zinc-500">
                                  Commit INF to start a 30-minute planning phase. Other faction members can join with their own INF.
                                </p>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={1}
                                    placeholder="INF amount..."
                                    value={planAmount[t.id] || ''}
                                    onChange={e => setPlanAmount(prev => ({ ...prev, [t.id]: e.target.value }))}
                                    className="flex-1 bg-black border border-zinc-800 rounded px-3 py-1.5 text-xs outline-none focus:border-orange-500/50 text-zinc-200 placeholder-zinc-600"
                                  />
                                  <button
                                    onClick={() => {
                                      const amount = parseInt(planAmount[t.id] || '0');
                                      if (!amount || amount <= 0) { toast.error('Enter a positive INF amount'); return; }
                                      planRaidMutation.mutate({ territoryId: t.id, influence: amount });
                                    }}
                                    disabled={planRaidMutation.isPending || !planAmount[t.id]}
                                    className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded text-xs font-bold transition-all disabled:cursor-not-allowed"
                                  >
                                    {planRaidMutation.isPending ? 'Planning...' : 'Launch Plan'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full py-2 bg-orange-500/10 border border-orange-500/30 rounded text-xs font-bold text-orange-400 flex justify-center items-center gap-2">
                            <Clock size={14} />
                            Planning in Progress
                          </div>
                        )}
                      </div>
                    )}

                    {/* Deploy Items Toggle */}
                    {(hasNukes || hasFirewalls) && (
                      <>
                        <button 
                          onClick={() => setExpanded(isExpanded ? null : t.id)}
                          className="w-full mt-4 py-2 bg-zinc-900 border border-zinc-700 rounded text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 hover:border-green-500/50 hover:text-green-400 transition-all flex justify-center items-center gap-2"
                        >
                          <Shield size={14} />
                          {isMine ? 'Defend' : 'Deploy Items'}
                        </button>
                        {isExpanded && (
                          <div className="mt-2 space-y-2 border-t border-zinc-800 pt-2">
                            {hasNukes && !isMine && (
                              <button 
                                onClick={() => useItemMutation.mutate({ itemId: 'cyber_nuke', targetId: t.id })}
                                disabled={useItemMutation.isPending}
                                className="w-full py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded text-xs font-bold uppercase hover:bg-red-500/20 transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                              >
                                <Bomb size={12} />
                                Cyber Nuke (-50 DEF)
                              </button>
                            )}
                            {hasFirewalls && isMine && (
                              <button 
                                onClick={() => useItemMutation.mutate({ itemId: 'firewall_upgrade', targetId: t.id })}
                                disabled={useItemMutation.isPending}
                                className="w-full py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded text-xs font-bold uppercase hover:bg-blue-500/20 transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                              >
                                <Shield size={12} />
                                Firewall Upgrade (+50 DEF)
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* No faction - show prompt */}
                    {!user?.faction_id && !isMine && (
                      <div className="w-full mt-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded text-[10px] text-zinc-600 text-center">
                        Join a faction to plan raids
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* DDoS Section */}
        {hasDdos && (
          <div className="border border-purple-500/20 bg-purple-500/5 p-6 rounded">
            <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              ⚡ Deploy DDoS Attack (x{getQuantity('ddos_attack')})
            </h3>
            <p className="text-xs text-zinc-400 mb-4">Select an enemy faction to disable their territory attacks for 1 hour.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {factions?.filter(f => f.name !== user?.faction_name).map(f => (
                <button
                  key={f.id}
                  onClick={() => useItemMutation.mutate({ itemId: 'ddos_attack', targetId: f.id })}
                  disabled={useItemMutation.isPending}
                  className="py-3 px-4 bg-black/60 border border-zinc-800 rounded text-sm font-bold text-zinc-300 hover:border-purple-500/50 hover:text-purple-400 transition-all disabled:opacity-50 flex items-center justify-between"
                >
                  <span>{f.name}</span>
                  <span className="text-[10px] text-zinc-500">{f.member_count} members</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Faction Standings */}
        <div className="mt-8 border border-zinc-800 rounded bg-black/40 p-6">
          <h3 className="text-sm font-semibold text-green-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Users size={16} />
            Faction Standings
          </h3>
          <div className="space-y-3">
            {factions?.sort((a, b) => b.influence - a.influence).map((faction, i) => (
              <div key={faction.id} className={`flex items-center justify-between p-3 border rounded bg-zinc-950 ${faction.name === user?.faction_name ? 'border-green-500/30' : 'border-zinc-800/50'}`}>
                <div className="flex items-center gap-4">
                  <span className="text-zinc-500 font-mono w-6">{String(i + 1).padStart(2, '0')}</span>
                  <span className={`font-bold ${faction.name === user?.faction_name ? 'text-green-400' : 'text-zinc-300'}`}>{faction.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="text-yellow-500">{faction.influence} INF</span>
                  <span className="text-zinc-500">{factionTerritories[faction.name] || 0} zones</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
