"use client";

import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Map as MapIcon, Crosshair, Zap, Shield, Skull, Menu, X, Bell, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { Toaster, toast } from 'sonner';
import PwaInstallBanner from './PwaInstallBanner';
import { WS_URL } from '@/lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const [messages, setMessages] = useState<{type: string, [key: string]: any}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLeftOpen, setIsLeftOpen] = useState(false);
  const [isRightOpen, setIsRightOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/api/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages(prev => [...prev, data]);
        
        let title = '';
        let body = '';
        if (data.type === 'NewPost') { title = 'Intel Drop'; body = `@${data.author} broadcasted a message.`; toast(title, { description: body }); }
        if (data.type === 'TerritoryAttacked') { title = 'Attack Detected'; body = `${data.territory_name} was hit!`; toast.error(title, { description: body }); }
        if (data.type === 'TerritoryCaptured') { title = 'Territory Captured'; body = `${data.territory_name} was taken!`; toast.success(title, { description: body }); }
        
        if (title && "Notification" in window && Notification.permission === "granted" && document.hidden) {
          new Notification(title, { body });
        }
      } catch (e) {
        // Fallback
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const handleSendMessage = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && chatInput.trim()) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Send a serialized JSON message matching GameEvent::ChatMessage
          wsRef.current.send(JSON.stringify({
            type: "ChatMessage",
            author: user?.username || 'phantom',
            faction: user?.faction_name || 'Unaffiliated',
            msg: chatInput.trim(),
            channel_type: "global",
            channel_id: null
          }));
        setChatInput('');
      }
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#09090b] text-zinc-100 overflow-hidden font-mono">
      <Toaster theme="dark" position="top-right" />
      
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-green-500/20 bg-black/80 z-20">
        <button onClick={() => setIsLeftOpen(true)}><Menu className="text-green-500 w-6 h-6" /></button>
        <span className="text-green-500 font-bold uppercase tracking-widest glow-text">Dept.OS</span>
        <button onClick={() => setIsRightOpen(true)}><Bell className="text-green-500 w-6 h-6" /></button>
      </div>

      {/* Sidebar: Navigation & Profile */}
      <aside className={`w-64 border-r border-green-500/20 bg-black p-4 flex flex-col gap-6 fixed inset-y-0 left-0 z-40 transform transition-transform md:relative md:translate-x-0 ${isLeftOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button className="md:hidden absolute top-4 right-4" onClick={() => setIsLeftOpen(false)}><X className="text-zinc-500 w-5 h-5"/></button>
        <div className="flex items-center gap-2 mb-4">
          <Skull className="text-green-500 h-6 w-6" />
          <h1 className="text-xl font-bold tracking-tighter text-green-500 uppercase glow-text">Dept.OS</h1>
        </div>
        
        <div className="flex-1 space-y-2">
          <nav className="flex flex-col gap-1">
            <NavItem href="/feed" icon={<Crosshair size={18} />} label="Feed" active={pathname === '/feed'} />
            <NavItem href="/territory" icon={<MapIcon size={18} />} label="Territory" active={pathname === '/territory'} />
            <NavItem href="/factions" icon={<Shield size={18} />} label="Factions" active={pathname.startsWith('/factions')} />
            <NavItem href="/comms" icon={<MessageSquare size={18} />} label="Comms" active={pathname === '/comms'} />
            <NavItem href="/black-market" icon={<Zap size={18} />} label="Black Market" active={pathname === '/black-market'} />
            <NavItem href="/profile" icon={<User size={18} />} label="Profile" active={pathname === '/profile'} />
          </nav>
        </div>

        <div className="mt-auto p-4 border border-zinc-800 rounded bg-zinc-950/50">
          <div className="text-xs text-zinc-500 mb-1 uppercase tracking-wider">Identity</div>
          <div className="font-bold text-green-400">@{user?.username || 'phantom'}</div>
          <div className="flex justify-between items-center mt-2 text-xs">
            <span className="text-zinc-400">Faction</span>
            <span className="text-purple-400 font-bold">{user?.faction_name || 'Unaffiliated'}</span>
          </div>
          <div className="flex justify-between items-center mt-1 text-xs">
            <span className="text-zinc-400">Influence</span>
            <span className="text-yellow-500">{user?.influence || 0}</span>
          </div>
          <div className="flex justify-between items-center mt-1 text-xs">
            <span className="text-zinc-400">Reputation</span>
            <span className="text-blue-500">{user?.reputation || 0}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative border-r border-green-500/20 bg-[#050505]">
        {children}
      </main>

      {/* Right Sidebar: Map & Chat */}
      <aside className={`w-80 border-l border-green-500/20 bg-black flex flex-col fixed inset-y-0 right-0 z-40 transform transition-transform md:relative md:translate-x-0 ${isRightOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <button className="md:hidden absolute top-4 left-4 z-50" onClick={() => setIsRightOpen(false)}><X className="text-zinc-500 w-5 h-5"/></button>
        {/* Map Mini-View */}
        <div className="h-1/3 border-b border-green-500/20 p-4 flex flex-col pt-12 md:pt-4">
          <div className="text-xs font-semibold text-green-500 uppercase tracking-widest mb-3 flex items-center justify-between">
            <span>Territory Intel</span>
            <Shield size={14} />
          </div>
          <Link href="/territory" className="flex-1 bg-zinc-900 border border-zinc-800 rounded relative overflow-hidden group cursor-pointer block">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold text-zinc-500 group-hover:text-green-400 transition-colors">View Tactical Map</span>
            </div>
          </Link>
        </div>
        
        {/* Global Chat */}
        <div className="flex-1 flex flex-col">
          <div className="p-3 border-b border-green-500/20 bg-black/40 flex justify-between items-center">
            <h3 className="text-xs font-semibold text-green-500 uppercase tracking-widest">Encrypted Comms</h3>
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-zinc-500 text-xs text-center italic">No communications intercepted...</div>
            ) : (
              messages.map((m, i) => (
                <TickerEvent key={i} event={m} />
              ))
            )}
          </div>
          <div className="p-3 border-t border-green-500/20 bg-black/60">
            <input 
              type="text" 
              placeholder="Transmit message... (Press Enter)" 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleSendMessage}
              className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs outline-none focus:border-green-500/50 transition-colors" 
            />
          </div>
        </div>
      </aside>

      {/* Cyberpunk Scanline Overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20 mix-blend-overlay"></div>
      <PwaInstallBanner />
    </div>
  );
}

function NavItem({ icon, label, href, active = false }: { icon: React.ReactNode, label: string, href: string, active?: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${active ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function TickerEvent({ event }: { event: any }) {
  const factionColors: Record<string, string> = {
    '404': 'text-purple-400',
    'The Ravens': 'text-blue-400',
    'The Cartel': 'text-yellow-400',
    'The Syndicate': 'text-red-400',
  };

  if (event.type === 'ChatMessage') {
    return (
      <div className="text-xs">
        <span className={`font-bold ${event.faction ? (factionColors[event.faction] || 'text-zinc-400') : 'text-zinc-400'}`}>[{event.faction || 'Unaffiliated'}] </span>
        <span className="text-zinc-300 font-bold">{event.author}: </span>
        <span className="text-zinc-400">{event.msg}</span>
      </div>
    );
  }

  if (event.type === 'NewPost') {
    return (
      <div className="text-xs border-l-2 border-green-500 pl-2 my-1">
        <span className="text-green-500 font-bold">INTEL DROP: </span>
        <span className="text-zinc-400">@{event.author} broadcasted a message.</span>
      </div>
    );
  }

  if (event.type === 'TerritoryAttacked') {
    return (
      <div className="text-xs border-l-2 border-red-500 pl-2 my-1">
        <span className="text-red-500 font-bold">ATTACK DETECTED: </span>
        <span className="text-zinc-400">[{event.attacker_faction || 'Rogue'}] hit {event.territory_name} (-{event.damage} DEF)</span>
      </div>
    );
  }

  if (event.type === 'TerritoryCaptured') {
    return (
      <div className="text-xs border-l-2 border-purple-500 pl-2 my-1 bg-purple-500/10 p-1">
        <span className="text-purple-400 font-bold">TERRITORY CAPTURED: </span>
        <span className="text-zinc-200">{event.territory_name} is now controlled by [{event.new_faction || 'Rogue'}].</span>
      </div>
    );
  }

  return null;
}
