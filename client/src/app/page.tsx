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
      
      {/* Top Bar */}
      <div className="relative z-10 border-b border-green-500/10 bg-black/60 backdrop-blur-md">
        <div className="container mx-auto px-6 py-2.5 flex items-center justify-between">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">
            Built by{' '}
            <a
              href="https://sidiqolasode.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="glitch inline-block font-bold text-green-400 hover:text-green-300 transition-colors"
              data-text="sidiq"
            >
              sidiq
            </a>
          </p>
          <a
            href="https://github.com/sidiq20/campus-mafia"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-zinc-600 hover:text-green-500 transition-colors uppercase tracking-widest flex items-center gap-1.5"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            GitHub
          </a>
        </div>
      </div>

      <main className="relative z-10 container mx-auto px-6 py-16">
        {/* Header */}
        <header className="text-center mb-12 animate-slide-in">
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

        {/* Login / Signup Buttons - Right Under Hero */}
        <div className="flex items-center justify-center gap-4 mb-16 animate-slide-in">
          <Link 
            href="/signup" 
            className="group flex items-center justify-center gap-2 px-8 py-3 bg-green-500/10 text-green-400 border border-green-500/50 rounded-lg hover:bg-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.15)] hover:-translate-y-0.5 transition-all duration-300 font-bold text-sm uppercase tracking-widest"
          >
            Request Clearance
            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          
          <Link 
            href="/login" 
            className="px-8 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-green-400 hover:border-green-500/30 hover:bg-zinc-800 transition-all duration-300 font-bold text-sm uppercase tracking-widest"
          >
            Terminal Access
          </Link>
        </div>

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
