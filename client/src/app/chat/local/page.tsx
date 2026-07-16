"use client";

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { MentionText } from '@/components/MentionText';
import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { ArrowLeft, Send, Radio, MapIcon, User, Wifi } from 'lucide-react';
import { p2pManager } from '@/lib/offline';
import { apiFetch } from '@/lib/api';
import PeerRadar from '@/components/PeerRadar';
import { toast } from 'sonner';

type LocalMessage = {
  from: string;
  content: string;
  created_at: string;
};

export default function LocalP2PChatPage() {
  const { user } = useUser();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [content, setContent] = useState('');
  const [peerCount, setPeerCount] = useState(0);
  const [showRadar, setShowRadar] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get online users from the server
  const { data: onlineUsers = [] } = useQuery<string[]>({
    queryKey: ['online-users'],
    queryFn: async () => {
      const res = await apiFetch('/api/users/online');
      return res.ok ? res.json() : [];
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  // Filter out self from online users
  const otherOnlineUsers = onlineUsers.filter(u => u !== user?.username);
  const connectedPeers = p2pManager.getConnectedPeers();

  // Poll for new messages + peer count + start location sharing
  useEffect(() => {
    p2pManager.startLocationSharing();
    const peerPosInterval = setInterval(() => {
      p2pManager.getPeerPositions();
    }, 5000);

    const interval = setInterval(() => {
      const latest = p2pManager.getLocalMessages();
      setMessages([...latest]);
      setPeerCount(p2pManager.getConnectedPeers().length);
    }, 1000);

    setMessages([...p2pManager.getLocalMessages()]);
    setPeerCount(p2pManager.getConnectedPeers().length);

    return () => {
      clearInterval(interval);
      clearInterval(peerPosInterval);
      p2pManager.stopLocationSharing();
    };
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!content.trim()) return;
    const sentCount = p2pManager.broadcastToPeers(content.trim());
    setContent('');
    setMessages([...p2pManager.getLocalMessages()]);
    inputRef.current?.focus();
  };

  const handleConnectToPeer = (username: string) => {
    p2pManager.connectToPeer(username);
    toast.info(`Connecting to @${username}...`);
  };

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center gap-4 px-4 sm:px-8 bg-black/60 backdrop-blur-md">
        <Link href="/chat" className="text-zinc-500 hover:text-green-400 transition-colors shrink-0">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text truncate flex items-center gap-2">
            <Radio size={14} className="text-green-400" />
            Local Area Chat
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="relative w-1.5 h-1.5">
              <span className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-60" />
              <span className="absolute inset-0 bg-green-500 rounded-full" />
            </span>
            <span className="text-[10px] text-green-400/70">
              {peerCount} peer{peerCount !== 1 ? 's' : ''} connected
            </span>
            <span className="text-[9px] text-zinc-600">· P2P encrypted</span>
          </div>
        </div>
        <button
          onClick={() => setShowRadar(!showRadar)}
          className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-[10px] font-bold transition-all shrink-0 ${
            showRadar ? 'border-green-500/50 text-green-400 bg-green-500/10' : 'border-zinc-700 text-zinc-400 hover:text-green-400 hover:border-green-500/30'
          }`}
        >
          <MapIcon size={14} />
          <span className="hidden sm:inline">{showRadar ? 'Hide Map' : 'Radar'}</span>
        </button>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden bg-[#050505]">
        {/* Online users bar - available for P2P connection */}
        {otherOnlineUsers.length > 0 && (
          <div className="px-4 py-2.5 border-b border-zinc-800 bg-black/30 flex items-center gap-2 overflow-x-auto">
            <Wifi size={12} className="text-green-500 shrink-0" />
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold shrink-0 mr-1">Online:</span>
            {otherOnlineUsers.slice(0, 10).map(username => {
              const isConnected = connectedPeers.includes(username);
              return (
                <button
                  key={username}
                  onClick={() => !isConnected && handleConnectToPeer(username)}
                  disabled={isConnected}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all shrink-0 ${
                    isConnected
                      ? 'bg-green-500/10 text-green-400 border border-green-500/30 cursor-default'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30 cursor-pointer'
                  }`}
                  title={isConnected ? 'Connected via P2P' : 'Click to connect via P2P'}
                >
                  <User size={10} />
                  @{username}
                  {isConnected && <Wifi size={10} className="text-green-500" />}
                </button>
              );
            })}
            {otherOnlineUsers.length > 10 && (
              <span className="text-[9px] text-zinc-600 shrink-0">+{otherOnlineUsers.length - 10} more</span>
            )}
          </div>
        )}

        {/* Radar map */}
        {showRadar && (
          <div className="p-4 border-b border-zinc-800">
            <PeerRadar />
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Radio size={40} className="text-zinc-800 mb-4" />
              <p className="text-sm text-zinc-600 font-mono italic">No local messages yet.</p>
              <p className="text-[10px] text-zinc-700 mt-2">
                {peerCount > 0
                  ? `Connected to ${peerCount} peer${peerCount > 1 ? 's' : ''} — send a message to the local area!`
                  : otherOnlineUsers.length > 0
                    ? `${otherOnlineUsers.length} operative${otherOnlineUsers.length > 1 ? 's' : ''} online — click a name above to connect via P2P`
                    : 'Waiting for nearby operatives to connect...'}
              </p>
            </div>
          ) : (
            messages.map((msg, i) => {
              const myMsg = msg.from === user?.username;
              return (
                <div key={i} className={`flex ${myMsg ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%]">
                    {!myMsg && (
                      <Link href={`/profile/${msg.from}`} className="text-[10px] font-bold text-zinc-500 hover:text-green-400 mb-1 block transition-colors">
                        @{msg.from}
                      </Link>
                    )}
                    <div className={`px-4 py-2.5 rounded-lg border ${
                      myMsg
                        ? 'bg-green-500/10 border-green-500/30 rounded-tr-sm'
                        : 'bg-zinc-900 border-zinc-800'
                    }`}>
                      <p className="text-sm text-zinc-100 font-mono"><MentionText text={msg.content} /></p>
                      <div className="flex justify-end mt-1">
                        <span className="text-[9px] text-zinc-500">
                          {msg.created_at
                            ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'now'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 sm:p-6 border-t border-zinc-800 bg-black/60 backdrop-blur">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-4 py-3 text-sm outline-none focus:border-green-500/50 text-zinc-200"
              placeholder={peerCount > 0 ? "Local broadcast to nearby operatives..." : "No peers connected yet..."}
              disabled={peerCount === 0}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && content.trim() && peerCount > 0) handleSend();
              }}
            />
            <button
              onClick={handleSend}
              disabled={!content.trim() || peerCount === 0}
              className="px-5 border border-green-500/40 bg-green-500/10 text-green-400 rounded-lg transition-all hover:bg-green-500/20 disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
          {peerCount === 0 && (
            <p className="text-[9px] text-zinc-600 mt-2 text-center">
              {otherOnlineUsers.length > 0
                ? 'Click an online operative above to establish a P2P connection'
                : 'No other operatives are currently online'}
            </p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
