"use client";

import { useState } from 'react';
import { Skull, ShieldAlert, KeyRound, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { API_URL, setToken } from '@/lib/api';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({ username: '', password: '' });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
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
        setError(err || 'Invalid credentials');
      }
    } catch {
      setError('Network error — backend may be offline');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#09090b] text-zinc-100 font-mono relative overflow-hidden">
      {/* Cyberpunk background elements */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/10 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-md p-8 border border-green-500/30 bg-black/80 backdrop-blur-md rounded-lg shadow-[0_0_50px_rgba(34,197,94,0.1)]">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/50 flex items-center justify-center mb-4">
            <Skull className="text-green-500 w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tighter text-green-500 uppercase glow-text">Dept.OS</h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1">Authorized Personnel Only</p>
        </div>

        {/* Success State */}
        {success && (
          <div className="mb-6 p-4 border border-green-500/50 bg-green-500/10 rounded flex items-center gap-3 animate-pulse">
            <CheckCircle className="text-green-500 w-5 h-5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-green-400">Identity Verified</p>
              <p className="text-xs text-green-500/70">Redirecting to dashboard...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mb-6 p-3 border border-red-500/30 bg-red-500/10 rounded">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs text-green-500 uppercase tracking-widest mb-1.5">Alias or Email</label>
            <div className="relative flex items-center">
              <ShieldAlert className="absolute left-3 w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                required
                disabled={success}
                value={formData.username}
                onChange={e => setFormData({...formData, username: e.target.value})}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded pl-10 pr-4 py-2.5 text-sm focus:border-green-500/50 outline-none transition-colors disabled:opacity-50"
                placeholder="Enter alias or email..."
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-green-500 uppercase tracking-widest mb-1.5">Decryption Key</label>
            <div className="relative flex items-center">
              <KeyRound className="absolute left-3 w-4 h-4 text-zinc-500" />
              <input 
                type="password" 
                required
                disabled={success}
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded pl-10 pr-4 py-2.5 text-sm focus:border-green-500/50 outline-none transition-colors disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || success}
            className={`w-full mt-6 py-3 rounded text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
              success 
                ? 'bg-green-500/20 text-green-400 border border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                : 'bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)]'
            }`}
          >
            {success ? '✓ Access Granted' : loading ? 'Authenticating...' : 'Initialize Uplink'}
          </button>
        </form>

        <div className="mt-8 pt-4 border-t border-zinc-900 text-center text-xs text-zinc-500">
          Unregistered? <Link href="/signup" className="text-green-500 hover:underline">Request Access</Link>
        </div>
      </div>
      
      {/* Cyberpunk Scanline Overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20 mix-blend-overlay"></div>
    </div>
  );
}
