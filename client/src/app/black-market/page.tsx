"use client";

import DashboardLayout from '@/components/DashboardLayout';
import { Zap, Tag, Skull, Fingerprint, Shield, Bomb, Package, Loader2, Crown, Infinity, Radio, EyeOff, Target } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { apiFetch } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type InventoryItem = {
  item_id: string;
  quantity: number;
};

const ITEMS = [
  {
    id: 'cyber_nuke',
    title: 'Cyber Nuke',
    desc: 'Instantly deals 50 damage to an enemy territory\'s defense score. Bypasses normal attack RNG and DDoS locks.',
    cost: 75,
    icon: <Bomb />,
    category: 'attack',
  },
  {
    id: 'ddos_attack',
    title: 'DDoS Attack',
    desc: 'Sabotages an enemy faction for 1 hour — they cannot launch territory attacks while under DDoS.',
    cost: 350,
    icon: <Skull />,
    category: 'attack',
  },
  {
    id: 'firewall_upgrade',
    title: 'Firewall Upgrade',
    desc: 'Adds +50 Defense Score to a territory your faction controls. Deploy from the Territory Map.',
    cost: 75,
    icon: <Shield />,
    category: 'defense',
  },
  {
    id: 'emp_mine',
    title: 'EMP Mine',
    desc: 'Plant on your own territory. The next attacker loses 50% of the INF they spend. Lasts 24 hours.',
    cost: 300,
    icon: <Zap />,
    category: 'defense',
  },
  {
    id: 'propaganda_boost',
    title: 'Propaganda Boost',
    desc: 'Doubles the INF earned from all your broadcasts for 30 minutes. Auto-activates on purchase.',
    cost: 200,
    icon: <Tag />,
    category: 'economy',
  },
  {
    id: 'identity_scrambler',
    title: 'Identity Scrambler',
    desc: 'Grants a 1-hour stealth window. Your posts become untraceable during this period.',
    cost: 100,
    icon: <Fingerprint />,
    category: 'stealth',
  },
  {
    id: 'spy_drone',
    title: 'Spy Drone',
    desc: 'Deploy a recon drone for 30 minutes. Reveals hidden intel on enemy territories and factions.',
    cost: 200,
    icon: <Radio />,
    category: 'stealth',
  },
  {
    id: 'bounty_kill',
    title: 'Bounty Hunter License',
    desc: 'Grants bounty hunter status for 24 hours. Allows you to collect bounties on wanted targets. Stack to extend.',
    cost: 150,
    icon: <Target />,
    category: 'economy',
  },
  {
    id: 'smoke_screen',
    title: 'Smoke Screen',
    desc: 'Shrouds your faction\'s activity for 2 hours. Your territorial actions won\'t broadcast alerts to other factions.',
    cost: 250,
    icon: <EyeOff />,
    category: 'stealth',
  },
  {
    id: 'inf_cap_bypass',
    title: 'Syndicate Pass',
    desc: 'Lifts your daily INF earning limit for 24 hours. Stack multiple to extend duration. The ultimate grind accelerator.',
    cost: 2000,
    icon: <Zap />,
    category: 'economy',
  },
];

