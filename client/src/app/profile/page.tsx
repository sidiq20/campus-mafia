"use client";

import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/contexts/UserContext';
import { User, Shield, Zap, Target, AlertTriangle, TrendingUp } from 'lucide-react';
import { RankBadgeFull } from '@/components/RankBadge';

export default function ProfilePage() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center bg-[#050505] text-green-500 animate-pulse">
          Decrypting profile data...
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout>
      <header className="h-14 border-b border-green-500/20 flex items-center px-6 bg-black/40 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">Operative Profile</h2>
      </header>

      <div className="flex-1 p-6 pb-24 overflow-y-auto bg-[#050505]">
        <div className="max-w-2xl mx-auto space-y-6">
          
          {/* Header Card */}
          <div className="border border-green-500/30 bg-black/80 backdrop-blur-xl p-8 rounded-lg relative overflow-hidden shadow-[0_0_40px_rgba(34,197,94,0.1)]">
            <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-purple-500/10 rounded-full blur-[60px] pointer-events-none"></div>
            
            <div className="flex flex-col md:flex-row items-start md:items-center gap-8 relative z-10">
              {/* Avatar */}
              <div className="w-24 h-24 rounded-xl bg-black border-2 border-green-500/50 flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.2)] shrink-0">
                <User size={48} className="text-green-500" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="inline-block px-3 py-1 bg-green-500/10 border border-green-500/30 rounded text-[10px] font-bold text-green-400 mb-2 uppercase tracking-widest">Operative Profile</div>
                <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 tracking-tighter mb-1 drop-shadow-[0_0_10px_rgba(34,197,94,0.2)]">@{user.username}</h1>
                <p className="text-green-500/50 font-mono text-sm">{user.email}</p>
                
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-lg">
                  <Shield size={14} className={user.faction_name ? "text-purple-500" : "text-zinc-500"} />
                  <span className="text-xs font-bold text-zinc-300">
                    {user.faction_name ? `Syndicate: ${user.faction_name}` : 'Unaffiliated / Lone Wolf'}
                  </span>
                </div>
              </div>

              {/* Rank Badge */}
              <div className="w-full md:w-auto shrink-0">
                <RankBadgeFull rank={user.rank} influence={user.influence} />
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-zinc-800 bg-black/40 p-5 rounded">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="text-yellow-500" size={18} />
                <h3 className="text-sm font-bold text-zinc-400 uppercase">Influence</h3>
              </div>
              <p className="text-3xl font-bold text-zinc-100">{user.influence}</p>
              <p className="text-xs text-zinc-600 mt-1">Total power projected</p>
            </div>

            <div className="border border-zinc-800 bg-black/40 p-5 rounded">
              <div className="flex items-center gap-2 mb-3">
                <Target className="text-blue-500" size={18} />
                <h3 className="text-sm font-bold text-zinc-400 uppercase">Reputation</h3>
              </div>
              <p className="text-3xl font-bold text-zinc-100">{user.reputation}</p>
              <p className="text-xs text-zinc-600 mt-1">Street cred standing</p>
            </div>

            <div className="border border-zinc-800 bg-black/40 p-5 rounded">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="text-red-500" size={18} />
                <h3 className="text-sm font-bold text-zinc-400 uppercase">Heat Level</h3>
              </div>
              <p className="text-3xl font-bold text-zinc-100">{user.heat_level}%</p>
              <p className="text-xs text-zinc-600 mt-1">System monitoring risk</p>
            </div>
          </div>

          {/* Activity Log (Mock for now) */}
          <div className="border border-zinc-800 bg-black/40 p-6 rounded">
            <h3 className="text-sm font-bold text-zinc-400 uppercase mb-4">Recent Operations</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
                <span className="text-sm text-zinc-300">Profile initialized in system</span>
                <span className="text-xs text-zinc-600">Account Creation</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
