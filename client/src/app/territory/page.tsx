"use client";

import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { Shield, Target, Crosshair, Users, Bomb, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/contexts/UserContext';
import { useState } from 'react';

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

export default function TerritoryPage() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [expanded, setExpanded] = useState<string | null>(null);
  
  const { data: territories, isLoading } = useQuery<Territory[]>({
    queryKey: ['territories'],
    queryFn: async () => {
      const res = await apiFetch('/api/territories');
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
    staleTime: 30_000,
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

  const attackMutation = useMutation({
    mutationFn: async (territoryId: string) => {
      const res = await apiFetch(`/api/territories/${territoryId}/attack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ influence_spent: 10 })
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success('Raid Completed', { description: `Attack report: ${data.status}` });
      queryClient.invalidateQueries({ queryKey: ['territories'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => {
      toast.error('Raid Failed', { description: err.message });
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
        <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">Tactical Map // Territory Control</h2>
        <div className="ml-auto flex items-center gap-4">
          {(hasNukes || hasFirewalls || hasDdos) && (
            <div className="flex items-center gap-2">
              {hasNukes && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-bold">☢️ x{getQuantity('cyber_nuke')}</span>}
              {hasFirewalls && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-bold">🛡️ x{getQuantity('firewall_upgrade')}</span>}
              {hasDdos && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded font-bold">⚡ x{getQuantity('ddos_attack')}</span>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-green-500" />
            <span className="text-xs text-green-500/70">Live Feed</span>
          </div>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
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
              
              return (
                <div key={t.id} className={`border ${borderColor} bg-black/40 p-4 rounded transition-colors group relative overflow-hidden`}>
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
                
                    {/* Standard Attack */}
                    <button 
                      onClick={() => attackMutation.mutate(t.id)}
                      disabled={attackMutation.isPending || isMine}
                      className="w-full mt-4 py-2 bg-zinc-900 border border-zinc-700 rounded text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 hover:border-green-500/50 hover:text-green-400 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                    >
                      <Crosshair size={14} />
                      {isMine ? 'Your Territory' : attackMutation.isPending ? 'Raiding...' : 'Raid (10 INF)'}
                    </button>

                    {/* Deploy Items Toggle */}
                    {(hasNukes || (hasFirewalls && isMine)) && (
                      <button 
                        onClick={() => setExpanded(isExpanded ? null : t.id)}
                        className="w-full mt-2 py-1.5 text-[10px] text-zinc-500 hover:text-yellow-500 uppercase tracking-wider flex justify-center items-center gap-1 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        Deploy Inventory Item
                      </button>
                    )}

                    {/* Expanded Item Actions */}
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
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* DDoS Section - target a faction */}
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

        {/* Faction Standings - use real data */}
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
