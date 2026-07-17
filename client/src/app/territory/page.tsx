"use client";

import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { Shield, Users, Bomb, Clock, UserPlus, Zap, X, Swords, ChevronDown, ChevronRight, Radio, MapPin, Crosshair, LayoutGrid, Map as MapIcon, AlertTriangle, Target } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/contexts/UserContext';
import { useState, useEffect, useCallback } from 'react';
import AsciiAnimation from '@/components/AsciiAnimation';

// ─── Nuke animation overlay ───
function NukeAnimation({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in" onClick={onDone}>
      <div className="text-center">
        <AsciiAnimation variant="nuke" size="lg" />
        <p className="text-xs text-red-400/80 mt-4 font-mono uppercase tracking-widest animate-pulse">⚡ Cyber Nuke Detonated ⚡</p>
        <p className="text-[9px] text-zinc-600 mt-2">Tap to dismiss</p>
      </div>
    </div>
  );
}

type Territory = {
  id: string;
  name: string;
  controlling_faction_id: string | null;
  controlling_faction_name: string | null;
  defense_score: number;
  faction_influence: number | null;
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
  territory_count: number;
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
    <span className={`flex items-center gap-1 font-mono text-xs ${expired ? 'text-green-500 animate-pulse' : 'text-yellow-400'}`}>
      <Clock size={12} />
      {remaining}
    </span>
  );
}

// ─── Modal Component ───
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <div 
        className="relative bg-zinc-950 border border-zinc-800 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] max-w-md lg:max-w-xl w-full p-6 lg:p-8 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">{title}</h3>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Action Card ───
