import Link from 'next/link';
import { Skull, ChevronRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen w-full bg-[#050505] text-zinc-100 font-mono relative overflow-hidden items-center justify-center">
      {/* Cyberpunk background elements */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-green-500/5 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="relative z-10 text-center max-w-2xl px-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 border border-green-500/50 mb-8 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
          <Skull className="text-green-500 w-10 h-10" />
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-green-500 uppercase glow-text mb-6">
          Dept.OS
        </h1>
        
        <p className="text-lg text-zinc-400 mb-10 leading-relaxed">
          The campus is no longer just a school. It's a battleground. Join a faction, control territory, spread propaganda, and dominate the digital underworld of your university.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
          <Link 
            href="/signup" 
            className="flex items-center gap-2 px-8 py-4 bg-green-500/10 text-green-500 border border-green-500/50 rounded text-sm font-bold uppercase tracking-widest hover:bg-green-500/20 hover:shadow-[0_0_20px_rgba(34,197,94,0.4)] transition-all"
          >
            Request Clearance
            <ChevronRight size={16} />
          </Link>
          
          <Link 
            href="/login" 
            className="px-8 py-4 bg-zinc-900 border border-zinc-800 rounded text-sm font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
          >
            Terminal Access
          </Link>
        </div>

        {/* How to Play Section */}
        <div className="text-left border border-zinc-800 bg-black/60 backdrop-blur-md p-8 rounded-lg mb-20 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-green-500 uppercase tracking-widest mb-6 border-b border-zinc-800 pb-4">Operator Briefing // How to Play</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-bold text-zinc-200 mb-2">1. Choose Your Faction</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Align yourself with a powerful syndicate. Your faction dictates your encrypted comms and shared territory control. Work together or fall alone.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-bold text-zinc-200 mb-2">2. Gain Influence (INF)</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Influence is the currency of the underground. Broadcast intel on the global feed, get boosted by allies, and interact to farm INF.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-zinc-200 mb-2">3. Control Territories</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Spend INF to launch cyber-attacks on rival campus zones. Coordinate with your faction to break high-defense firewalls and claim the territory.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-zinc-200 mb-2">4. Access the Black Market</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Use your INF to buy tactical advantages: DDoS attacks, Identity Scramblers for anonymous posting, or Firewall upgrades to defend your turf.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Cyberpunk Scanline Overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20 mix-blend-overlay"></div>
    </div>
  );
}
