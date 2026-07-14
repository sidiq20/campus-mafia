"use client";

import { use, useState } from 'react';
import { Shield, Users, Crosshair, Skull, Activity, Crown, Star, UserMinus, UserCog, Loader2 } from 'lucide-react';
import { RankBadgeSmall } from '@/components/RankBadge';
import { ExecutiveBadgeSmall } from '@/components/ExecutiveBadge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import ConfirmJoinDialog from '@/components/ConfirmJoinDialog';

type Faction = {
  id: string;
  name: string;
  description: string | null;
  influence: number;
  member_count: number;
};

import type { RankInfo } from '@/contexts/UserContext';

type FactionMember = {
  id: string;
  username: string;
  influence: number;
  rank: RankInfo;
  faction_role: string;
};

type Territory = {
  id: string;
  name: string;
  controlling_faction_id: string | null;
  defense_score: number;
};

type InventoryItem = {
  item_id: string;
  quantity: number;
};

export default function FactionHubPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const { user } = useUser();
  const [isDeclaringWar, setIsDeclaringWar] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isAssigningRole, setIsAssigningRole] = useState(false);
  const [showJoinConfirm, setShowJoinConfirm] = useState(false);
  const [showRolePanel, setShowRolePanel] = useState(false);

  const { data: faction, isLoading } = useQuery<Faction>({
    queryKey: ['faction', unwrappedParams.id],
    queryFn: async () => {
      const res = await apiFetch(`/api/factions/${unwrappedParams.id}`);
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: members, isLoading: isLoadingMembers } = useQuery<FactionMember[]>({
    queryKey: ['faction-members', unwrappedParams.id],
    queryFn: async () => {
      const res = await apiFetch(`/api/factions/${unwrappedParams.id}/members`);
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: territories } = useQuery<Territory[]>({
    queryKey: ['territories'],
    queryFn: async () => {
      const res = await apiFetch('/api/territories');
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
    staleTime: 30_000,
  });

  const queryClient = useQueryClient();

  const { data: inventory } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: async () => {
      const res = await apiFetch('/api/blackmarket/inventory');
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
    enabled: !!user?.faction_name,
    staleTime: 60_000,
  });

  const factionTerritories = territories?.filter(t => t.controlling_faction_id === faction?.id) || [];
  const isMyFaction = user?.faction_name === faction?.name;
  const isUnaffiliated = !user?.faction_name;

  const handleLeaveFaction = async () => {
    setIsLeaving(true);
    try {
      const res = await apiFetch('/api/factions/leave', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      toast.success('You have left the faction.');
      setTimeout(() => { window.location.href = '/factions'; }, 1000);
    } catch (e: any) {
      toast.error(e.message || 'Failed to leave faction.');
      setIsLeaving(false);
    }
  };

  const handleJoinFaction = async () => {
    setIsJoining(true);
    setShowJoinConfirm(false);
    try {
      const res = await apiFetch(`/api/factions/${faction?.id}/join`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Allegiance pledged to ${faction?.name}.`);
      setTimeout(() => { window.location.href = `/factions/${faction?.id}`; }, 1000);
    } catch (e: any) {
      toast.error(e.message || 'Failed to join faction.');
      setIsJoining(false);
    }
  };

  const handleAssignRole = async (targetUserId: string, role: string) => {
    setIsAssigningRole(true);
    try {
      const res = await apiFetch(`/api/factions/${faction?.id}/assign-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetUserId, role }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Role updated to ${role.replace('_', ' ')}`);
      queryClient.invalidateQueries({ queryKey: ['faction-members', unwrappedParams.id] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (e: any) {
      toast.error(e.message || 'Failed to assign role.');
    }
    setIsAssigningRole(false);
  };

  const handleInvade = () => {
    setIsDeclaringWar(true);
    toast.error(`WAR DECLARED: ${faction?.name}`, { 
      description: "Redirecting targeting systems to the Tactical Map..." 
    });
    setTimeout(() => {
      window.location.href = '/territory';
    }, 2000);
  };

  return (
    <DashboardLayout>
      <header className="h-14 border-b border-green-500/20 flex items-center px-6 bg-black/40 backdrop-blur-md">
        <Link href="/factions" className="text-zinc-500 hover:text-green-500 mr-2 text-sm transition-colors">Directory</Link>
        <span className="text-zinc-600 mr-2">/</span>
        <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">{faction?.name || 'Loading...'}</h2>
      </header>
      
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {isLoading ? (
            <div className="text-center text-zinc-500 text-sm py-10 animate-pulse">Decrypting faction profile...</div>
          ) : !faction ? (
            <div className="text-center text-red-500 text-sm py-10">404: Faction Not Found or Disbanded</div>
          ) : (
            <>
              {/* Header Card */}
              <div className="border border-green-500/30 bg-black/80 backdrop-blur-xl p-8 rounded-lg relative overflow-hidden shadow-[0_0_40px_rgba(34,197,94,0.1)] hover:shadow-[0_0_60px_rgba(34,197,94,0.2)] transition-shadow duration-500">
                <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-[80px] pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-purple-500/10 rounded-full blur-[60px] pointer-events-none"></div>
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center relative z-10 gap-6">
                  <div>
                    <div className="inline-block px-3 py-1 bg-green-500/10 border border-green-500/30 rounded text-xs font-bold text-green-400 mb-4 uppercase tracking-widest">Syndicate Profile</div>
                    <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 mb-3 tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(34,197,94,0.3)] break-words">{faction.name}</h1>
                    <p className="text-zinc-400 max-w-lg text-sm leading-relaxed border-l-2 border-zinc-800 pl-4">{faction.description || 'No classified intel available on this syndicate. Operate with caution.'}</p>
                  </div>
                  <div className="flex-shrink-0 p-3 sm:p-4 md:p-6 rounded-full bg-black/50 border border-zinc-800 shadow-[inset_0_0_20px_rgba(34,197,94,0.05)]">
                    <Shield className={isMyFaction ? "text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]" : "text-zinc-600"} size={32} />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-6 sm:mt-10 relative z-10 border-t border-zinc-800/50 pt-6">
                  <div className="p-4 rounded-lg bg-zinc-950/50 border border-zinc-900 hover:border-green-500/30 transition-colors">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Users size={12} className="text-purple-400"/> Operatives</div>
                    <div className="text-lg sm:text-2xl font-bold text-zinc-200">{faction.member_count} <span className="text-[10px] sm:text-xs text-zinc-600 font-normal">/ 50</span></div>
                  </div>
                  <div className="p-4 rounded-lg bg-zinc-950/50 border border-zinc-900 hover:border-yellow-500/30 transition-colors">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Activity size={12} className="text-yellow-400"/> Influence</div>
                    <div className="text-lg sm:text-2xl font-bold text-yellow-500">{faction.influence}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-zinc-950/50 border border-zinc-900 hover:border-blue-500/30 transition-colors">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Crosshair size={12} className="text-blue-400"/> Zones</div>
                    <div className="text-lg sm:text-2xl font-bold text-zinc-200">{factionTerritories.length}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-zinc-950/50 border border-zinc-900 hover:border-green-500/30 transition-colors">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Shield size={12} className="text-green-400"/> Status</div>
                    <div className="text-lg font-bold text-green-500 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Active</div>
                  </div>
                </div>
              </div>

              {/* Actions Area */}
              {isUnaffiliated && (
                <div className="border border-purple-500/30 bg-purple-950/10 p-6 rounded-lg flex flex-col md:flex-row items-center justify-between shadow-[0_0_20px_rgba(168,85,247,0.1)]">
                  <div className="mb-4 md:mb-0">
                    <h3 className="text-purple-400 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-2"><Users size={16}/> Join Syndicate</h3>
                    <p className="text-sm text-zinc-400 max-w-md leading-relaxed">Align yourself with this faction to access encrypted comms and shared inventory. (Warning: Joining triggers a 5-day cooldown before you can leave).</p>
                  </div>
                  <button 
                    onClick={() => setShowJoinConfirm(true)}
                    disabled={isJoining}
                    className="w-full md:w-auto px-8 py-3.5 bg-purple-500/10 text-purple-400 border border-purple-500/50 rounded hover:bg-purple-500/20 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    {isJoining ? 'Encrypting Connection...' : 'Request Allegiance'}
                  </button>
                </div>
              )}

              {!isMyFaction && !isUnaffiliated && (
                <div className="border border-red-500/30 bg-red-950/10 p-6 rounded-lg flex flex-col md:flex-row items-center justify-between shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                  <div className="mb-4 md:mb-0">
                    <h3 className="text-red-500 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-2"><Skull size={16}/> Hostile Actions</h3>
                    <p className="text-sm text-zinc-400 max-w-md leading-relaxed">Initiate a direct assault on territories controlled by {faction.name}. Prepare for counter-measures.</p>
                  </div>
                  <button 
                    onClick={handleInvade}
                    disabled={isDeclaringWar}
                    className="w-full md:w-auto px-8 py-3.5 bg-red-500/10 text-red-500 border border-red-500/50 rounded font-bold uppercase tracking-widest hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all flex items-center justify-center gap-2"
                  >
                    <Crosshair size={18} />
                    {isDeclaringWar ? 'Authorizing...' : 'Invade'}
                  </button>
                </div>
              )}

              {isMyFaction && (
                <div className="border border-green-900/30 bg-green-950/10 p-6 rounded flex items-center justify-between">
                  <div>
                    <h3 className="text-green-500 font-bold uppercase tracking-widest mb-1">Headquarters</h3>
                    <p className="text-sm text-zinc-500">This is your syndicate. Protect your influence and expand your territory.</p>
                  </div>
                  <button 
                    onClick={handleLeaveFaction}
                    disabled={isLeaving}
                    className="px-6 py-3 bg-red-500/10 text-red-500 border border-red-500/50 rounded font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
                  >
                    {isLeaving ? 'Processing...' : 'Leave Faction'}
                  </button>
                </div>
              )}

              {/* Faction Territories */}
              <div className="border border-zinc-800/80 bg-black/60 rounded-lg overflow-hidden shadow-lg mt-8">
                <div className="p-5 border-b border-zinc-800/80 bg-zinc-900/30 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-widest flex items-center gap-2"><Crosshair size={16} className="text-blue-500"/> Controlled Territories</h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">{factionTerritories.length} Zones</span>
                </div>
                <div className="p-6">
                  {factionTerritories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                      <Crosshair size={32} className="mb-3 opacity-20" />
                      <div className="text-xs uppercase tracking-widest">No territories currently controlled</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {factionTerritories.map(t => (
                        <div key={t.id} className="p-4 border border-zinc-800 bg-zinc-950/50 rounded-lg hover:border-blue-500/30 hover:bg-blue-950/10 transition-colors group">
                          <h4 className="font-bold text-zinc-200 group-hover:text-blue-400 transition-colors">{t.name}</h4>
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2 flex items-center justify-between">
                            <span>Defense Grid</span>
                            <span className="text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded">{t.defense_score}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Faction Ammo (Inventory) - Only shown to faction members */}
              {isMyFaction && (
                <div className="border border-zinc-800 bg-black/40 rounded mt-6">
                  <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Faction Ammo (Inventory)</h3>
                  </div>
                  <div className="p-4">
                    {!inventory || inventory.length === 0 ? (
                      <div className="text-center text-zinc-500 text-xs py-4">Arsenal is empty. Visit the Black Market.</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {inventory.map(item => (
                          <div key={item.item_id} className="flex justify-between items-center p-3 border border-zinc-800/50 bg-black/60 rounded">
                            <span className="text-sm font-bold text-zinc-300 uppercase">{item.item_id.replace('_', ' ')}</span>
                            <span className="text-xs font-bold text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">x{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Roster Area */}
              <div className="border border-zinc-800/80 bg-black/60 rounded-lg overflow-hidden shadow-lg mt-8 mb-10">
                <div className="p-5 border-b border-zinc-800/80 bg-zinc-900/30 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-widest flex items-center gap-2"><Users size={16} className="text-purple-500"/> Active Roster</h3>
                  <div className="flex items-center gap-3">
                    {isMyFaction && user?.faction_role === 'head' && (
                      <button
                        onClick={() => setShowRolePanel(!showRolePanel)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest border transition-all ${
                          showRolePanel
                            ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-400'
                            : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-yellow-500/30 hover:text-yellow-400'
                        }`}
                      >
                        <UserCog size={12} />
                        Manage Roles
                      </button>
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20">{members?.length || 0} Operatives</span>
                  </div>
                </div>

                {/* Head Role Management Panel */}
                {showRolePanel && isMyFaction && (
                  <div className="p-5 border-b border-yellow-500/20 bg-yellow-500/5">
                    <h4 className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Crown size={14} />
                      Role Assignment Panel
                    </h4>
                    <p className="text-[10px] text-zinc-500 mb-4">Click a role button to assign it to a member. Max 1 Vice Head, 4 Executives.</p>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                      {members?.filter(m => m.id !== user?.id).map(member => (
                        <div key={member.id} className="flex items-center justify-between p-2.5 rounded-lg bg-black/40 border border-zinc-800/50">
                          <div className="flex items-center gap-2 min-w-0">
                            <Link href={`/profile/${member.username}`} className="text-xs font-bold text-zinc-300 hover:text-green-400 truncate transition-colors">@{member.username}</Link>
                            <ExecutiveBadgeSmall role={member.faction_role} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            {(['vice_head', 'executive', 'member'] as const).map(role => (
                              <button
                                key={role}
                                onClick={() => handleAssignRole(member.id, role)}
                                disabled={isAssigningRole || member.faction_role === role}
                                className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest border transition-all disabled:opacity-40 ${
                                  member.faction_role === role
                                    ? 'bg-zinc-700/30 border-zinc-600/30 text-zinc-500'
                                    : role === 'vice_head'
                                      ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10'
                                      : role === 'executive'
                                        ? 'border-purple-500/30 text-purple-400 hover:bg-purple-500/10'
                                        : 'border-zinc-700/30 text-zinc-500 hover:bg-zinc-700/20'
                                }`}
                              >
                                {role === 'vice_head' ? 'Vice' : role.charAt(0).toUpperCase() + role.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-6">
                  {isLoadingMembers ? (
                    <div className="flex flex-col items-center justify-center py-10 text-zinc-600 animate-pulse">
                      <Activity size={32} className="mb-3 opacity-20" />
                      <div className="text-xs uppercase tracking-widest">Scanning network signatures...</div>
                    </div>
                  ) : members?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                      <Users size={32} className="mb-3 opacity-20" />
                      <div className="text-xs uppercase tracking-widest">No operatives found</div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {members?.map((member, idx) => (
                        <div key={member.id} className={`flex items-center px-4 py-3 border-b border-zinc-800/40 last:border-b-0 transition-colors hover:bg-zinc-900/50 ${
                          member.faction_role === 'head'
                            ? 'bg-yellow-950/10 border-l-2 border-l-yellow-500/50'
                            : member.faction_role === 'vice_head'
                              ? 'bg-cyan-950/10 border-l-2 border-l-cyan-500/40'
                              : member.faction_role === 'executive'
                                ? 'bg-purple-950/10 border-l-2 border-l-purple-500/30'
                                : idx % 2 === 0 ? 'bg-black/20' : ''
                        }`}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                              {member.faction_role === 'head' ? (
                                <Crown size={16} className="text-yellow-500" />
                              ) : member.faction_role === 'vice_head' ? (
                                <Star size={16} className="text-cyan-400" />
                              ) : (
                                <span className="text-zinc-500 font-bold text-xs">{member.username.substring(0, 2).toUpperCase()}</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link href={`/profile/${member.username}`} className="text-sm font-bold text-zinc-200 hover:text-green-400 truncate max-w-[120px] sm:max-w-none transition-colors">@{member.username}</Link>
                                <ExecutiveBadgeSmall role={member.faction_role} />
                              </div>
                              <div className="flex items-center gap-2 mt-1 sm:mt-0.5 flex-wrap">
                                <RankBadgeSmall rank={member.rank} />
                                <div className="flex items-center gap-1.5 sm:hidden">
                                  <div className="h-1.5 w-16 bg-zinc-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full" 
                                      style={{ width: `${Math.min(100, (member.influence / 500) * 100)}%` }} />
                                  </div>
                                  <span className="text-[10px] font-bold text-yellow-500 tabular-nums">{member.influence}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="hidden sm:flex items-center gap-3 shrink-0 ml-3">
                            <div className="flex items-center gap-1.5">
                              <div className="h-2 w-14 bg-zinc-800 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full" 
                                  style={{ width: `${Math.min(100, (member.influence / 500) * 100)}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-xs font-bold text-yellow-500 w-16 text-right tabular-nums">{member.influence} INF</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmJoinDialog
        isOpen={showJoinConfirm}
        onClose={() => setShowJoinConfirm(false)}
        onConfirm={handleJoinFaction}
        factionName={faction?.name || ''}
        isConfirming={isJoining}
      />
    </DashboardLayout>
  );
}
