"use client";

import { use, useState } from 'react';
import { Shield, Users, Crosshair, Skull, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { API_URL } from '@/lib/api';

type Faction = {
  id: string;
  name: string;
  description: string | null;
  influence: number;
  member_count: number;
};

type FactionMember = {
  id: string;
  username: string;
  influence: number;
};

export default function FactionHubPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const { user } = useUser();
  const [isDeclaringWar, setIsDeclaringWar] = useState(false);

  const { data: faction, isLoading } = useQuery<Faction>({
    queryKey: ['faction', unwrappedParams.id],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/factions/${unwrappedParams.id}`, {
        credentials: 'true' === 'true' ? 'include' : 'same-origin',
      });
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
  });

  const { data: members, isLoading: isLoadingMembers } = useQuery<FactionMember[]>({
    queryKey: ['faction-members', unwrappedParams.id],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/factions/${unwrappedParams.id}/members`, {
        credentials: 'true' === 'true' ? 'include' : 'same-origin',
      });
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
  });

  const isMyFaction = user?.faction_name === faction?.name;

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
              <div className="border border-zinc-800 bg-black/60 p-8 rounded relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl pointer-events-none"></div>
                
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <h1 className="text-4xl font-bold text-green-500 glow-text mb-2 tracking-tighter uppercase">{faction.name}</h1>
                    <p className="text-zinc-400 max-w-lg">{faction.description || 'No classified intel available on this syndicate.'}</p>
                  </div>
                  <Shield className={isMyFaction ? "text-green-500" : "text-zinc-600"} size={48} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 relative z-10 border-t border-zinc-800/50 pt-6">
                  <div>
                    <div className="text-xs text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Users size={12}/> Members</div>
                    <div className="text-xl font-bold text-zinc-200">{faction.member_count} / 50</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Activity size={12}/> Influence</div>
                    <div className="text-xl font-bold text-yellow-500">{faction.influence}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Crosshair size={12}/> Status</div>
                    <div className="text-xl font-bold text-blue-500">Active</div>
                  </div>
                </div>
              </div>

              {/* Actions Area */}
              {!isMyFaction && (
                <div className="border border-red-900/30 bg-red-950/10 p-6 rounded flex items-center justify-between">
                  <div>
                    <h3 className="text-red-500 font-bold uppercase tracking-widest mb-1">Hostile Actions</h3>
                    <p className="text-sm text-zinc-500">Initiate a direct assault on territories controlled by {faction.name}.</p>
                  </div>
                  <button 
                    onClick={handleInvade}
                    disabled={isDeclaringWar}
                    className="px-6 py-3 bg-red-500/10 text-red-500 border border-red-500/50 rounded font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
                  >
                    <Skull size={18} />
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
                </div>
              )}

              {/* Roster Area */}
              <div className="border border-zinc-800 bg-black/40 rounded mt-6">
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Active Roster</h3>
                  <span className="text-xs text-zinc-500">{members?.length || 0} Operatives</span>
                </div>
                <div className="p-4">
                  {isLoadingMembers ? (
                    <div className="text-center text-zinc-500 text-xs py-4 animate-pulse">Scanning signatures...</div>
                  ) : members?.length === 0 ? (
                    <div className="text-center text-zinc-500 text-xs py-4">No operatives found.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {members?.map(member => (
                        <div key={member.id} className="flex items-center justify-between p-3 border border-zinc-800/50 bg-black/60 rounded">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                              <span className="text-green-500 font-bold text-xs">{member.username.substring(0, 2).toUpperCase()}</span>
                            </div>
                            <span className="text-sm font-bold text-zinc-300">@{member.username}</span>
                          </div>
                          <div className="text-xs font-mono text-yellow-500">{member.influence} INF</div>
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
    </DashboardLayout>
  );
}
