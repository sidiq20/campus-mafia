"use client";

import DashboardLayout from '@/components/DashboardLayout';
import { Zap, Tag, Skull, Fingerprint } from 'lucide-react';

import { useUser } from '@/contexts/UserContext';

export default function BlackMarketPage() {
  const { user } = useUser();
  return (
    <DashboardLayout>
      <header className="h-14 border-b border-green-500/20 flex items-center px-6 bg-black/40 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">Black Market // Contraband</h2>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-mono">Available Funds:</span>
          <span className="text-xs font-bold text-yellow-500">{user?.influence || 0} INF</span>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Zap size={16} className="text-yellow-500" />
            Tactical Advantages
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MarketItem 
              icon={<Skull />}
              title="DDoS Attack" 
              desc="Temporarily disable an enemy faction's ability to broadcast intel for 15 minutes." 
              cost={500} 
            />
            <MarketItem 
              icon={<Fingerprint />}
              title="Identity Scrambler" 
              desc="Post anonymously to the global feed. Earns 0 influence, but untraceable." 
              cost={100} 
            />
            <MarketItem 
              icon={<Tag />}
              title="Propaganda Boost" 
              desc="Double the influence earned from your next 3 broadcasts." 
              cost={250} 
            />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Shield size={16} className="text-blue-500" />
            Territory Defense
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MarketItem 
              icon={<Zap />}
              title="Firewall Upgrade" 
              desc="Adds +25 Defense Score to a controlled territory." 
              cost={400} 
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Shield(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}

function MarketItem({ title, desc, cost, icon }: { title: string, desc: string, cost: number, icon: React.ReactNode }) {
  return (
    <div className="border border-zinc-800 bg-black/40 p-4 rounded hover:border-yellow-500/30 transition-all group">
      <div className="flex items-center gap-3 mb-3">
        <div className="text-zinc-500 group-hover:text-yellow-500 transition-colors">
          {icon}
        </div>
        <h4 className="font-bold text-zinc-200">{title}</h4>
      </div>
      <p className="text-xs text-zinc-400 mb-4 h-12">{desc}</p>
      <div className="flex justify-between items-center pt-3 border-t border-zinc-900/50">
        <span className="text-xs font-bold text-yellow-500">{cost} INF</span>
        <button className="px-3 py-1 bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 rounded text-xs font-bold uppercase hover:bg-yellow-500/20 transition-colors">
          Acquire
        </button>
      </div>
    </div>
  );
}
