"use client";

import { Shield, Users, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

type Faction = {
  id: string;
  name: string;
  description: string | null;
  influence: number;
  member_count: number;
};

export default function FactionsPage() {
  const { data: factions, isLoading } = useQuery<Faction[]>({
    queryKey: ['factions'],
    queryFn: async () => {
      const res = await apiFetch('/api/factions');
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
  });

  return (
    <DashboardLayout>
      <header className="h-14 border-b border-green-500/20 flex items-center px-6 bg-black/40 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">Global Factions</h2>
      </header>
      
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex justify-between items-end mb-6 border-b border-zinc-800 pb-4">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">Registered Syndicates</h1>
              <p className="text-sm text-zinc-500 mt-1">Directory of all active campus factions.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center text-zinc-500 text-sm py-10 animate-pulse">Decrypting directory...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {factions?.map(f => (
                <Link 
                  href={`/factions/${f.id}`} 
                  key={f.id}
                  className="border border-zinc-800 bg-black/40 p-5 rounded hover:border-green-500/50 hover:bg-zinc-900/50 transition-all group relative overflow-hidden flex flex-col"
                >
                  <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/5 rounded-bl-full group-hover:bg-green-500/10 transition-colors"></div>
                  
                  <div className="flex justify-between items-start mb-2 relative z-10">
                    <h3 className="font-bold text-lg text-green-400 group-hover:text-green-300">{f.name}</h3>
                    <Shield className="text-zinc-600 group-hover:text-green-500 transition-colors" size={20} />
                  </div>
                  
                  <p className="text-sm text-zinc-400 mb-6 flex-1 relative z-10">{f.description || 'No intel available.'}</p>
                  
                  <div className="flex justify-between items-center text-xs border-t border-zinc-800/50 pt-3 relative z-10">
                    <div className="flex gap-4">
                      <div className="flex items-center gap-1.5 text-zinc-500">
                        <Users size={14} />
                        <span>{f.member_count}/50 Members</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-yellow-500">
                        <span className="font-bold">{f.influence} INF</span>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-zinc-600 group-hover:text-green-400 transform group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
