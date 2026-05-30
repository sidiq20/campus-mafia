"use client";

import { useState } from 'react';
import { Skull, Mail, User, KeyRound, Building2, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { API_URL, setToken } from '@/lib/api';

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({ username: '', email: '', faction_name: '', password: '' });

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/feed';
        }, 1200);
      } else {
        const err = await res.text();
        setError(err || 'Registration failed');
      }
    } catch {
      setError('Network error — backend may be offline');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#09090b] text-zinc-100 font-mono relative overflow-hidden py-10">
      {/* Cyberpunk background elements */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-md p-8 border border-purple-500/30 bg-black/80 backdrop-blur-md rounded-lg shadow-[0_0_50px_rgba(168,85,247,0.1)]">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/50 flex items-center justify-center mb-4">
            <Skull className="text-purple-500 w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tighter text-purple-500 uppercase glow-text">Dept.OS</h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1">Request Network Access</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          {/* Success State */}
          {success && (
            <div className="p-4 border border-purple-500/50 bg-purple-500/10 rounded flex items-center gap-3 animate-pulse">
              <CheckCircle className="text-purple-400 w-5 h-5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-purple-400">Clearance Granted</p>
                <p className="text-xs text-purple-500/70">Redirecting to dashboard...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-3 border border-red-500/30 bg-red-500/10 rounded">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-xs text-purple-500 uppercase tracking-widest mb-1.5">Netrunner Alias</label>
            <div className="relative flex items-center">
              <User className="absolute left-3 w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                required
                value={formData.username}
                onChange={e => setFormData({...formData, username: e.target.value})}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded pl-10 pr-4 py-2.5 text-sm focus:border-purple-500/50 outline-none transition-colors"
                placeholder="Choose alias..."
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-purple-500 uppercase tracking-widest mb-1.5">Comms Address (Email)</label>
            <div className="relative flex items-center">
              <Mail className="absolute left-3 w-4 h-4 text-zinc-500" />
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded pl-10 pr-4 py-2.5 text-sm focus:border-purple-500/50 outline-none transition-colors"
                placeholder="alias@domain.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-purple-500 uppercase tracking-widest mb-1.5">Select Faction</label>
            <div className="relative flex items-center">
              <Building2 className="absolute left-3 w-4 h-4 text-zinc-500" />
              <select 
                required
                value={formData.faction_name}
                onChange={e => setFormData({...formData, faction_name: e.target.value})}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded pl-10 pr-4 py-2.5 text-sm focus:border-purple-500/50 outline-none transition-colors appearance-none text-zinc-300"
              >
                <option value="" disabled>Select Allegiance...</option>
                <option value="The Ravens">The Ravens</option>
                <option value="The Cartel">The Cartel</option>
                <option value="Ghost Protocol">Ghost Protocol</option>
                <option value="The Syndicate">The Syndicate</option>
                <option value="404">404</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-purple-500 uppercase tracking-widest mb-1.5">Decryption Key</label>
            <div className="relative flex items-center">
              <KeyRound className="absolute left-3 w-4 h-4 text-zinc-500" />
              <input 
                type="password" 
                required
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded pl-10 pr-4 py-2.5 text-sm focus:border-purple-500/50 outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || success}
            className={`w-full mt-6 py-3 rounded text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
              success
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.3)]'
                : 'bg-purple-500/10 text-purple-500 border border-purple-500/30 hover:bg-purple-500/20 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]'
            }`}
          >
            {success ? '✓ Clearance Granted' : loading ? 'Encrypting...' : 'Submit Clearance'}
          </button>
        </form>

        <div className="mt-8 pt-4 border-t border-zinc-900 text-center text-xs text-zinc-500">
          Already registered? <Link href="/login" className="text-purple-500 hover:underline">Access Uplink</Link>
        </div>
      </div>
      
      {/* Cyberpunk Scanline Overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20 mix-blend-overlay"></div>
    </div>
  );
}