function ActionCard({ 
  icon, 
  label, 
  desc, 
  onClick, 
  disabled = false, 
  variant = 'default' 
}: { 
  icon: React.ReactNode; 
  label: string; 
  desc: string; 
  onClick: () => void; 
  disabled?: boolean; 
  variant?: 'default' | 'attack' | 'defend' | 'utility'; 
}) {
  const colors = {
    default: 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900/50',
    attack: 'border-red-500/20 hover:border-red-500/40 hover:bg-red-950/20',
    defend: 'border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-950/20',
    utility: 'border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-950/20',
  };
  const textColors = {
    default: 'text-zinc-400 group-hover:text-zinc-200',
    attack: 'text-red-400',
    defend: 'text-blue-400',
    utility: 'text-purple-400',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full group flex items-center gap-4 p-4 border rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${colors[variant]}`}
    >
      <div className={`shrink-0 ${textColors[variant]}`}>{icon}</div>
      <div className="text-left flex-1 min-w-0">
        <div className={`text-sm font-bold ${textColors[variant]} group-hover:text-white transition-colors`}>{label}</div>
        <div className="text-[10px] text-zinc-500 mt-0.5">{desc}</div>
      </div>
      <ChevronRight size={16} className="shrink-0 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
    </button>
  );
}

// ─── Territory Map View Component ───
function TerritoryMapView({ 
  territories, 
  isLoading, 
  onAction,
  userFactionName,
  plannedRaids,
}: {
  territories: Territory[] | undefined;
  isLoading: boolean;
  onAction: (t: Territory) => void;
  userFactionName: string | null | undefined;
  plannedRaids: RaidPlan[];
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="animate-spin w-4 h-4 border-2 border-green-500/30 border-t-green-500 rounded-full" />
          <span className="text-xs font-mono animate-pulse">Rendering tactical map...</span>
        </div>
      </div>
    );
  }

  if (!territories || territories.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-600 text-xs">No territories found</div>
    );
  }

  // Arrange territories in a campus-like map layout using fixed positions
  const cols = 4;
  const positions = territories.map((t, i) => ({
    ...t,
    col: i % cols,
    row: Math.floor(i / cols),
  }));

  // Generate faction "zones" — group same-faction territories
  const factionColorMap: Record<string, string> = {};
  const factionNames = [...new Set(territories.filter(t => t.controlling_faction_name).map(t => t.controlling_faction_name!))];
  const factionColors = ['#22c55e', '#ef4444', '#a855f7', '#3b82f6', '#eab308', '#ec4899', '#14b8a6', '#f97316'];
  factionNames.forEach((name, i) => {
    factionColorMap[name] = factionColors[i % factionColors.length];
  });

  return (
    <div className="relative border border-zinc-800 rounded-xl bg-black/60 p-4 sm:p-6 overflow-x-auto">
      {/* Grid background */}
      <div 
        className="relative"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: '16px',
          minWidth: '600px',
        }}
      >
        {/* Zone labels */}
        {factionNames.slice(0, 6).map(name => {
          const factionTerrs = territories.filter(t => t.controlling_faction_name === name);
          if (factionTerrs.length === 0) return null;
          return (
            <div
              key={name}
              className="absolute pointer-events-none text-[8px] font-bold uppercase tracking-widest opacity-40"
              style={{
                color: factionColorMap[name] || '#666',
                left: `${((territories.indexOf(factionTerrs[0]) % cols) / cols) * 100 + 5}%`,
                top: `${(Math.floor(territories.indexOf(factionTerrs[0]) / cols) / Math.ceil(territories.length / cols)) * 100 - 8}%`,
              }}
            >
              {name} Zone
            </div>
          );
        })}

        {positions.map((t, i) => {
          const mine = t.controlling_faction_name === userFactionName;
          const unowned = !t.controlling_faction_name;
          const planned = plannedRaids.some(r => r.target_territory_id === t.id && r.status === 'planning');
          
          return (
            <div
              key={t.id}
              className="animate-fade-in"
              style={{
                animationDelay: `${i * 60}ms`,
                animationFillMode: 'backwards',
              }}
            >
              <button
                onClick={() => onAction(t)}
                className={`w-full p-4 rounded-xl border-2 transition-all duration-300 hover:scale-105 hover:shadow-lg ${
                  mine
                    ? 'border-green-500/40 bg-green-500/5 hover:bg-green-500/10 hover:shadow-green-500/20'
                    : unowned
                    ? 'border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800/50'
                    : 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10 hover:shadow-red-500/20'
                } ${planned ? 'ring-2 ring-orange-500/60 animate-pulse' : ''}`}
              >
                {/* Territory name */}
                <div className="text-center mb-2">
                  <div className="text-xs font-bold text-zinc-200 truncate">{t.name}</div>
                </div>
                
                {/* Defense circle */}
                <div className="flex justify-center mb-2">
                  <div 
                    className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${
                      mine ? 'border-green-500/50' : unowned ? 'border-zinc-700' : 'border-red-500/50'
                    }`}
                  >
                    <Shield size={14} className={mine ? 'text-green-400' : unowned ? 'text-zinc-500' : 'text-red-400'} />
                  </div>
                </div>
                
                {/* Defense score */}
                <div className={`text-center font-mono text-sm font-bold ${mine ? 'text-green-400' : unowned ? 'text-zinc-500' : 'text-red-400'}`}>
                  {t.defense_score}
                </div>

                {/* Mini defense bar */}
                <div className="w-full h-1 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      mine ? 'bg-green-500' : unowned ? 'bg-zinc-600' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, t.defense_score)}%` }}
                  />
                </div>

                {/* Planning indicator */}
                {planned && (
                  <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500 animate-ping" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-6 pt-4 border-t border-zinc-800/50">
        <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Legend:</span>
        {factionNames.slice(0, 6).map(name => (
          <div key={name} className="flex items-center gap-1.5">
            <div 
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: factionColorMap[name] }}
            />
            <span className="text-[9px] text-zinc-400">{name}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
          <span className="text-[9px] text-zinc-500">Rogue</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <span className="text-[9px] text-zinc-500">Raid Target</span>
        </div>
      </div>
    </div>
  );
}

export default function TerritoryPage() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [showStandings, setShowStandings] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'map'>('cards');
  
  // Modal state
  const [actionModal, setActionModal] = useState<{ open: boolean; territory: Territory | null }>({ open: false, territory: null });
  const [planModal, setPlanModal] = useState<{ open: boolean; territory: Territory | null }>({ open: false, territory: null });
  const [joinModal, setJoinModal] = useState<{ open: boolean; raid: RaidPlan | null }>({ open: false, raid: null });
  const [ddosModal, setDdosModal] = useState(false);
  const [nukeAnim, setNukeAnim] = useState<string | null>(null); // territory name of nuke target

  // Input values
  const [planAmount, setPlanAmount] = useState('');
  const [joinAmount, setJoinAmount] = useState('');
  
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
      setPlanModal({ open: false, territory: null });
      setPlanAmount('');
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
      setJoinModal({ open: false, raid: null });
      setJoinAmount('');
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
    onMutate: async (variables) => {
      // Optimistic: close modal immediately, show nuke anim
      if (variables.itemId === 'cyber_nuke') {
        const target = actionModal.territory?.name || 'Unknown';
        setNukeAnim(target);
        setActionModal({ open: false, territory: null });
      }
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
      setDdosModal(false);
    },
    onError: (err: Error, variables) => {
      toast.error(err.message);
      // If nuke failed, re-open the action modal
      if (variables.itemId === 'cyber_nuke') {
        setNukeAnim(null);
      }
    }
  });

  const getQuantity = (itemId: string) => inventory?.find(i => i.item_id === itemId)?.quantity || 0;
  const hasNukes = getQuantity('cyber_nuke') > 0;
  const hasFirewalls = getQuantity('firewall_upgrade') > 0;
  const hasDdos = getQuantity('ddos_attack') > 0;

  const activeRaids = plannedRaids || [];

  // Build faction territory count lookup from the enhanced factions data
  const factionTerritoryCount: Record<string, number> = {};
  factions?.forEach(f => {
    factionTerritoryCount[f.name] = f.territory_count || 0;
  });

  // Open action modal for a territory
  const openActionModal = useCallback((territory: Territory) => {
    setActionModal({ open: true, territory });
  }, []);

  const isOwnedByUser = (t: Territory) => t.controlling_faction_name === user?.faction_name;
  const isUnowned = (t: Territory) => !t.controlling_faction_name;
  const hasActivePlan = (t: Territory) => activeRaids.some(r => r.target_territory_id === t.id && r.status === 'planning');

  // Inventory badges data
  const inventoryBadges = [
    { id: 'cyber_nuke', label: '☢️', qty: getQuantity('cyber_nuke'), color: 'text-red-400', bg: 'bg-red-500/20' },
    { id: 'firewall_upgrade', label: '🛡️', qty: getQuantity('firewall_upgrade'), color: 'text-blue-400', bg: 'bg-blue-500/20' },
    { id: 'ddos_attack', label: '⚡', qty: getQuantity('ddos_attack'), color: 'text-purple-400', bg: 'bg-purple-500/20' },
  ].filter(b => b.qty > 0);

  return (
    <DashboardLayout>
      {/* ─── Header ─── */}
      <header className="h-14 border-b border-green-500/20 flex items-center px-4 sm:px-6 bg-black/40 backdrop-blur-md shrink-0">          <div className="flex items-center gap-3">
          <Swords size={16} className="text-green-500" />
          <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">Tactical Map</h2>
          <AsciiAnimation variant="skull" size="sm" className="ml-2 opacity-30" />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* View toggle */}
          <button
            onClick={() => setViewMode(viewMode === 'cards' ? 'map' : 'cards')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-zinc-800 rounded-lg text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-green-400 hover:border-green-500/30 transition-all"
            title={viewMode === 'cards' ? 'Switch to Map View' : 'Switch to Card View'}
          >
            {viewMode === 'cards' ? <MapIcon size={12} /> : <LayoutGrid size={12} />}
            {viewMode === 'cards' ? 'Map' : 'Cards'}
          </button>
          {/* Active raid count */}
          {activeRaids.length > 0 && (
            <span className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded font-bold flex items-center gap-1">
              <Swords size={10} />
              {activeRaids.length} raid{activeRaids.length > 1 ? 's' : ''}
            </span>
          )}
          {/* Inventory badges */}
          {inventoryBadges.map(b => (
            <span key={b.id} className={`text-[10px] ${b.bg} ${b.color} px-2 py-0.5 rounded font-bold`}>
              {b.label} x{b.qty}
            </span>
          ))}
          {/* Reputation & Heat Level */}
          {user && (
            <>
              <span className="hidden sm:flex items-center gap-1 text-[10px] text-blue-500/70" title="Reputation">
                <Target size={10} />
                {user.reputation}
              </span>
              <span className={`hidden sm:flex items-center gap-1 text-[10px] ${
                (user.heat_level || 0) > 70 ? 'text-red-500' : (user.heat_level || 0) > 40 ? 'text-yellow-500' : 'text-zinc-500'
              }`} title="Heat Level">
                <AlertTriangle size={10} />
                {user.heat_level || 0}%
              </span>
            </>
          )}
          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-[10px] text-green-500/60 font-mono hidden sm:inline">Live</span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 pb-24">
        {/* ─── Active Raid Plans ─── */}
        {activeRaids.length > 0 && (
          <div className="border border-orange-500/20 bg-gradient-to-r from-orange-500/5 to-transparent rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-orange-500/10 flex items-center gap-2">
              <Swords size={14} className="text-orange-400" />
              <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest">Active Raid Plans</h3>
              <span className="text-[10px] text-orange-600 ml-auto font-mono">{activeRaids.length} planning</span>
            </div>
            <div className="divide-y divide-orange-500/10">
              {activeRaids.map(raid => {
                const isCreator = raid.created_by === user?.id;
                return (
                  <div key={raid.id} className="px-4 py-3 sm:py-3">
                    <div className="flex items-center gap-4">
                      {/* Raid icon */}
                      <div className="hidden sm:flex w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/30 items-center justify-center shrink-0">
                        <Swords size={18} className="text-orange-400" />
                      </div>
                      {/* Raid info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-zinc-200">{raid.target_territory_name}</span>
                          <RaidTimer executesAt={raid.executes_at} />
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-zinc-500 mt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Users size={11} />
                            {raid.participant_count} participant{raid.participant_count !== 1 ? 's' : ''}
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap size={11} className="text-yellow-600" />
                            <span className="text-yellow-500 font-mono font-bold">{raid.total_influence} INF</span>
                          </span>
                          <span className="text-zinc-600">by @{raid.created_by_name}</span>
                        </div>
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setJoinModal({ open: true, raid })}
                          className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold transition-all hover:shadow-[0_0_12px_rgba(234,88,12,0.3)] flex items-center gap-1"
                        >
                          <UserPlus size={12} />
                          <span className="hidden sm:inline">Join</span>
                        </button>
                        {isCreator && (
                          <button
                            onClick={() => cancelRaidMutation.mutate(raid.id)}
                            disabled={cancelRaidMutation.isPending}
                            className="px-2 py-1.5 text-zinc-500 hover:text-red-400 rounded-lg text-xs transition-colors"
                            title="Cancel Raid"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Join Raid Modal ─── */}
        <Modal open={joinModal.open} onClose={() => { setJoinModal({ open: false, raid: null }); setJoinAmount(''); }} title="Join Raid">
          {joinModal.raid && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                <Swords size={20} className="text-orange-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-zinc-200">{joinModal.raid.target_territory_name}</p>
                  <p className="text-[10px] text-zinc-500">
                    {joinModal.raid.participant_count} participant{joinModal.raid.participant_count !== 1 ? 's' : ''} · {joinModal.raid.total_influence} INF committed
                  </p>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block">Commit Influence</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    placeholder="INF amount..."
                    value={joinAmount}
                    onChange={e => setJoinAmount(e.target.value)}
                    className="flex-1 bg-black border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-orange-500/50 text-zinc-200 placeholder-zinc-600"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const amount = parseInt(joinAmount);
                        if (!amount || amount <= 0) { toast.error('Enter a positive INF amount'); return; }
                        if (!user) { toast.error("Create an identity first."); return; }
                        joinRaidMutation.mutate({ raidId: joinModal.raid!.id, influence: amount });
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const amount = parseInt(joinAmount);
                      if (!amount || amount <= 0) { toast.error('Enter a positive INF amount'); return; }
                      if (!user) { toast.error("Create an identity first."); return; }
                      joinRaidMutation.mutate({ raidId: joinModal.raid!.id, influence: amount });
                    }}
                    disabled={joinRaidMutation.isPending || !joinAmount}
                    className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-bold transition-all disabled:cursor-not-allowed"
                  >
                    {joinRaidMutation.isPending ? 'Joining...' : 'Commit'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* ─── Territory View (Cards or Map) ─── */}
        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
              <div className="col-span-full flex flex-col items-center justify-center py-16 gap-4">
                <AsciiAnimation variant="radar" size="md" />
                <div className="flex items-center gap-2 text-zinc-500">
                  <span className="text-xs font-mono animate-pulse uppercase tracking-widest">Scanning territories...</span>
                </div>
              </div>
            ) : (
              territories?.map((t, idx) => {
                const mine = isOwnedByUser(t);
                const unowned = isUnowned(t);
                const planned = hasActivePlan(t);
                const color = mine ? 'text-green-400' : unowned ? 'text-zinc-500' : 'text-red-400';
                const borderColor = mine ? 'border-green-500/30' : unowned ? 'border-zinc-800' : 'border-red-500/20';
                const barColor = mine ? 'bg-green-500' : unowned ? 'bg-zinc-600' : 'bg-red-500';
                
                return (
                  <div
                    key={t.id}
                    className={`animate-fade-in relative group border ${borderColor} bg-black/40 rounded-xl p-5 transition-all duration-200 hover:shadow-[0_0_20px_rgba(0,0,0,0.5)] hover:border-opacity-50 ${planned ? 'ring-1 ring-orange-500/40' : ''}`}
                    style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'backwards' }}
                  >
                  {/* Planning badge */}
                  {planned && (
                    <div className="absolute top-3 right-3 bg-orange-500/20 text-orange-400 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-orange-500/30">
                      <span className="flex items-center gap-1">
                        <Clock size={9} />
                        Planning
                      </span>
                    </div>
                  )}

                  {/* Card header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <MapPin size={14} className={`${color} mt-0.5`} />
                      <div>
                        <h3 className="font-bold text-sm text-zinc-200">{t.name}</h3>
                        <span className={`text-[10px] font-bold ${color} flex items-center gap-1 mt-0.5`}>
                          <Shield size={10} />
                          {t.controlling_faction_name || 'Rogue'}
                        </span>
                      </div>
                    </div>
                    <div className={`text-right ${color}`}>
                      <span className="font-mono text-xs font-bold">{t.defense_score}</span>
                      <span className="text-[10px] text-zinc-700">/100</span>
                    </div>
                  </div>

                  {/* Defense bar */}
                  <div className="w-full bg-zinc-900 rounded-full h-2 mb-4 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${Math.min(100, t.defense_score)}%` }}
                    />
                  </div>

                  {/* Faction info */}
                  {t.controlling_faction_name && (
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[9px] text-zinc-600">
                        {factionTerritoryCount[t.controlling_faction_name] || 0} zone{(factionTerritoryCount[t.controlling_faction_name] || 0) !== 1 ? 's' : ''} controlled
                      </div>
                      <div className="text-[9px] text-yellow-500 font-mono font-bold">
                        {t.faction_influence?.toLocaleString() || '?'} INF
                      </div>
                    </div>
                  )}

                  {/* Action button */}
                  {!mine && user?.faction_id ? (
                    <button
                      onClick={() => openActionModal(t)}
                      disabled={!user?.faction_id}
                      className={`w-full py-2.5 border rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                        unowned
                          ? 'border-zinc-700 text-zinc-400 hover:border-green-500/50 hover:text-green-400 hover:bg-green-500/5'
                          : 'border-red-500/20 text-red-400 hover:border-red-500/40 hover:bg-red-500/5 hover:shadow-[0_0_12px_rgba(255,0,0,0.15)]'
                      }`}
                    >
                      <Crosshair size={13} />
                      {unowned ? 'Claim' : 'Attack'}
                    </button>
                  ) : mine ? (
                    hasFirewalls ? (
                      <button
                        onClick={() => openActionModal(t)}
                        className="w-full py-2.5 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-bold uppercase tracking-wider hover:border-blue-500/40 hover:bg-blue-500/5 transition-all flex items-center justify-center gap-2"
                      >
                        <Shield size={13} />
                        Defend
                      </button>
                    ) : (
                      <div className="w-full py-2.5 border border-green-500/10 text-green-500/40 rounded-lg text-[10px] text-center">
                        ✓ Controlled
                      </div>
                    )
                  ) : (
                    !user?.faction_id && (
                      <div className="w-full py-2.5 border border-zinc-800 text-zinc-700 rounded-lg text-[10px] text-center">
                        Join a faction to attack
                      </div>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <TerritoryMapView
          territories={territories}
          isLoading={isLoading}
          onAction={openActionModal}
          userFactionName={user?.faction_name}
          plannedRaids={activeRaids}
        />
      )}

        {/* Nuke Animation Overlay */}
      {nukeAnim && (
        <NukeAnimation onDone={() => setNukeAnim(null)} />
      )}

      {/* ─── Action Modal ─── */}
        <Modal 
          open={actionModal.open} 
          onClose={() => { setActionModal({ open: false, territory: null }); }} 
          title={actionModal.territory?.name || 'Territory Actions'}
        >
          {actionModal.territory && (
            <div className="space-y-3">
              <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">
                Controlled by <span className={isOwnedByUser(actionModal.territory) ? 'text-green-400' : 'text-red-400'}>
                  {actionModal.territory.controlling_faction_name || 'Rogue'}
                </span>
              </p>

              {/* Plan Raid (enemy territories only) */}
              {!isOwnedByUser(actionModal.territory) && !hasActivePlan(actionModal.territory) && (
                <ActionCard
                  icon={<Swords size={18} />}
                  label="Plan Raid"
                  desc="Start a 30-min planning phase. Other faction members can join."
                  variant="attack"
                  onClick={() => {
                    setPlanModal({ open: true, territory: actionModal.territory });
                    setActionModal({ open: false, territory: null });
                  }}
                />
              )}

              {/* Already planned indicator */}
              {!isOwnedByUser(actionModal.territory) && hasActivePlan(actionModal.territory) && (
                <div className="p-4 border border-orange-500/20 bg-orange-500/5 rounded-lg">
                  <div className="flex items-center gap-2 text-orange-400 text-xs font-bold">
                    <Clock size={14} />
                    Raid is already being planned
                  </div>
                </div>
              )}

              {/* Cyber Nuke */}
              {hasNukes && !isOwnedByUser(actionModal.territory) && (
                <ActionCard
                  icon={<Bomb size={18} />}
                  label="Deploy Cyber Nuke"
                  desc="Instantly deals 50 damage. Available: x{getQuantity('cyber_nuke')}"
                  variant="attack"
                  onClick={() => useItemMutation.mutate({ itemId: 'cyber_nuke', targetId: actionModal.territory!.id })}
                />
              )}

              {/* Firewall Upgrade */}
              {hasFirewalls && isOwnedByUser(actionModal.territory) && (
                <ActionCard
                  icon={<Shield size={18} />}
                  label="Deploy Firewall"
                  desc="Adds +50 defense. Available: x{getQuantity('firewall_upgrade')}"
                  variant="defend"
                  onClick={() => useItemMutation.mutate({ itemId: 'firewall_upgrade', targetId: actionModal.territory!.id })}
                />
              )}

              {!hasNukes && !hasFirewalls && isOwnedByUser(actionModal.territory) && (
                <div className="p-4 border border-zinc-800 rounded-lg text-center">
                  <p className="text-xs text-zinc-600">No deployable items available</p>
                  <p className="text-[10px] text-zinc-700 mt-1">Visit the Black Market to purchase equipment</p>
                </div>
              )}

              {(hasNukes || hasFirewalls) && !isOwnedByUser(actionModal.territory) && !hasActivePlan(actionModal.territory) && (
                <div className="text-[10px] text-zinc-600 text-center pt-2 border-t border-zinc-800/50">
                  Tip: Use Plan Raid first to pool INF with faction members, then strike harder.
                </div>
              )}
            </div>
          )}
        </Modal>

        {/* ─── Plan Raid Modal ─── */}
        <Modal open={planModal.open} onClose={() => { setPlanModal({ open: false, territory: null }); setPlanAmount(''); }} title="Plan Raid">
          {planModal.territory && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                <Swords size={20} className="text-red-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-zinc-200">{planModal.territory.name}</p>
                  <p className="text-[10px] text-zinc-500">
                    Defense: <span className="font-mono text-zinc-300">{planModal.territory.defense_score}</span>
                    <span className="mx-2">·</span>
                    Controlled by: {planModal.territory.controlling_faction_name || 'Rogue'}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block">
                  Your Commitment (INF)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={user?.influence || 0}
                    placeholder={`Available: ${user?.influence || 0} INF`}
                    value={planAmount}
                    onChange={e => setPlanAmount(e.target.value)}
                    className="flex-1 bg-black border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-orange-500/50 text-zinc-200 placeholder-zinc-600"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const amount = parseInt(planAmount);
                        if (!amount || amount <= 0) { toast.error('Enter a positive INF amount'); return; }
                        planRaidMutation.mutate({ territoryId: planModal.territory!.id, influence: amount });
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const amount = parseInt(planAmount);
                      if (!amount || amount <= 0) { toast.error('Enter a positive INF amount'); return; }
                      planRaidMutation.mutate({ territoryId: planModal.territory!.id, influence: amount });
                    }}
                    disabled={planRaidMutation.isPending || !planAmount}
                    className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-bold transition-all disabled:cursor-not-allowed"
                  >
                    {planRaidMutation.isPending ? 'Planning...' : 'Launch Raid Plan'}
                  </button>
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  A <strong className="text-orange-400">30-minute planning phase</strong> begins. Other faction members can commit INF to this raid. 
                  When the timer expires, all committed INF strikes the target territory as a single attack.
                </p>
              </div>
            </div>
          )}
        </Modal>

        {/* ─── DDoS Section ─── */}
        {hasDdos && (
          <div className="border border-purple-500/20 bg-purple-500/5 rounded-xl overflow-hidden">
            <button
              onClick={() => setDdosModal(!ddosModal)}
              className="w-full px-4 py-3 flex items-center gap-2 text-sm font-bold text-purple-400 uppercase tracking-widest"
            >
              <Radio size={14} />
              DDoS Attack Available
              <span className="ml-auto text-[10px] text-purple-600 font-mono">x{getQuantity('ddos_attack')}</span>
              {ddosModal ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {ddosModal && (
              <div className="px-4 pb-4 space-y-3 border-t border-purple-500/10 pt-3">
                <p className="text-[10px] text-zinc-500">Select an enemy faction to disable their territory attacks for 1 hour.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {factions?.filter(f => f.name !== user?.faction_name).map(f => (
                    <button
                      key={f.id}
                      onClick={() => useItemMutation.mutate({ itemId: 'ddos_attack', targetId: f.id })}
                      disabled={useItemMutation.isPending}
                      className="py-3 px-4 bg-black/60 border border-zinc-800 rounded-lg text-sm font-bold text-zinc-300 hover:border-purple-500/50 hover:text-purple-400 hover:bg-purple-950/20 transition-all disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>{f.name}</span>
                      <span className="text-[10px] text-zinc-600">{f.member_count} mem</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Faction Standings ─── */}
        <div className="border border-zinc-800 rounded-xl bg-black/40 overflow-hidden">
          <button
            onClick={() => setShowStandings(!showStandings)}
            className="w-full px-5 py-3.5 flex items-center gap-2 text-sm font-bold text-green-500 uppercase tracking-widest"
          >
            <Users size={15} />
            Faction Standings
            <span className="ml-auto text-[10px] text-zinc-600 font-mono">
              {factions?.length || 0} factions
            </span>
            {showStandings ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {showStandings && (
            <div className="px-5 pb-5 space-y-2 border-t border-zinc-800/50 pt-4">
              {factions?.sort((a, b) => b.influence - a.influence).map((faction, i) => {
                const isUserFaction = faction.name === user?.faction_name;
                return (
                  <div
                    key={faction.id}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                      isUserFaction
                        ? 'bg-green-500/5 border border-green-500/20'
                        : 'bg-zinc-950 border border-zinc-800/50 hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`font-mono text-xs w-5 ${
                        i === 0 ? 'text-yellow-500' : i === 1 ? 'text-zinc-400' : i === 2 ? 'text-orange-600' : 'text-zinc-700'
                      }`}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <span className={`font-bold text-sm ${isUserFaction ? 'text-green-400' : 'text-zinc-200'}`}>
                          {faction.name}
                        </span>
                        {isUserFaction && (
                          <span className="ml-2 text-[9px] text-green-600 border border-green-500/30 px-1.5 py-0.5 rounded uppercase">You</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono">
                      <span className="text-yellow-500 font-bold">{faction.influence.toLocaleString()} INF</span>
                      <span className="text-zinc-500 flex items-center gap-1">
                        <Shield size={10} />
                        {faction.territory_count || 0} zone{(faction.territory_count || 0) !== 1 ? 's' : ''}
                      </span>
                      <span className="text-zinc-600 flex items-center gap-1">
                        <Users size={10} />
                        {faction.member_count || 0} mem
                      </span>
                    </div>
                  </div>
                );
              })}
              {(!factions || factions.length === 0) && (
                <div className="text-center py-6 text-zinc-600 text-xs">No factions established yet</div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