export default function BlackMarketPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  const { data: inventory } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: async () => {
      const res = await apiFetch('/api/blackmarket/inventory');
      if (!res.ok) throw new Error('Failed to load inventory');
      return res.json();
    },
    staleTime: 60_000,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiFetch('/api/blackmarket/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Purchase failed');
      }
      return res.json();
    },
    onSuccess: (data, itemId) => {
      const item = ITEMS.find(i => i.id === itemId);
      toast.success(`Acquired: ${item?.title || itemId}`);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Transaction failed');
    },
  });

  const getQuantity = (itemId: string) => {
    return inventory?.find(i => i.item_id === itemId)?.quantity || 0;
  };

  const syndicatePass = ITEMS.find(i => i.id === 'inf_cap_bypass');
  const attackItems = ITEMS.filter(i => i.category === 'attack');
  const defenseItems = ITEMS.filter(i => i.category === 'defense');
  const utilityItems = ITEMS.filter(i => (i.category === 'economy' || i.category === 'stealth') && i.id !== 'inf_cap_bypass');

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

        {/* Inventory Banner */}
        {inventory && inventory.length > 0 && (
          <div className="border border-yellow-500/20 bg-yellow-500/5 p-4 rounded">
            <h3 className="text-xs font-bold text-yellow-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Package size={14} /> Your Inventory
            </h3>
            <div className="flex flex-wrap gap-3">
              {inventory.map(item => {
                const meta = ITEMS.find(i => i.id === item.item_id);
                return (
                  <div key={item.item_id} className="flex items-center gap-2 px-3 py-1.5 bg-black/60 border border-zinc-800 rounded text-xs">
                    <span className="text-yellow-500">{meta?.icon}</span>
                    <span className="text-zinc-300 font-bold">{meta?.title || item.item_id}</span>
                    <span className="bg-yellow-500/20 text-yellow-400 px-1.5 rounded font-bold">x{item.quantity}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Offensive Items */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Skull size={16} className="text-red-500" />
            Offensive Arsenal
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {attackItems.map(item => (
              <MarketItem 
                key={item.id}
                icon={item.icon}
                title={item.title}
                desc={item.desc}
                cost={item.cost}
                owned={getQuantity(item.id)}
                onBuy={() => purchaseMutation.mutate(item.id)}
                isPending={purchaseMutation.isPending}
                canAfford={(user?.influence || 0) >= item.cost}
              />
            ))}
          </div>
        </div>

        {/* Defense Items */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Shield size={16} className="text-blue-500" />
            Territory Defense
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {defenseItems.map(item => (
              <MarketItem 
                key={item.id}
                icon={item.icon}
                title={item.title}
                desc={item.desc}
                cost={item.cost}
                owned={getQuantity(item.id)}
                onBuy={() => purchaseMutation.mutate(item.id)}
                isPending={purchaseMutation.isPending}
                canAfford={(user?.influence || 0) >= item.cost}
              />
            ))}
          </div>
        </div>

        {/* Syndicate Pass — Premium Section */}
        {syndicatePass && (
          <div className="border border-yellow-500/40 bg-gradient-to-br from-yellow-500/10 to-yellow-950/20 p-6 rounded-lg shadow-[0_0_30px_rgba(250,204,21,0.15)]">
            <div className="flex items-center gap-3 mb-2">
              <Crown size={18} className="text-yellow-400" />
              <h3 className="text-sm font-bold text-yellow-400 uppercase tracking-widest">
                Premium Contraband
              </h3>
              <span className="px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/40 rounded text-[9px] font-bold text-yellow-400 uppercase tracking-widest">
                Most Wanted
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 mb-5 max-w-lg">
              The ultimate grind accelerator. Bypass the daily INF limit and earn without restrictions for 24 hours.
              Stack multiple purchases to extend the duration.
            </p>
            <div className="max-w-md">
              <MarketItem 
                icon={<Infinity size={18} />}
                title={syndicatePass.title}
                desc={syndicatePass.desc}
                cost={syndicatePass.cost}
                owned={getQuantity(syndicatePass.id)}
                onBuy={() => purchaseMutation.mutate(syndicatePass.id)}
                isPending={purchaseMutation.isPending}
                canAfford={(user?.influence || 0) >= syndicatePass.cost}
                premium
              />
            </div>
          </div>
        )}

        {/* Utility Items */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Zap size={16} className="text-purple-500" />
            Tactical Utilities
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {utilityItems.map(item => (
              <MarketItem 
                key={item.id}
                icon={item.icon}
                title={item.title}
                desc={item.desc}
                cost={item.cost}
                owned={getQuantity(item.id)}
                onBuy={() => purchaseMutation.mutate(item.id)}
                isPending={purchaseMutation.isPending}
                canAfford={(user?.influence || 0) >= item.cost}
              />
            ))}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}

function MarketItem({ title, desc, cost, icon, owned, onBuy, isPending, canAfford, premium }: { 
  title: string, desc: string, cost: number, icon: React.ReactNode, owned: number, 
  onBuy: () => void, isPending: boolean, canAfford: boolean, premium?: boolean 
}) {
  return (
    <div className={`border ${premium ? 'border-yellow-500/50 bg-yellow-950/20 hover:border-yellow-400' : 'border-zinc-800 bg-black/40 hover:border-yellow-500/30'} p-4 rounded transition-all group`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="text-zinc-500 group-hover:text-yellow-500 transition-colors">
          {icon}
        </div>
        <h4 className="font-bold text-zinc-200">{title}</h4>
        {owned > 0 && (
          <span className="ml-auto text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded font-bold uppercase">
            Owned: {owned}
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-400 mb-4 min-h-[3rem]">{desc}</p>
      <div className="flex justify-between items-center pt-3 border-t border-zinc-900/50">
        <span className="text-xs font-bold text-yellow-500">{cost} INF</span>
        <button 
          onClick={onBuy}
          disabled={isPending || !canAfford}
          className="px-3 py-1.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 rounded text-xs font-bold uppercase hover:bg-yellow-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {isPending ? <Loader2 size={12} className="animate-spin" /> : null}
          {canAfford ? 'Acquire' : 'Insufficient INF'}
        </button>
      </div>
    </div>
  );
}
