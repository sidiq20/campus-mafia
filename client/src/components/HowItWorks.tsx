"use client";

import { useEffect, useRef, useState } from 'react';
import { Shield, TrendingUp, MapIcon, ArrowDown } from 'lucide-react';

const STEPS = [
  {
    icon: Shield,
    title: 'Join a Syndicate',
    desc: 'Choose from 5 pre-built factions — The Ravens, The Cartel, Ghost Protocol, The Syndicate, or 404. Or create your own for 500 INF.',
    color: 'text-green-400',
    border: 'border-green-500/30',
    bg: 'bg-green-500/10',
  },
  {
    icon: TrendingUp,
    title: 'Earn Influence',
    desc: 'Broadcast intel (+10 INF), boost other posts (+1 INF), win territory battles, and complete bounties. Climb 42 ranks from Initiate to Director.',
    color: 'text-yellow-400',
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/10',
  },
  {
    icon: MapIcon,
    title: 'Dominate Territory',
    desc: 'Capture and defend 12 campus zones. Plan 30-minute raids with your faction. Use Black Market assets like Cyber Nukes and Firewall Upgrades.',
    color: 'text-orange-400',
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/10',
  },
];

export default function HowItWorks() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="max-w-5xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest mb-2">// Operation Protocol</h2>
        <p className="text-xs text-zinc-600">Three steps to dominate the campus underground</p>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-0 relative">
        {STEPS.map((step, i) => (
          <div key={i} className="flex-1 relative">
            {/* Connecting arrow */}
            {i < STEPS.length - 1 && (
              <>
                {/* Desktop: horizontal arrow */}
                <div className="hidden md:block absolute top-12 left-[60%] w-[40%] z-10">
                  <div className="relative flex items-center">
                    <div className="flex-1 h-px bg-gradient-to-r from-green-500/40 to-transparent" />
                    <ArrowDown size={12} className="text-green-500/40 -rotate-90 ml-1" />
                  </div>
                </div>
                {/* Mobile: vertical arrow */}
                <div className="md:hidden flex justify-center py-2">
                  <div className="w-px h-8 bg-gradient-to-b from-green-500/40 to-transparent" />
                </div>
              </>
            )}

            <div
              className={`text-center p-6 border ${step.border} ${step.bg} rounded-xl backdrop-blur-sm transition-all duration-700 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${i * 200}ms` }}
            >
              {/* Step number */}
              <div className="flex items-center justify-center mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${step.bg} border ${step.border} shadow-[0_0_20px_rgba(34,197,94,0.1)]`}>
                  <step.icon size={20} className={step.color} />
                </div>
              </div>

              <span className={`text-[10px] font-bold uppercase tracking-widest ${step.color} mb-2 block`}>
                Step {i + 1}
              </span>
              <h3 className="text-sm font-bold text-zinc-200 mb-3">{step.title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
