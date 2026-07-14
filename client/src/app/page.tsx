import Link from 'next/link';
import { Skull, ChevronRight, Shield, Zap, Terminal, Globe } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-[#050505] text-zinc-100 font-mono relative">
      {/* Cyberpunk background elements */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
      
      <main className="relative z-10 container mx-auto px-6 py-16">
        {/* Header - Full Width */}
        <header className="text-center mb-20 animate-slide-in">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500/50 mb-8 shadow-[0_0_50px_rgba(34,197,94,0.3)]">
            <Skull className="text-green-400 drop-shadow-[0_0_15px_rgba(34,197,94,0.8)] w-12 h-12" />
          </div>
          <h1 
            className="glitch text-6xl md:text-8xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-green-300 via-green-500 to-emerald-700 uppercase drop-shadow-[0_0_30px_rgba(34,197,94,0.4)] mb-8 animate-flicker"
            data-text="Dept.OS"
          >
            Dept.OS
          </h1>
          <p className="text-xl text-zinc-400 leading-relaxed max-w-2xl mx-auto font-medium">
            Dominate the university underground. Factions, Territory, Influence.
          </p>
        </header>

        {/* Split Content Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left Column - Game Details */}
          <div className="space-y-12 animate-slide-in [animation-delay:200ms]">
            <section className="p-8 border border-zinc-800 bg-black/40 rounded-lg hover:border-green-500/30 transition-all duration-500">
              <h2 className="text-2xl font-bold text-green-400 mb-6 flex items-center gap-3">
                <Terminal className="text-green-500" /> Core Mechanics
              </h2>
              <ul className="space-y-6 text-zinc-400 text-sm leading-relaxed">
                <li className="flex gap-4">
                  <span className="text-green-600 font-bold">01.</span>
                  <div><strong className="text-zinc-200">Faction Warfare:</strong> Align with syndicates, coordinate encrypted attacks on university zones, and hold territory for passive INF income.</div>
                </li>
                <li className="flex gap-4">
                  <span className="text-green-600 font-bold">02.</span>
                  <div><strong className="text-zinc-200">Influence (INF):</strong> The lifeblood of the underworld. Earned via active participation, social engagement, and successful hacks.</div>
                </li>
                <li className="flex gap-4">
                  <span className="text-green-600 font-bold">03.</span>
                  <div><strong className="text-zinc-200">Black Market:</strong> Purchase tactical assets: DDoS tools, identity scramblers, and firewall upgrades.</div>
                </li>
              </ul>
            </section>
          </div>

          {/* Right Column - Call to Action */}
          <div className="space-y-8 animate-slide-in [animation-delay:400ms]">
            <div className="p-10 border border-green-500/20 bg-green-500/5 rounded-2xl text-center shadow-[0_0_50px_rgba(34,197,94,0.1)]">
              <h3 className="text-3xl font-extrabold text-green-400 mb-6 animate-pulse-glow">Initialize Uplink</h3>
              <p className="text-zinc-400 mb-10">Access the campus network and start your rise to power.</p>
              
              <div className="flex flex-col gap-4">
                <Link 
                  href="/signup" 
                  className="group flex items-center justify-center gap-3 w-full px-10 py-4 bg-green-500/10 text-green-400 border border-green-500/50 rounded hover:bg-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.2)] hover:-translate-y-1 transition-all duration-300 font-bold uppercase tracking-widest"
                >
                  Request Clearance
                  <ChevronRight size={18} />
                </Link>
                
                <Link 
                  href="/login" 
                  className="w-full px-10 py-4 bg-zinc-900 border border-zinc-800 rounded text-zinc-400 hover:text-green-400 hover:border-green-500/30 hover:bg-zinc-800 transition-all duration-300 font-bold uppercase tracking-widest"
                >
                  Terminal Access
                </Link>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 border border-zinc-800 bg-black/40 rounded-lg text-center hover:border-blue-500/30 transition-colors">
                <Shield className="w-8 h-8 text-blue-500 mx-auto mb-3" />
                <div className="text-sm text-zinc-300">Secure Protocol</div>
              </div>
              <div className="p-6 border border-zinc-800 bg-black/40 rounded-lg text-center hover:border-yellow-500/30 transition-colors">
                <Zap className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
                <div className="text-sm text-zinc-300">Rapid Expansion</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Cyberpunk Scanline Overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20 mix-blend-overlay"></div>
    </div>
  );
}
