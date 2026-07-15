"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { MessageSquare, Map as MapIcon, Crosshair, Zap, Shield, Skull, Menu, X, Bell, User, LogOut, Activity, Radio, TrendingUp, Package, Swords, Target } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import PwaInstallBanner from './PwaInstallBanner';
import PetCat from './PetCat';
import P2PScanAnimation from './P2PScanAnimation';
import OnboardingWalkthrough from './OnboardingWalkthrough';
import AccentThemePicker from './AccentThemePicker';
import { WS_URL, clearToken, apiFetch } from '@/lib/api';
import { p2pManager } from '@/lib/offline';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading } = useUser();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<{type: string, [key: string]: any}[]>([]);
  const [typingFriends, setTypingFriends] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLeftOpen, setIsLeftOpen] = useState(false);
  const [isRightOpen, setIsRightOpen] = useState(false);
  const { data: notifications } = useQuery<{is_read: boolean}[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiFetch('/api/notifications');
      return res.ok ? res.json() : [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: dmUnread } = useQuery<{unread: number}>({
    queryKey: ['dm-unread'],
    queryFn: async () => {
      const res = await apiFetch('/api/chat/direct/unread/count');
      return res.ok ? res.json() : { unread: 0 };
    },
    refetchInterval: 15000,
    staleTime: 15_000,
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

  // P2P connection status
  const [p2pPeers, setP2pPeers] = useState<string[]>([]);

  // Initialize P2P manager when user is authenticated
  useEffect(() => {
    if (!user?.username) return;
    p2pManager.init(user.username, WS_URL);

    p2pManager.onConnection((username, connected) => {
      setP2pPeers(prev => {
        if (connected) return prev.includes(username) ? prev : [...prev, username];
        return prev.filter(n => n !== username);
      });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    });

    p2pManager.onMessage((from, content) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    });

    // Listen for local broadcast messages and update peer count
    p2pManager.onLocalMessage((from, content) => {
      setP2pPeers(p2pManager.getConnectedPeers());
    });

    // Re-check peers periodically
    const peerCheckInterval = setInterval(() => {
      setP2pPeers(p2pManager.getConnectedPeers());
    }, 3000);

    // Try to sync any pending offline messages
    p2pManager.syncPendingMessages(apiFetch);

    return () => {
      clearInterval(peerCheckInterval);
      p2pManager.disconnectAll();
    };
  }, [user?.username]);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/api/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Track typing indicators for the cat
        if (data.type === 'TypingIndicator') {
          setTypingFriends(prev => {
            if (data.is_typing) {
              if (prev.includes(data.from_username)) return prev;
              return [...prev, data.from_username];
            }
            return prev.filter(n => n !== data.from_username);
          });
          return;
        }
        setMessages(prev => [...prev, data]);
        
        let title = '';
        let body = '';
        if (data.type === 'NewPost') { title = 'Intel Drop'; body = `@${data.author} broadcasted a message.`; toast(title, { description: body }); }
        if (data.type === 'TerritoryAttacked') { title = 'Attack Detected'; body = `${data.territory_name} was hit!`; toast.error(title, { description: body }); }
        if (data.type === 'TerritoryCaptured') { title = 'Territory Captured'; body = `${data.territory_name} was taken!`; toast.success(title, { description: body }); }
        if (data.type === 'RaidPlanned') { title = 'Raid Planned'; body = `@${data.planner_name} planned a raid on ${data.target_territory}!`; toast.info(title, { description: body }); }
        if (data.type === 'RaidJoined') { title = 'Raid Joined'; body = `@${data.joiner_name} joined the raid on ${data.target_territory}!`; toast.info(title, { description: body }); }
        if (data.type === 'RaidExecuted') { title = 'Raid Executed'; body = data.captured ? `${data.target_territory} was captured by ${data.faction_name}!` : `${data.target_territory} was hit for ${data.total_influence} damage!`; toast.success(title, { description: body }); }
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

      <aside ref={sidebarRef} className={`w-64 border-r border-green-500/20 bg-black p-4 flex flex-col gap-6 fixed inset-y-0 left-0 z-40 transform transition-transform md:relative md:translate-x-0 pb-20 md:pb-4 ${isLeftOpen ? 'translate-x-0' : '-translate-x-full'}`}>
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
            <NavItem href="/leaderboard" icon={<TrendingUp size={18} />} label="Leaderboard" active={pathname === '/leaderboard'} />
            <NavItem href="/heists" icon={<Swords size={18} />} label="Heists" active={pathname === '/heists'} />
            <NavItem href="/bounties" icon={<Target size={18} />} label="Bounties" active={pathname === '/bounties'} />
            <NavItem href="/inventory" icon={<Package size={18} />} label="Inventory" active={pathname === '/inventory'} />
            <NavItem href="/black-market" icon={<Zap size={18} />} label="Black Market" active={pathname === '/black-market'} />
            <NavItem href="/profile" icon={<User size={18} />} label="Profile" active={pathname === '/profile'} />
          </nav>
        </div>

        {/* P2P Status Indicator with Scan Animation */}
        {user && (
          <div className="px-3 py-2 border border-zinc-800 rounded bg-zinc-950/50 flex items-center gap-2 group hover:border-green-500/20 transition-all">
            <P2PScanAnimation active={p2pPeers.length > 0 || true} peerCount={p2pPeers.length} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">P2P Network</div>
              <div className="text-[8px] text-zinc-600 flex items-center gap-1">
                {p2pPeers.length > 0 ? (
                  <>
                    <span className="text-green-400">{p2pPeers.length} peer{p2pPeers.length > 1 ? 's' : ''}</span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-green-500/60">connected</span>
                  </>
                ) : (
                  <span className="text-yellow-600/60 animate-pulse">scanning...</span>
                )}
              </div>
            </div>
            {p2pPeers.length > 0 && (
              <span className="relative w-2 h-2 shrink-0">
                <span className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-60" />
                <span className="absolute inset-0 bg-green-500 rounded-full" />
              </span>
            )}
          </div>
        )}

        <div className="mt-auto p-4 border border-zinc-800 rounded bg-zinc-950/50">
          {user ? (
            <>
              <Link href="/profile" className="font-bold text-green-400 hover:text-green-300 transition-colors">@{user.username}</Link>
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
              <div className="mt-3 flex items-center justify-center">
                <AccentThemePicker />
              </div>
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
      <OnboardingWalkthrough />
      <PwaInstallBanner />
      <PetCat recentActivity={(() => {
        const latest = messages[messages.length - 1];
        const act: string[] = [];
        // Add typing indicators
        if (typingFriends.length > 0) {
          act.push(`💬 @${typingFriends[0]} is typing${typingFriends.length > 1 ? ` +${typingFriends.length - 1} more` : ''}...`);
        }
        if (latest) {
          const text = latest.msg || latest.content || `${latest.type}${latest.author ? ' by @'+latest.author : latest.territory_name ? ' on '+latest.territory_name : ''}`;
          if (text) act.push(text);
        }
        return act;
      })()} />

      {/* Bottom Navigation — Mobile Only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-green-500/20 bg-black/95 backdrop-blur-lg">
        <div className="flex items-center justify-around h-16 px-2">
          <BottomNavItem
            href="/feed"
            icon={<Crosshair size={20} />}
            label="Feed"
            active={pathname === '/feed'}
          />
          <BottomNavItem
            href="/chat"
            icon={<MessageSquare size={20} />}
            label="Chats"
            active={pathname.startsWith('/chat')}
            badge={dmUnread?.unread || 0}
          />
          {user?.faction_id ? (
            <BottomNavItem
              href={`/factions/${user.faction_id}`}
              icon={<Shield size={20} />}
              label="Syndicate"
              active={pathname === `/factions/${user.faction_id}`}
            />
          ) : (
            <BottomNavItem
              href="/factions"
              icon={<Shield size={20} />}
              label="Factions"
              active={pathname === '/factions'}
            />
          )}
          <BottomNavItem
            href="/notifications"
            icon={<Bell size={20} />}
            label="Alerts"
            active={pathname === '/notifications'}
            badge={notifications?.filter(n => !n.is_read).length || 0}
          />
          <BottomNavItem
            href="/profile"
            icon={<User size={20} />}
            label="Profile"
            active={pathname === '/profile'}
          />
        </div>
      </nav>
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
    staleTime: 10_000,
    refetchInterval: 10000,
  });

  // Merge WebSocket events (most recent first) with server activity
  const merged = useMemo(() => {
    const wsEvents = [...wsMessages].reverse().slice(0, 15).map(msg => ({
      event_type: msg.type || 'live',
      label: msg.type === 'NewPost' ? '📡 Intel Drop' : msg.type === 'ChatMessage' ? '💬 Chat' : msg.type === 'TerritoryAttacked' ? '⚔️ Attack' : msg.type === 'TerritoryCaptured' ? '🏴 Capture' : msg.type === 'RaidPlanned' ? '⚔️ Raid Planned' : msg.type === 'RaidJoined' ? '🤝 Raid Joined' : msg.type === 'RaidExecuted' ? (msg.captured ? '🏴 Territory Captured' : '💥 Raid Executed') : '📢 Event',
      description: msg.content || msg.msg || msg.target_territory ? `${msg.target_territory} ${msg.captured ? 'captured' : msg.total_influence ? `hit for ${msg.total_influence} INF` : msg.influence_committed ? `${msg.influence_committed} INF committed` : ''}` : `${msg.territory_name || ''} ${msg.action || ''}`,
      timestamp: new Date().toISOString(),
      icon: msg.type === 'NewPost' ? '📡' : msg.type === 'ChatMessage' ? '💬' : msg.type === 'TerritoryAttacked' ? '⚔️' : msg.type === 'TerritoryCaptured' ? '🏴' : msg.type === 'RaidPlanned' ? '⚔️' : msg.type === 'RaidJoined' ? '🤝' : msg.type === 'RaidExecuted' ? (msg.captured ? '🏴' : '💥') : '📢'
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
  raid: { border: 'border-l-orange-500/50', dot: 'bg-orange-500', bg: 'hover:bg-orange-950/20' },
  RaidPlanned: { border: 'border-l-orange-500/50', dot: 'bg-orange-500', bg: 'hover:bg-orange-950/20' },
  RaidJoined: { border: 'border-l-yellow-500/50', dot: 'bg-yellow-500', bg: 'hover:bg-yellow-950/20' },
  RaidExecuted: { border: 'border-l-red-500/50', dot: 'bg-red-500', bg: 'hover:bg-red-950/20' },
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

function BottomNavItem({ icon, label, href, active = false, badge = 0 }: { icon: React.ReactNode, label: string, href: string, active?: boolean, badge?: number }) {
  return (
    <Link
      href={href}
      className={`relative flex flex-col items-center justify-center gap-0.5 w-16 h-full transition-colors ${active ? 'text-green-400' : 'text-zinc-600 hover:text-zinc-400'}`}
    >
      <div className={`relative ${active ? 'drop-shadow-[0_0_6px_rgba(0,255,65,0.5)]' : ''}`}>
        {icon}
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full shadow-[0_0_8px_rgba(255,0,0,0.5)]">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className={`text-[9px] font-bold uppercase tracking-widest ${active ? 'text-green-400' : 'text-zinc-600'}`}>
        {label}
      </span>
      {active && (
        <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-green-500 rounded-full shadow-[0_0_6px_rgba(0,255,65,0.6)]" />
      )}
    </Link>
  );
}
