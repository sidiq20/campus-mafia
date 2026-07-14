"use client";

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/contexts/UserContext';
import { User, Shield, Zap, Target, AlertTriangle, Edit2, Check, X, CalendarDays, Award, MessageSquare, Radio, TrendingUp } from 'lucide-react';
import { RankBadgeFull } from '@/components/RankBadge';
import { TitleSection } from '@/components/TitleBadge';
import { DailyInfTracker } from '@/components/DailyInfTracker';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

// Types for profile data
type ProfileBroadcast = {
  id: string;
  content: string;
  channel_type: string;
  created_at: string;
};

type BoostedPost = {
  id: string;
  content: string;
  author_name: string;
  created_at: string;
};

export default function ProfilePage() {
  const { user, isLoading, refetch } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const handleUpdate = async () => {
    try {
      const res = await apiFetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName })
      });
      if (!res.ok) throw new Error('Update failed');
      toast.success('Profile updated');
      setIsEditing(false);
      refetch();
    } catch {
      toast.error('Update failed');
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center bg-[#050505] text-green-500 animate-pulse">
          Decrypting profile data...
        </div>
      </DashboardLayout>
    );
  }

  if (!user) return null;

  return (
    <DashboardLayout>
      <header className="h-14 border-b border-zinc-800 flex items-center px-6 bg-black">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Operative Profile</h2>
      </header>

      <div className="flex-1 p-6 pb-24 overflow-y-auto bg-[#050505]">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Header Card */}
          <div className="relative border border-zinc-800 bg-zinc-900/40 p-8 rounded-2xl overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-transparent"></div>
            
            <div className="relative flex flex-col md:flex-row items-center gap-8">
              <div className="w-28 h-28 rounded-2xl bg-black border border-zinc-700 flex items-center justify-center shadow-inner shrink-0">
                <User size={56} className="text-zinc-600" />
              </div>
              
              <div className="flex-1 text-center md:text-left">
                {isEditing ? (
                  <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                    <input 
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      className="bg-black border border-green-500/50 rounded px-3 py-1 text-3xl font-bold text-white outline-none"
                    />
                    <button onClick={handleUpdate} className="text-green-500 hover:text-green-400 p-1"><Check size={24}/></button>
                    <button onClick={() => setIsEditing(false)} className="text-red-500 hover:text-red-400 p-1"><X size={24}/></button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                    <h1 className="text-4xl font-extrabold text-white tracking-tighter">{user.display_name}</h1>
                    <button onClick={() => { setDisplayName(user.display_name); setIsEditing(true); }} className="text-zinc-500 hover:text-green-400">
                      <Edit2 size={18} />
                    </button>
                  </div>
                )}
                <p className="text-zinc-500 font-mono text-sm mb-4">@{user.username}</p>
                
                <div className="flex flex-wrap justify-center md:justify-start gap-3">
                  <div className="flex items-center gap-2 px-3 py-1 bg-black border border-zinc-800 rounded-full text-xs text-zinc-400">
                    <Shield size={14} className={user.faction_name ? "text-purple-500" : "text-zinc-600"} />
                    {user.faction_name || 'Unaffiliated'}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-black border border-zinc-800 rounded-full text-xs text-zinc-400">
                    <CalendarDays size={14} />
                    Joined {new Date(user.created_at || Date.now()).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <RankBadgeFull rank={user.rank} influence={user.influence} />
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Influence', value: user.influence, icon: Zap, color: 'text-yellow-500' },
              { label: 'Reputation', value: user.reputation, icon: Target, color: 'text-blue-500' },
              { label: 'Heat Level', value: `${user.heat_level}%`, icon: AlertTriangle, color: 'text-red-500' },
            ].map((stat, i) => (
              <div key={i} className="border border-zinc-800 bg-zinc-900/30 p-5 rounded-xl hover:border-zinc-700 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <stat.icon className={stat.color} size={20} />
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{stat.label}</h3>
                </div>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
              </div>
            ))}
          </div>

          <DailyInfTracker />

          <div className="border border-zinc-800 bg-zinc-900/30 p-6 rounded-xl">
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Award size={18} className="text-green-500" /> Titles
            </h3>
            <TitleSection />
          </div>

          {/* Broadcasts Section */}
          <ProfileBroadcastsSection />

          {/* Boosted Posts Section */}
          <ProfileBoostedSection />

        </div>
      </div>
    </DashboardLayout>
  );
}

function ProfileBroadcastsSection() {
  const { user } = useUser();
  const { data: broadcasts, isLoading } = useQuery<ProfileBroadcast[]>({
    queryKey: ['profile-broadcasts'],
    queryFn: async () => {
      const res = await apiFetch('/api/profile/broadcasts');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  return (
    <div className="border border-zinc-800 bg-zinc-900/30 p-6 rounded-xl">
      <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Radio size={18} className="text-green-500" /> Recent Transmissions
      </h3>
      {isLoading ? (
        <p className="text-xs text-zinc-600 animate-pulse">Decrypting logs...</p>
      ) : !broadcasts || broadcasts.length === 0 ? (
        <p className="text-xs text-zinc-600 italic">No transmissions yet.</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {broadcasts.map(b => (
            <div key={b.id} className="border border-zinc-800 bg-black/30 p-4 rounded-lg hover:border-green-500/20 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-green-600">
                  {b.channel_type === 'global' ? 'Global Channel' : 'Faction Channel'}
                </span>
                <span className="text-[9px] font-mono text-zinc-600">
                  {new Date(b.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{b.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileBoostedSection() {
  const { user } = useUser();
  const { data: boosted, isLoading } = useQuery<BoostedPost[]>({
    queryKey: ['profile-boosted'],
    queryFn: async () => {
      const res = await apiFetch('/api/profile/boosted');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  return (
    <div className="border border-zinc-800 bg-zinc-900/30 p-6 rounded-xl">
      <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <TrendingUp size={18} className="text-yellow-500" /> Boosted Intel
      </h3>
      {isLoading ? (
        <p className="text-xs text-zinc-600 animate-pulse">Scanning...</p>
      ) : !boosted || boosted.length === 0 ? (
        <p className="text-xs text-zinc-600 italic">No boosted intel yet.</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {boosted.map(p => (
            <div key={p.id} className="border border-zinc-800 bg-black/30 p-4 rounded-lg hover:border-yellow-500/20 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold text-yellow-600 uppercase tracking-widest">
                  By {p.author_name}
                </span>
                <span className="text-[9px] font-mono text-zinc-600">
                  {new Date(p.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{p.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}