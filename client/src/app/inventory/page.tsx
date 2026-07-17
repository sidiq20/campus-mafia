"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { Package, Bomb, Skull, Shield, Tag, Fingerprint, Zap, Infinity, Crosshair, Loader2, X, ChevronRight, Radio, EyeOff } from 'lucide-react';
import Link from 'next/link';

type InventoryItem = { item_id: string; quantity: number };
type Territory = { id: string; name: string; controlling_faction_id: string | null; controlling_faction_name: string | null; defense_score: number };
type Faction = { id: string; name: string; influence: number; member_count: number };

const ITEM_META: Record<string, { title: string; desc: string; icon: React.ReactNode; color: string; targetType: 'territory' | 'faction' | 'self' | 'none' }> = {
  cyber_nuke:         { title: 'Cyber Nuke',           desc: 'Deal 50 damage to any territory.',             icon: <Bomb size={18} />,         color: 'text-red-500',    targetType: 'territory' },
  ddos_attack:        { title: 'DDoS Attack',          desc: 'Paralyze a faction for 1 hour.',               icon: <Skull size={18} />,        color: 'text-red-400',    targetType: 'faction' },
  firewall_upgrade:   { title: 'Firewall Upgrade',     desc: 'Add +50 DEF to a territory.',                  icon: <Shield size={18} />,       color: 'text-blue-400',   targetType: 'territory' },
  propaganda_boost:   { title: 'Propaganda Boost',     desc: 'Double INF earned for 30 min.',                 icon: <Tag size={18} />,          color: 'text-green-400',  targetType: 'self' },
  identity_scrambler: { title: 'Identity Scrambler',   desc: 'Stealth mode for 1 hour.',                      icon: <Fingerprint size={18} />,  color: 'text-purple-400', targetType: 'self' },
  inf_cap_bypass:     { title: 'Syndicate Pass',       desc: 'Remove daily INF cap for 24 hours.',            icon: <Zap size={18} />,          color: 'text-yellow-400', targetType: 'self' },
  bounty_kill:        { title: 'Bounty Hunter License', desc: 'Activate bounty hunter status for 24 hours.',   icon: <Crosshair size={18} />,    color: 'text-orange-400', targetType: 'self' },
  spy_drone:          { title: 'Spy Drone',            desc: 'Reveal enemy territory intel for 30 min.',      icon: <Radio size={18} />,        color: 'text-cyan-400',   targetType: 'self' },
  emp_mine:           { title: 'EMP Mine',             desc: 'Plant on a territory. Attacker loses 50% INF.', icon: <Zap size={18} />,          color: 'text-purple-400', targetType: 'territory' },
  smoke_screen:       { title: 'Smoke Screen',         desc: 'Hide faction activity for 2 hours.',            icon: <EyeOff size={18} />,      color: 'text-zinc-400',   targetType: 'self' },
};

