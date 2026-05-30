"use client";

import DashboardLayout from '@/components/DashboardLayout';
import { Zap, Tag, Skull, Fingerprint, Shield, Bomb, Package, Loader2 } from 'lucide-react';
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
    desc: 'Instantly deals 50 damage to an enemy territory\'s defense score. Bypasses normal attack RNG.',
    cost: 500,
    icon: <Bomb />,
    category: 'attack',
  },
  {
    id: 'ddos_attack',
    title: 'DDoS Attack',
    desc: 'Sabotages an enemy faction for 1 hour — they cannot launch territory attacks while under DDoS.',
    cost: 1000,
    icon: <Skull />,
    category: 'attack',
  },
  {
    id: 'firewall_upgrade',
    title: 'Firewall Upgrade',
    desc: 'Adds +50 Defense Score to a territory your faction controls. Deploy from the Territory Map.',
    cost: 400,
    icon: <Shield />,
    category: 'defense',
  },
  {
    id: 'propaganda_boost',
    title: 'Propaganda Boost',
    desc: 'Doubles the INF earned from all your broadcasts for 30 minutes. Auto-activates on purchase.',
    cost: 250,
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

  const attackItems = ITEMS.filter(i => i.category === 'attack');
  const defenseItems = ITEMS.filter(i => i.category === 'defense');
  const utilityItems = ITEMS.filter(i => i.category === 'economy' || i.category === 'stealth');

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

function MarketItem({ title, desc, cost, icon, owned, onBuy, isPending, canAfford }: { 
  title: string, desc: string, cost: number, icon: React.ReactNode, owned: number, 
  onBuy: () => void, isPending: boolean, canAfford: boolean 
}) {
  return (
    <div className="border border-zinc-800 bg-black/40 p-4 rounded hover:border-yellow-500/30 transition-all group">
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
