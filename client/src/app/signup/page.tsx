"use client";

import { useState, useEffect } from 'react';
import { Skull, Mail, User, KeyRound, CheckCircle, ArrowRight, ArrowLeft, Save, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { API_URL, setToken } from '@/lib/api';

const STEPS = [
  { num: 1, label: 'Identity', desc: 'Username & Credentials' },
  { num: 2, label: 'Profile', desc: 'Display Name & Bio' },
  { num: 3, label: 'Allegiance', desc: 'Choose a Faction' },
];

const STORAGE_KEY = 'signup_progress';

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [tempToken, setTempToken] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    display_name: '',
    bio: '',
    faction_name: '',
  });

  // Restore progress from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.tempToken) {
          setTempToken(parsed.tempToken);
          setStep(parsed.step || 1);
          setFormData(prev => ({ ...prev, ...parsed.formData }));
        }
      }
    } catch {}
  }, []);

  const saveProgress = (newStep: number, token?: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tempToken: token || tempToken,
        step: newStep,
        formData,
      }));
    } catch {}
  };

  const clearProgress = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const handleStep1 = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/signup/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || data.message || 'Failed to start'); setLoading(false); return; }
      setTempToken(data.temp_token);
      saveProgress(2, data.temp_token);
      setStep(2);
    } catch { setError('Network error'); }
    setLoading(false);
  };

  const handleStep2 = async () => {
    setError('');
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/auth/signup/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          temp_token: tempToken,
          step: 2,
          data: { display_name: formData.display_name, bio: formData.bio },
        }),
      });
      saveProgress(3);
      setStep(3);
    } catch { setError('Failed to save'); }
    setSaving(false);
  };

  const handleStep3 = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/signup/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          temp_token: tempToken,
          display_name: formData.display_name,
          bio: formData.bio || null,
          faction_name: formData.faction_name || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Completion failed'); setLoading(false); return; }
      setToken(data.token);
      clearProgress();
      setSuccess(true);
      setTimeout(() => { window.location.href = '/factions'; }, 1500);
    } catch { setError('Network error'); }
    setLoading(false);
  };

  const goBack = () => {
    if (step > 1) {
      saveProgress(step - 1);
      setStep(step - 1);
    }
  };

  const progressPercent = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#09090b] text-zinc-100 font-mono relative overflow-hidden py-10">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
      <div className="relative z-10 w-full max-w-md p-10 border border-green-500/30 bg-black/80 backdrop-blur-xl rounded-2xl shadow-[0_0_50px_rgba(34,197,94,0.15)] mt-10 mb-10 animate-slide-in">
        <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-[50px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-[50px] pointer-events-none translate-y-1/2 -translate-x-1/2"></div>

        <div className="flex flex-col items-center mb-6 relative z-10">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500/50 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
            <Skull className="text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.8)] w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 uppercase drop-shadow-[0_0_10px_rgba(34,197,94,0.3)]">Dept.OS</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Network Access — Step {step} of {STEPS.length}</p>
        </div>

        {/* Progress Bar */}
        <div className="relative z-10 mb-8">
          <div className="flex justify-between mb-2">
            {STEPS.map(s => (
              <div key={s.num} className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  s.num < step ? 'bg-green-500/30 text-green-400 border border-green-500/50' :
                  s.num === step ? 'bg-green-500/20 text-green-400 border-2 border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' :
                  'bg-zinc-900 text-zinc-600 border border-zinc-800'
                }`}>
                  {s.num < step ? '✓' : s.num}
                </div>
                <span className={`text-[8px] mt-1 uppercase tracking-widest ${s.num === step ? 'text-green-400' : 'text-zinc-600'}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <div className="w-full h-1 bg-zinc-900 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {/* Success State */}
        {success && (
          <div className="relative z-10 p-4 border border-green-500/50 bg-green-500/10 rounded-lg flex items-center gap-3 animate-pulse mb-4">
            <CheckCircle className="text-green-400 w-5 h-5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-green-400">Clearance Granted</p>
              <p className="text-xs text-green-500/70">Redirecting to operations...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="relative z-10 p-3 border border-red-500/30 bg-red-500/10 rounded-lg mb-4">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <div className="relative z-10">
          {/* Step 1: Identity */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="group">
                <label className="block text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2">Codename (Username)</label>
                <div className="relative flex items-center">
                  <User className="absolute left-4 w-4 h-4 text-zinc-500 group-focus-within:text-green-500 transition-colors" />
                  <input type="text" required value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-12 pr-4 py-3 text-sm focus:border-green-500/50 outline-none transition-all"
                    placeholder="Unique handle..." />
                </div>
              </div>
              <div className="group">
                <label className="block text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2">Comms Address (Email)</label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-4 w-4 h-4 text-zinc-500 group-focus-within:text-green-500 transition-colors" />
                  <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-12 pr-4 py-3 text-sm focus:border-green-500/50 outline-none transition-all"
                    placeholder="alias@domain.com" />
                </div>
              </div>
              <div className="group">
                <label className="block text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2">Decryption Key</label>
                <div className="relative flex items-center">
                  <KeyRound className="absolute left-4 w-4 h-4 text-zinc-500 group-focus-within:text-green-500 transition-colors" />
                  <input type="password" required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-12 pr-4 py-3 text-sm focus:border-green-500/50 outline-none transition-all"
                    placeholder="••••••••" />
                </div>
              </div>
              <button onClick={handleStep1} disabled={loading || !formData.username || !formData.email || !formData.password}
                className="w-full mt-4 py-3 bg-green-500/10 text-green-400 border border-green-500/40 rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-green-500/20 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? 'Encrypting...' : 'Continue'} <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Step 2: Profile */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="group">
                <label className="block text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2">Display Name</label>
                <div className="relative flex items-center">
                  <User className="absolute left-4 w-4 h-4 text-zinc-500 group-focus-within:text-green-500 transition-colors" />
                  <input type="text" required value={formData.display_name} onChange={e => setFormData({...formData, display_name: e.target.value})}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-12 pr-4 py-3 text-sm focus:border-green-500/50 outline-none transition-all"
                    placeholder="How others see you..." />
                </div>
              </div>
              <div className="group">
                <label className="block text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2">Bio <span className="text-zinc-600 font-normal">(optional)</span></label>
                <div className="relative flex items-start">
                  <BookOpen className="absolute left-4 top-3.5 w-4 h-4 text-zinc-500 group-focus-within:text-green-500 transition-colors" />
                  <textarea value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-12 pr-4 py-3 text-sm focus:border-green-500/50 outline-none transition-all resize-none"
                    placeholder="Tell other operatives about yourself..." rows={3} />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={goBack} className="flex-1 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 transition-all flex items-center justify-center gap-2">
                  <ArrowLeft size={16} /> Back
                </button>
                <button onClick={handleStep2} disabled={!formData.display_name}
                  className="flex-1 py-3 bg-green-500/10 text-green-400 border border-green-500/40 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-green-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? 'Saving...' : 'Continue'} <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Faction */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-4 border border-zinc-800 bg-zinc-950/50 rounded-lg">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Choose a syndicate to align with. Each faction offers unique strategic advantages. You can also skip and join later.
                </p>
              </div>
              <div className="group">
                <label className="block text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2">Faction <span className="text-zinc-600 font-normal">(optional — join later)</span></label>
                <input type="text" value={formData.faction_name} onChange={e => setFormData({...formData, faction_name: e.target.value})}
                  className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:border-green-500/50 outline-none transition-all"
                  placeholder="Faction name or leave blank..." />
              </div>
              <div className="flex gap-3">
                <button onClick={goBack} className="flex-1 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 transition-all flex items-center justify-center gap-2">
                  <ArrowLeft size={16} /> Back
                </button>
                <button onClick={handleStep3} disabled={loading}
                  className="flex-1 py-3 bg-green-500/10 text-green-400 border border-green-500/40 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-green-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? 'Processing...' : 'Complete Enrollment'} <CheckCircle size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-zinc-900 text-center text-[10px] text-zinc-600 relative z-10">
          Already registered? <Link href="/login" className="text-green-500 hover:text-green-400 hover:underline transition-colors">Access Uplink</Link>
        </div>
      </div>
      <div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20 mix-blend-overlay"></div>
    </div>
  );
}