export default function InventoryPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [useItem, setUseItem] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  const { data: inventory } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: async () => {
      const res = await apiFetch('/api/blackmarket/inventory');
      return res.ok ? res.json() : [];
    },
    staleTime: 30_000,
  });

  const { data: territories } = useQuery<Territory[]>({
    queryKey: ['territories'],
    queryFn: async () => {
      const res = await apiFetch('/api/territories');
      return res.ok ? res.json() : [];
    },
    staleTime: 30_000,
  });

  const { data: factions } = useQuery<Faction[]>({
    queryKey: ['factions'],
    queryFn: async () => {
      const res = await apiFetch('/api/factions');
      return res.ok ? res.json() : [];
    },
    staleTime: 30_000,
  });

  const useMutation_ = useMutation({
    mutationFn: async ({ item_id, target_id }: { item_id: string; target_id?: string | null }) => {
      const res = await apiFetch('/api/blackmarket/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id, target_id: target_id || null }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || 'Failed to use item');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Item deployed successfully!');
      setUseItem(null);
      setSelectedTarget(null);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['territories'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const meta = useItem ? ITEM_META[useItem] : null;
  const needsTarget = meta?.targetType === 'territory' || meta?.targetType === 'faction';
  const targets = meta?.targetType === 'territory' ? territories : meta?.targetType === 'faction' ? factions : [];

  const handleUseNow = (itemId: string) => {
    const m = ITEM_META[itemId];
    if (m?.targetType === 'self') {
      useMutation_.mutate({ item_id: itemId });
    } else {
      setUseItem(itemId);
      setSelectedTarget(null);
    }
  };

  const handleConfirmUse = () => {
    if (!useItem) return;
    useMutation_.mutate({ item_id: useItem, target_id: selectedTarget });
  };

  // Group owned items
  const ownedItems = inventory?.filter(i => i.quantity > 0) || [];

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center px-4 sm:px-8 bg-black/60 backdrop-blur-md">
        <h2 className="text-sm font-bold text-yellow-500 uppercase tracking-widest glow-text flex items-center gap-2">
          <Package size={16} /> Inventory
        </h2>
        <span className="ml-auto text-[10px] text-zinc-500">
          {ownedItems.length} item{ownedItems.length !== 1 ? 's' : ''}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#050505]">
        <div className="max-w-2xl mx-auto">

          {ownedItems.length === 0 ? (
            <div className="text-center py-16">
              <Package size={48} className="text-zinc-800 mx-auto mb-4" />
              <p className="text-sm text-zinc-600">Your inventory is empty.</p>
              <p className="text-[10px] text-zinc-700 mt-2">
          Visit the{' '}
          <Link href="/black-market" className="text-yellow-500 hover:text-yellow-400 underline">Black Market</Link>
          {' '} to acquire tactical assets.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ownedItems.map(item => {
                const m = ITEM_META[item.item_id];
                if (!m) return null;
                const isUsing = useMutation_.isPending && useItem === item.item_id;
                return (
                  <div
                    key={item.item_id}
                    className="flex items-center gap-4 p-4 bg-black/60 border border-zinc-800 rounded-lg hover:border-yellow-500/20 transition-all group"
                  >
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 ${m.color}`}>
                      {m.icon}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${m.color}`}>{m.title}</span>
                        <span className="bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded text-[9px] font-bold">
                          x{item.quantity}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{m.desc}</p>
                    </div>

                    {/* Use button */}
                    <button
                      onClick={() => handleUseNow(item.item_id)}
                      disabled={useMutation_.isPending}
                      className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shrink-0 ${
                        m.targetType === 'self'
                          ? 'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20'
                          : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isUsing ? <Loader2 size={14} className="animate-spin" /> : m.targetType === 'self' ? 'Activate' : 'Use'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Target Selector Modal */}
      {useItem && meta && needsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setUseItem(null)}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative bg-zinc-950 border border-zinc-800 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] max-w-lg w-full p-6 animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className={meta.color}>{meta.icon}</span>
                <h3 className="text-sm font-bold text-zinc-200">Select Target — {meta.title}</h3>
              </div>
              <button onClick={() => setUseItem(null)} className="text-zinc-600 hover:text-zinc-400">
                <X size={16} />
              </button>
            </div>

            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4">
              {meta.targetType === 'territory' ? 'Choose a territory to strike or reinforce:' : 'Choose a faction to target:'}
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {targets && (targets as any[]).length > 0 ? (targets as any[]).map((t: any) => {
                const isSelected = selectedTarget === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTarget(t.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'bg-yellow-500/10 border-yellow-500/40'
                        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-zinc-200 truncate">{t.name}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {'defense_score' in t && t.defense_score !== undefined ? (
                          <>
                            DEF: {t.defense_score}
                            <span className="mx-1">·</span>
                            {t.controlling_faction_id ? (
                              <Link href={`/factions/${t.controlling_faction_id}`} onClick={e => e.stopPropagation()} className="text-purple-400/70 hover:text-purple-300 hover:underline">
                                {t.controlling_faction_name || 'Unclaimed'}
                              </Link>
                            ) : 'Unclaimed'}
                          </>
                        ) : (
                          <>{t.member_count || 0} members · {t.influence || 0} INF</>
                        )}
                      </div>
                    </div>
                    {isSelected && <Crosshair size={14} className="text-yellow-400 shrink-0" />}
                  </button>
                );
              }) : (
                <p className="text-xs text-zinc-600 text-center py-8">
                  No {meta.targetType === 'territory' ? 'territories' : 'factions'} available
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setUseItem(null)}
                className="flex-1 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUse}
                disabled={!selectedTarget || useMutation_.isPending}
                className="flex-1 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs font-bold text-yellow-400 hover:bg-yellow-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {useMutation_.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Deploy
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
