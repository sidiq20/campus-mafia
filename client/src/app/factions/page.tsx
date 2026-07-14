"use client";

import { useState } from 'react';
import { Shield, Users, ArrowRight, UserPlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import Link from 'next/link';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import ConfirmJoinDialog from '@/components/ConfirmJoinDialog';

type Faction = {
  id: string;
  name: string;
  description: string | null;
  influence: number;
  member_count: number;
};

export default function FactionsPage() {
  const { user } = useUser();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [showConfirmFor, setShowConfirmFor] = useState<Faction | null>(null);

  const { data: factions, isLoading } = useQuery<Faction[]>({
    queryKey: ['factions'],
    queryFn: async () => {
      const res = await apiFetch('/api/factions');
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
    staleTime: 60_000,
  });

  const isUnaffiliated = !user?.faction_name;

  const handleJoinFaction = async (faction: Faction) => {
    if (joiningId) return;
    
    setJoiningId(faction.id);
    setShowConfirmFor(null);
    try {
      const res = await apiFetch(`/api/factions/${faction.id}/join`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Allegiance pledged to ${faction.name}. Redirecting...`);
      setTimeout(() => { window.location.href = `/factions/${faction.id}`; }, 1200);
    } catch (e: any) {
      toast.error(e.message || 'Failed to join faction.');
      setJoiningId(null);
    }
  };

  const handleJoinClick = (faction: Faction, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirmFor(faction);
  };

  return (
    <DashboardLayout>
      <header className="h-14 border-b border-green-500/20 flex items-center px-6 bg-black/40 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">Global Factions</h2>
      </header>
      
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex justify-between items-end mb-8 border-b border-zinc-800 pb-4">
            <div>
              <div className="inline-block px-3 py-1 bg-green-500/10 border border-green-500/30 rounded text-[10px] font-bold text-green-400 mb-2 uppercase tracking-widest">Global Network</div>
              <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(34,197,94,0.2)]">Registered Syndicates</h1>
              <p className="text-sm text-zinc-500 mt-2">Directory of all active campus factions. Choose your allegiance.</p>
            </div>
            <button 
              onClick={() => toast.error('Clearance Level Too Low. Contact an Admin to register a new Syndicate.')}
              className="px-5 py-2.5 bg-green-500/10 text-green-500 border border-green-500/30 rounded text-xs font-bold uppercase tracking-widest hover:bg-green-500/20 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all"
            >
              + Create Faction
            </button>
          </div>

          {isLoading ? (
            <div className="text-center text-zinc-500 text-sm py-10 animate-pulse">Decrypting directory...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {factions?.map(f => (
                <Link 
                  href={`/factions/${f.id}`} 
                  key={f.id}
                  className="group relative flex flex-col h-full bg-zinc-950/80 rounded-xl overflow-hidden border border-zinc-800/80 hover:border-green-500/50 hover:shadow-[0_0_30px_rgba(34,197,94,0.15)] transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-[40px] group-hover:bg-green-500/20 transition-colors pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
                  
                  <div className="p-6 flex-1 flex flex-col relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-extrabold text-xl text-zinc-200 group-hover:text-green-400 transition-colors uppercase tracking-tight">{f.name}</h3>
                      <div className="w-10 h-10 rounded-full bg-black/50 border border-zinc-800 flex items-center justify-center group-hover:border-green-500/30 transition-colors shadow-inner">
                        <Shield className="text-zinc-600 group-hover:text-green-500 transition-colors drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]" size={18} />
                      </div>
                    </div>
                    
                    <p className="text-sm text-zinc-400 mb-6 flex-1 leading-relaxed border-l-2 border-zinc-800 pl-3 group-hover:border-green-500/30 transition-colors">{f.description || 'No intel available on this syndicate.'}</p>
                    
                    <div className="flex justify-between items-center text-xs mt-auto pt-4 border-t border-zinc-800/50 group-hover:border-green-500/20 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-zinc-500 group-hover:text-purple-400 transition-colors">
                          <Users size={14} />
                          <span className="font-mono">{f.member_count}/50</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-500 group-hover:text-yellow-500 transition-colors">
                          <span className="font-mono font-bold">{f.influence} INF</span>
                        </div>
                      </div>

                      {isUnaffiliated ? (
                        <button
                          onClick={(e) => handleJoinClick(f, e)}
                          disabled={joiningId === f.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 text-purple-400 border border-purple-500/40 rounded-md text-[10px] font-bold uppercase tracking-widest hover:bg-purple-500/20 hover:shadow-[0_0_10px_rgba(168,85,247,0.3)] transition-all disabled:opacity-50"
                        >
                          {joiningId === f.id ? (
                            <>
                              <span className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                              Joining
                            </>
                          ) : (
                            <>
                              <UserPlus size={12} />
                              Join
                            </>
                          )}
                        </button>
                      ) : (
                        <ArrowRight size={16} className="text-zinc-600 group-hover:text-green-400 transform group-hover:translate-x-1.5 transition-all" />
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmJoinDialog
        isOpen={showConfirmFor !== null}
        onClose={() => setShowConfirmFor(null)}
        onConfirm={() => showConfirmFor && handleJoinFaction(showConfirmFor)}
        factionName={showConfirmFor?.name || ''}
        isConfirming={joiningId !== null}
      />
    </DashboardLayout>
  );
}
