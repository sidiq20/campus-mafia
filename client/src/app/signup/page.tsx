"use client";

import { useState } from 'react';
import { Skull, Mail, User, KeyRound, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { API_URL, setToken } from '@/lib/api';

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({ display_name: '', username: '', email: '', password: '' });

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
          window.location.href = '/factions';
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
      <div className="relative z-10 w-full max-w-md p-10 border border-green-500/30 bg-black/80 backdrop-blur-xl rounded-2xl shadow-[0_0_50px_rgba(34,197,94,0.15)] mt-10 mb-10 animate-slide-in">
        <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-[50px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-[50px] pointer-events-none translate-y-1/2 -translate-x-1/2"></div>

        <div className="flex flex-col items-center mb-10 relative z-10">
          <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/50 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
            <Skull className="text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.8)] w-10 h-10" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 uppercase drop-shadow-[0_0_10px_rgba(34,197,94,0.3)] animate-pulse-glow">Dept.OS</h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mt-2">Request Network Access</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-5 relative z-10">
          {/* Success State */}
          {success && (
            <div className="p-4 border border-green-500/50 bg-green-500/10 rounded-lg flex items-center gap-3 animate-pulse">
              <CheckCircle className="text-green-400 w-5 h-5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-400">Clearance Granted</p>
                <p className="text-xs text-green-500/70">Redirecting to dashboard...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-3 border border-red-500/30 bg-red-500/10 rounded-lg">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
          
          <div className="group">
            <label className="block text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2 group-focus-within:text-green-400 transition-colors">Display Name</label>
            <div className="relative flex items-center">
              <User className="absolute left-4 w-4 h-4 text-zinc-500 group-focus-within:text-green-500 transition-colors" />
              <input 
                type="text" 
                required
                value={formData.display_name}
                onChange={e => setFormData({...formData, display_name: e.target.value})}
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-12 pr-4 py-3.5 text-sm focus:border-green-500/50 focus:bg-green-950/10 outline-none transition-all shadow-inner"
                placeholder="Real name/Alias..."
              />
            </div>
          </div>

          <div className="group">
            <label className="block text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2 group-focus-within:text-green-400 transition-colors">Unique Username</label>
            <div className="relative flex items-center">
              <User className="absolute left-4 w-4 h-4 text-zinc-500 group-focus-within:text-green-500 transition-colors" />
              <input 
                type="text" 
                required
                value={formData.username}
                onChange={e => setFormData({...formData, username: e.target.value})}
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-12 pr-4 py-3.5 text-sm focus:border-green-500/50 focus:bg-green-950/10 outline-none transition-all shadow-inner"
                placeholder="Unique username for DMs..."
              />
            </div>
          </div>

          <div className="group">
            <label className="block text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2 group-focus-within:text-green-400 transition-colors">Comms Address (Email)</label>
            <div className="relative flex items-center">
              <Mail className="absolute left-4 w-4 h-4 text-zinc-500 group-focus-within:text-green-500 transition-colors" />
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-12 pr-4 py-3.5 text-sm focus:border-green-500/50 focus:bg-green-950/10 outline-none transition-all shadow-inner"
                placeholder="alias@domain.com"
              />
            </div>
          </div>

          <div className="group">
            <label className="block text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2 group-focus-within:text-green-400 transition-colors">Decryption Key</label>
            <div className="relative flex items-center">
              <KeyRound className="absolute left-4 w-4 h-4 text-zinc-500 group-focus-within:text-green-500 transition-colors" />
              <input 
                type="password" 
                required
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-12 pr-4 py-3.5 text-sm focus:border-green-500/50 focus:bg-green-950/10 outline-none transition-all shadow-inner"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || success}
            className={`w-full mt-6 py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
              success
                ? 'bg-green-500/20 text-green-400 border border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                : 'bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)]'
            }`}
          >
            {success ? '✓ Clearance Granted' : loading ? 'Encrypting...' : 'Submit Clearance'}
          </button>
        </form>

        <div className="mt-8 pt-4 border-t border-zinc-900 text-center text-xs text-zinc-500 relative z-10">
          Already registered? <Link href="/login" className="text-green-500 hover:text-green-400 hover:underline transition-colors">Access Uplink</Link>
        </div>
      </div>
      
      {/* Cyberpunk Scanline Overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20 mix-blend-overlay"></div>
    </div>
  );
}
