"use client";

import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { Shield, Target, Crosshair, Users } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type Territory = {
  id: string;
  name: string;
  controlling_faction_name: string | null;
  defense_score: number;
};

export default function TerritoryPage() {
  const queryClient = useQueryClient();
  
  const { data: territories, isLoading } = useQuery<Territory[]>({
    queryKey: ['territories'],
    queryFn: async () => {
      const res = await apiFetch('/api/territories');
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
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
    },
    onError: (err) => {
      toast.error('Raid Failed', { description: err.message });
    }
  });
  return (
    <DashboardLayout>
      <header className="h-14 border-b border-green-500/20 flex items-center px-6 bg-black/40 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">Tactical Map // Territory Control</h2>
        <div className="ml-auto flex items-center gap-2">
          <Target className="h-4 w-4 text-green-500" />
          <span className="text-xs text-green-500/70">Live Feed</span>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="text-zinc-500 text-sm animate-pulse">Scanning territories...</div>
          ) : (
            territories?.map((t) => {
              const isUnowned = !t.controlling_faction_name;
              const color = isUnowned ? 'text-zinc-400' : 'text-green-500'; // Defaulting to generic colors since we don't have hardcoded mappings per faction
              const bg = isUnowned ? 'bg-zinc-500/10' : 'bg-green-500/10';
              
              return (
                <div key={t.id} className="border border-zinc-800 bg-black/40 p-4 rounded hover:border-zinc-700 transition-colors group relative overflow-hidden">
                  <div className={`absolute inset-0 ${bg} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-zinc-200">{t.name}</h3>
                      <Shield className={color} size={16} />
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-zinc-500 uppercase">Controlling Faction</span>
                        <span className={`font-bold ${color}`}>{t.controlling_faction_name || 'Rogue'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500 uppercase">Defense Score</span>
                        <span className="text-zinc-300 font-mono">{t.defense_score}/100</span>
                      </div>
                    </div>
                
                  <button 
                    onClick={() => attackMutation.mutate(t.id)}
                    disabled={attackMutation.isPending}
                    className="w-full mt-4 py-2 bg-zinc-900 border border-zinc-700 rounded text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 hover:border-green-500/50 hover:text-green-400 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    <Crosshair size={14} />
                    {attackMutation.isPending ? 'Raiding...' : 'Initiate Raid (10 INF)'}
                  </button>
                </div>
              </div>
            );
          }))}
        </div>

        <div className="mt-8 border border-zinc-800 rounded bg-black/40 p-6">
          <h3 className="text-sm font-semibold text-green-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Users size={16} />
            Faction Standings
          </h3>
          <div className="space-y-3">
            {['The Ravens', 'The Syndicate', '404', 'The Cartel'].map((faction, i) => (
              <div key={faction} className="flex items-center justify-between p-3 border border-zinc-800/50 rounded bg-zinc-950">
                <div className="flex items-center gap-4">
                  <span className="text-zinc-500 font-mono">0{i + 1}</span>
                  <span className="font-bold text-zinc-300">{faction}</span>
                </div>
                <div className="text-xs text-zinc-500 font-mono">
                  PWR: {Math.floor(1000 - i * 150)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
