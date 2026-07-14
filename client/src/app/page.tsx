import Link from 'next/link';
import { Skull, ChevronRight, Globe, MessageSquare, Users, Swords, TrendingUp, Award, Smartphone, Radio, Search, User, Bomb, Lock } from 'lucide-react';

const features = [
  {
    icon: Swords,
    title: 'Faction Warfare',
    desc: 'Join or create syndicates, coordinate with encrypted faction comms, and dominate the university underground.',
    color: 'text-green-400',
    border: 'hover:border-green-500/30',
  },
  {
    icon: Globe,
    title: 'Territory Control',
    desc: 'Capture and defend campus zones. Plan raids with your faction — propose attacks, pool INF during a 30-min planning window, and strike together.',
    color: 'text-orange-400',
    border: 'hover:border-orange-500/30',
  },
  {
    icon: TrendingUp,
    title: 'Influence (INF)',
    desc: 'The lifeblood of the underworld. Earn INF through broadcasts, comments, boosts, and reposts. Climb 42 ranks from Fresh Meat to Mythic Shadow.',
    color: 'text-yellow-400',
    border: 'hover:border-yellow-500/30',
  },
  {
    icon: MessageSquare,
    title: 'Live Feed',
    desc: 'Real-time encrypted broadcasts with boosts, replies, reposts, and @mentions. Search intel and operatives across the network.',
    color: 'text-blue-400',
    border: 'hover:border-blue-500/30',
  },
  {
    icon: Radio,
    title: 'Encrypted Comms',
    desc: 'Global and faction-specific chat channels with real-time WebSocket streaming. Coordinate operations in complete secrecy.',
    color: 'text-purple-400',
    border: 'hover:border-purple-500/30',
  },
  {
    icon: Lock,
    title: 'Direct Messaging',
    desc: 'Private encrypted DMs with reactions, reply threading, read receipts, and typing indicators. Real-time message delivery.',
    color: 'text-cyan-400',
    border: 'hover:border-cyan-500/30',
  },
  {
    icon: Bomb,
    title: 'Black Market',
    desc: 'Purchase tactical assets: Cyber Nukes (-50 DEF), Firewall Upgrades (+50 DEF), DDoS attacks, INF cap bypasses, and Propaganda Boosts.',
    color: 'text-red-400',
    border: 'hover:border-red-500/30',
  },
  {
    icon: Award,
    title: 'Ranks & Titles',
    desc: '42 ranks across 7 tiers (Street → Mythic). Unlock achievement titles for broadcasting, boosting, raiding, and leadership.',
    color: 'text-green-400',
    border: 'hover:border-green-500/30',
  },
  {
    icon: Users,
    title: 'Leaderboards',
    desc: 'Compete for the top spot on faction and player leaderboards. Dominate territory counts and influence standings.',
    color: 'text-yellow-400',
    border: 'hover:border-yellow-500/30',
  },
  {
    icon: User,
    title: 'Operative Profiles',
    desc: 'Custom bios, editable display names, pinned broadcasts, rank badges, title showcases, and personal broadcast history.',
    color: 'text-blue-400',
    border: 'hover:border-blue-500/30',
  },
  {
    icon: Smartphone,
    title: 'PWA + Push',
    desc: 'Install as a native app with offline support, push notifications for DMs and mentions, and full mobile-optimized UI.',
    color: 'text-green-400',
    border: 'hover:border-green-500/30',
  },
  {
    icon: Search,
    title: 'Global Search',
    desc: 'Search across users, broadcasts, and intel. Find operatives by name or discover intel by keyword across the entire network.',
    color: 'text-zinc-400',
    border: 'hover:border-zinc-500/30',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-[#050505] text-zinc-100 font-mono relative">
      {/* Cyberpunk background elements */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
      
      <main className="relative z-10 container mx-auto px-6 py-16">
        {/* Header */}
        <header className="text-center mb-24 animate-slide-in">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500/50 mb-8 shadow-[0_0_50px_rgba(34,197,94,0.3)]">
            <Skull className="text-green-400 drop-shadow-[0_0_15px_rgba(34,197,94,0.8)] w-12 h-12" />
          </div>
          <h1 
            className="text-6xl md:text-8xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-green-300 via-green-500 to-emerald-700 uppercase drop-shadow-[0_0_30px_rgba(34,197,94,0.4)] mb-8"
          >
            Dept.OS
          </h1>
          <p className="text-xl text-zinc-400 leading-relaxed max-w-2xl mx-auto font-medium mb-4">
            Dominate the university underground. Factions, territory, influence.
          </p>
          <p className="text-sm text-zinc-600 max-w-xl mx-auto">
            A cyberpunk campus warfare game. Build your reputation, control territory, and rise through the ranks.
          </p>
        </header>

        {/* Feature Grid */}
        <div className="max-w-6xl mx-auto mb-24">
          <div className="text-center mb-12">
            <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest mb-2">// Network Capabilities</h2>
            <p className="text-xs text-zinc-600">Everything available in the current protocol</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <div
                key={i}
                className={`group p-6 border border-zinc-800 bg-black/40 rounded-lg ${f.border} transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(0,0,0,0.5)] animate-slide-in`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className={`w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 group-hover:${f.color} transition-colors`}>
                  <f.icon size={18} className={f.color} />
                </div>
                <h3 className="text-sm font-bold text-zinc-200 mb-2">{f.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="max-w-md mx-auto text-center animate-slide-in">
          <div className="p-10 border border-green-500/20 bg-green-500/5 rounded-2xl shadow-[0_0_50px_rgba(34,197,94,0.1)]">
            <h3 className="text-2xl font-extrabold text-green-400 mb-4">Initialize Uplink</h3>
            <p className="text-zinc-400 text-sm mb-8">Access the campus network and start your rise to power.</p>
            
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
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-800/50 mt-24 py-8 text-center">
        <p className="text-[10px] text-zinc-700 uppercase tracking-widest">Dept.OS // Campus Underground Network</p>
        <p className="text-[9px] text-zinc-800 mt-1">Powered by Rust + Next.js</p>
      </footer>

      {/* Scanline Overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20 mix-blend-overlay"></div>
    </div>
  );
}
