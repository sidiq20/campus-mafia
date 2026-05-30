"use client";

import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/contexts/UserContext';
import { User, Shield, Zap, Target, AlertTriangle } from 'lucide-react';

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
          <div className="border border-green-500/30 bg-green-500/5 p-6 rounded flex items-start gap-6">
            <div className="w-20 h-20 bg-black border border-green-500/50 rounded flex items-center justify-center">
              <User size={40} className="text-green-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">@{user.username}</h1>
              <p className="text-green-500/70 font-mono text-sm mt-1">{user.email}</p>
              
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded">
                <Shield size={14} className={user.faction_name ? "text-purple-500" : "text-zinc-500"} />
                <span className="text-xs font-bold text-zinc-300">
                  {user.faction_name ? `Syndicate: ${user.faction_name}` : 'Unaffiliated / Lone Wolf'}
                </span>
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
