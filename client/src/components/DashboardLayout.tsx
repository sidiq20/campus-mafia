"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { MessageSquare, Map as MapIcon, Crosshair, Zap, Shield, Skull, Menu, X, Bell, User, LogOut, Activity, Radio } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import PwaInstallBanner from './PwaInstallBanner';
import PetCat from './PetCat';
import { WS_URL, clearToken, apiFetch } from '@/lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading } = useUser();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<{type: string, [key: string]: any}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLeftOpen, setIsLeftOpen] = useState(false);
  const [isRightOpen, setIsRightOpen] = useState(false);
  const { data: notifications } = useQuery<{is_read: boolean}[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiFetch('/api/notifications');
      return res.ok ? res.json() : [];
    },
    enabled: !!user
  });

  const { data: dmUnread } = useQuery<{unread: number}>({
    queryKey: ['dm-unread'],
    queryFn: async () => {
      const res = await apiFetch('/api/chat/direct/unread/count');
      return res.ok ? res.json() : { unread: 0 };
    },
    refetchInterval: 15000,
    enabled: !!user
  });
  const wsRef = useRef<WebSocket | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Generate a short notification chime using Web Audio API
  function playNotificationSound() {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      // Pleasant two-tone chime
      osc.frequency.setValueAtTime(880, ctx.currentTime);      // A5
      osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1); // C#6

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (_) {
      // Audio not available — silently skip
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        if (isLeftOpen) setIsLeftOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isLeftOpen]);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/api/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Skip typing indicators — they're handled by the DM chat page and would flood the messages array
        if (data.type === 'TypingIndicator') return;
        setMessages(prev => [...prev, data]);
        
        let title = '';
        let body = '';
        if (data.type === 'NewPost') { title = 'Intel Drop'; body = `@${data.author} broadcasted a message.`; toast(title, { description: body }); }
        if (data.type === 'TerritoryAttacked') { title = 'Attack Detected'; body = `${data.territory_name} was hit!`; toast.error(title, { description: body }); }
        if (data.type === 'TerritoryCaptured') { title = 'Territory Captured'; body = `${data.territory_name} was taken!`; toast.success(title, { description: body }); }
        if (data.type === 'Notification' && data.target_username === user?.username) {
          title = data.from ? `DM from ${data.from}` : 'New Message';
          body = 'You have a new direct message';
          toast.info(body, { description: data.from ? `From: ${data.from}` : undefined });
          playNotificationSound();
          // Also invalidate notifications badge so the red dot updates
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['dm-unread'] });
        }
        
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

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#09090b] text-zinc-100 font-mono">
        <div className="text-center">
          <div className="text-green-500 text-sm animate-pulse uppercase tracking-widest">Initializing Secure Uplink...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#09090b] text-zinc-100 overflow-hidden font-mono">
      <Toaster theme="dark" position="top-right" />
      
      <div className="md:hidden flex items-center justify-between p-4 border-b border-green-500/20 bg-black/80 z-20">
        <button onClick={() => setIsLeftOpen(true)}><Menu className="text-green-500 w-6 h-6" /></button>
        <span className="text-green-500 font-bold uppercase tracking-widest glow-text">Dept.OS</span>
        <button onClick={() => setIsRightOpen(true)}><Bell className="text-green-500 w-6 h-6" /></button>
      </div>

      <aside ref={sidebarRef} className={`w-64 border-r border-green-500/20 bg-black p-4 flex flex-col gap-6 fixed inset-y-0 left-0 z-40 transform transition-transform md:relative md:translate-x-0 ${isLeftOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button className="md:hidden absolute top-4 right-4" onClick={() => setIsLeftOpen(false)}><X className="text-zinc-500 w-5 h-5"/></button>
        <div className="flex items-center gap-2 mb-4">
          <Skull className="text-green-500 h-6 w-6" />
          <h1 className="text-xl font-bold tracking-tighter text-green-500 uppercase glow-text">Dept.OS</h1>
        </div>
        
        <div className="flex-1 space-y-2">
          <nav className="flex flex-col gap-1">
            <NavItem href="/feed" icon={<Crosshair size={18} />} label="Feed" active={pathname === '/feed'} />
            <NavItem href="/chat" icon={<MessageSquare size={18} />} label="Direct Chats" active={pathname.startsWith('/chat')} badge={dmUnread?.unread || 0} />
            <NavItem href="/territory" icon={<MapIcon size={18} />} label="Territory" active={pathname === '/territory'} />
            <NavItem href="/factions" icon={<Shield size={18} />} label="Factions" active={pathname === '/factions'} />
            {user?.faction_id && (
              <NavItem href={`/factions/${user.faction_id}`} icon={<Shield size={18} className="text-purple-500" />} label="My Faction" active={pathname === `/factions/${user.faction_id}`} />
            )}
            <NavItem href="/comms" icon={<MessageSquare size={18} />} label="Comms" active={pathname === '/comms'} />
            <NavItem 
              href="/notifications" 
              icon={<Bell size={18} />} 
              label="Alerts" 
              active={pathname === '/notifications'} 
              badge={notifications?.filter(n => !n.is_read).length || 0}
            />
            <NavItem href="/black-market" icon={<Zap size={18} />} label="Black Market" active={pathname === '/black-market'} />
            <NavItem href="/profile" icon={<User size={18} />} label="Profile" active={pathname === '/profile'} />
          </nav>
        </div>

        <div className="mt-auto p-4 border border-zinc-800 rounded bg-zinc-950/50">
          {user ? (
            <>
              <div className="font-bold text-green-400">@{user.username}</div>
              <button 
                onClick={() => {
                  clearToken();
                  queryClient.clear();
                  window.location.href = '/login';
                }}
                className="w-full mt-4 py-2 border border-red-500/30 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded flex items-center justify-center gap-2 text-xs uppercase font-bold transition-colors"
              >
                <LogOut size={14} />
                Disconnect
              </button>
            </>
          ) : (
            <Link href="/login" className="w-full text-center py-2 bg-green-500/10 text-green-500 border border-green-500/30 rounded text-xs uppercase font-bold">Login</Link>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative border-r border-green-500/20 bg-[#050505] min-h-0 overflow-y-auto md:overflow-hidden pb-16 md:pb-0">
        {children}
      </main>

      <aside className={`w-80 border-l border-green-500/20 bg-black flex flex-col fixed inset-y-0 right-0 z-40 transform transition-transform md:relative md:translate-x-0 ${isRightOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <button className="md:hidden absolute top-4 left-4 z-50" onClick={() => setIsRightOpen(false)}><X className="text-zinc-500 w-5 h-5"/></button>
        
        {/* Live Activity Feed */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-green-500/20">
            <h3 className="text-[10px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-2">
              <Activity size={12} />
              Live Activity
            </h3>
          </div>
          
          <LiveActivityFeed wsMessages={messages} />
        </div>
        
        {/* Quick Stats */}
        <div className="p-4 border-t border-green-500/20 bg-black/60">
          <div className="text-[9px] text-zinc-600 uppercase tracking-widest text-center">
            Monitoring {messages.length} live events this session
          </div>
        </div>
      </aside>
      <PwaInstallBanner />
      <PetCat recentActivity={(() => {
        const latest = messages[messages.length - 1];
        if (!latest) return [];
        const text = latest.msg || latest.content || `${latest.type}${latest.author ? ' by @'+latest.author : latest.territory_name ? ' on '+latest.territory_name : ''}`;
        return text ? [text] : [];
      })()} />
    </div>
  );
}

type ActivityItem = {
  event_type: string;
  label: string;
  description: string;
  timestamp: string;
  icon: string;
};

function LiveActivityFeed({ wsMessages }: { wsMessages: any[] }) {
  const { user } = useUser();
  
  // Poll server for recent activity every 10 seconds
  const { data: serverActivity } = useQuery<ActivityItem[]>({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      const res = await apiFetch('/api/activity/recent');
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Merge WebSocket events (most recent first) with server activity
  const merged = useMemo(() => {
    const wsEvents = [...wsMessages].reverse().slice(0, 15).map(msg => ({
      event_type: msg.type || 'live',
      label: msg.type === 'NewPost' ? '📡 Intel Drop' : msg.type === 'ChatMessage' ? '💬 Chat' : msg.type === 'TerritoryAttacked' ? '⚔️ Attack' : msg.type === 'TerritoryCaptured' ? '🏴 Capture' : '📢 Event',
      description: msg.content || msg.msg || `${msg.territory_name || ''} ${msg.action || ''}`,
      timestamp: new Date().toISOString(),
      icon: msg.type === 'NewPost' ? '📡' : msg.type === 'ChatMessage' ? '💬' : msg.type === 'TerritoryAttacked' ? '⚔️' : msg.type === 'TerritoryCaptured' ? '🏴' : '📢'
    }));
    
    return [...(serverActivity || []), ...wsEvents];
  }, [wsMessages, serverActivity]);

  if (merged.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Radio size={32} className="text-zinc-800 mb-3" />
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest">No recent activity</p>
        <p className="text-[8px] text-zinc-700 mt-2">Signals will appear here in real-time</p>
      </div>
    );
  }

  // Sort by timestamp descending
  const sorted = [...merged].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 40);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
      {sorted.map((item, i) => (
        <ActivityCard key={`${item.event_type}-${i}`} item={item} />
      ))}
    </div>
  );
}

