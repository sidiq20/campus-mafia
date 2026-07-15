"use client";

import { useState, useEffect } from 'react';
import { Crosshair, MessageSquare, Shield, ChevronRight, X, Skull } from 'lucide-react';

const STEPS = [
  {
    icon: <Crosshair size={24} />,
    title: 'Broadcast Intel',
    desc: 'Share encrypted messages with the entire network. Each broadcast earns you +10 INF. Use @mentions to tag other operatives.',
    color: 'text-green-400',
    border: 'border-green-500/30',
  },
  {
    icon: <Shield size={24} />,
    title: 'Join a Faction',
    desc: 'Align yourself with a syndicate to coordinate territory attacks, access faction comms, and participate in raids.',
    color: 'text-purple-400',
    border: 'border-purple-500/30',
  },
  {
    icon: <MessageSquare size={24} />,
    title: 'Earn & Spend INF',
    desc: 'Climb 42 ranks from Fresh Meat to Mythic Shadow. Buy items from the Black Market, send INF to allies, and dominate the leaderboard.',
    color: 'text-yellow-400',
    border: 'border-yellow-500/30',
  },
];

export default function OnboardingWalkthrough() {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const seen = localStorage.getItem('onboarding-seen');
    if (!seen) {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('onboarding-seen', 'true');
    setDismissed(true);
  };

  if (dismissed) return null;

  const s = STEPS[step];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={handleDismiss} />
      <div className="relative bg-zinc-950 border border-zinc-800 rounded-xl shadow-[0_0_60px_rgba(0,0,0,0.9)] max-w-md w-full p-8 animate-fade-in">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Skull size={16} className="text-green-500" />
            <span className="text-xs font-bold text-green-500 uppercase tracking-widest">Dept.OS Briefing</span>
          </div>
          <button onClick={handleDismiss} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-6 justify-center">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-green-500' : 'w-3 bg-zinc-800'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="text-center mb-8">
          <div className={`w-16 h-16 rounded-2xl bg-black border-2 ${s.border} flex items-center justify-center mx-auto mb-5 ${s.color}`}>
            {s.icon}
          </div>
          <h3 className={`text-lg font-bold ${s.color} uppercase tracking-widest mb-3`}>{s.title}</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">{s.desc}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 py-3 bg-green-500/10 border border-green-500/30 rounded-lg text-xs font-bold text-green-400 hover:bg-green-500/20 transition-all flex items-center justify-center gap-1.5"
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleDismiss}
              className="flex-1 py-3 bg-green-500/10 border border-green-500/30 rounded-lg text-xs font-bold text-green-400 hover:bg-green-500/20 transition-all"
            >
              Get Started
            </button>
          )}
        </div>

        {/* Skip */}
        <button
          onClick={handleDismiss}
          className="w-full mt-4 text-[9px] text-zinc-700 hover:text-zinc-500 uppercase tracking-widest transition-colors"
        >
          Skip tutorial
        </button>
      </div>
    </div>
  );
}