const activityStyles: Record<string, { border: string, dot: string, bg: string }> = {
  post: { border: 'border-l-green-500/50', dot: 'bg-green-500', bg: 'hover:bg-green-950/20' },
  leaderboard: { border: 'border-l-yellow-500/50', dot: 'bg-yellow-500', bg: 'hover:bg-yellow-950/20' },
  faction: { border: 'border-l-purple-500/50', dot: 'bg-purple-500', bg: 'hover:bg-purple-950/20' },
  territory: { border: 'border-l-blue-500/50', dot: 'bg-blue-500', bg: 'hover:bg-blue-950/20' },
  NewPost: { border: 'border-l-green-500/50', dot: 'bg-green-500', bg: 'hover:bg-green-950/20' },
  ChatMessage: { border: 'border-l-cyan-500/50', dot: 'bg-cyan-500', bg: 'hover:bg-cyan-950/20' },
  TerritoryAttacked: { border: 'border-l-red-500/50', dot: 'bg-red-500', bg: 'hover:bg-red-950/20' },
  TerritoryCaptured: { border: 'border-l-orange-500/50', dot: 'bg-orange-500', bg: 'hover:bg-orange-950/20' },
};

function ActivityCard({ item }: { item: ActivityItem }) {
  const style = activityStyles[item.event_type] || { border: 'border-l-zinc-600', dot: 'bg-zinc-500', bg: 'hover:bg-zinc-900/30' };
  const timeAgo = getTimeAgo(item.timestamp);
  
  return (
    <div className={`text-xs border-l-2 ${style.border} pl-3 py-1.5 ${style.bg} transition-colors rounded-r`}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] font-bold text-zinc-300 truncate">
          {item.icon || '📡'} {item.label}
        </span>
        <span className="text-[8px] text-zinc-600 ml-auto whitespace-nowrap">{timeAgo}</span>
      </div>
      <p className="text-zinc-400 truncate text-[9px] leading-relaxed">
        {item.description}
      </p>
    </div>
  );
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function NavItem({ icon, label, href, active = false, badge = 0 }: { icon: React.ReactNode, label: string, href: string, active?: boolean, badge?: number }) {
  return (
    <Link href={href} className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${active ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>
      {icon}
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </Link>
  );
}
