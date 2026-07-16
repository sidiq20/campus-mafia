"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { MentionText } from '@/components/MentionText';
import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { ArrowLeft, Send, Radio, MapIcon, User, Wifi, Reply, X } from 'lucide-react';
import { p2pManager, type LocalMessage } from '@/lib/offline';
import { apiFetch } from '@/lib/api';
import PeerRadar from '@/components/PeerRadar';
import { toast } from 'sonner';

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '💀', '🗿'];

export default function LocalP2PChatPage() {
  const { user } = useUser();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [content, setContent] = useState('');
  const [peerCount, setPeerCount] = useState(0);
  const [showRadar, setShowRadar] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; content: string } | null>(null);
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
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
  const [relayAvailable, setRelayAvailable] = useState(false);
  // Track which users we've already attempted P2P connection with (avoid spamming)
  const attemptedConnectRef = useRef<Set<string>>(new Set());

  const canSend = !!content.trim() && (peerCount > 0 || (otherOnlineUsers.length > 0 && relayAvailable));

  // Auto-connect to newly appeared online users (only attempt once per user)
  useEffect(() => {
    otherOnlineUsers.forEach(username => {
      if (!connectedPeers.includes(username) && !attemptedConnectRef.current.has(username)) {
        attemptedConnectRef.current.add(username);
        p2pManager.connectToPeer(username);
      }
    });
  }, [onlineUsers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for relay status separately
  useEffect(() => {
    const relayInterval = setInterval(() => {
      setRelayAvailable(p2pManager.isRelayAvailable());
    }, 2000);
    setRelayAvailable(p2pManager.isRelayAvailable());
    return () => clearInterval(relayInterval);
  }, []);

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

  // Focus input when replyTo changes
  useEffect(() => {
    if (replyTo) {
      inputRef.current?.focus();
    }
  }, [replyTo]);

  const handleSend = useCallback(() => {
    if (!content.trim()) return;
    p2pManager.broadcastToPeers(content.trim(), replyTo?.id || null, replyTo?.content || null);
    setContent('');
    setReplyTo(null);
    setMessages([...p2pManager.getLocalMessages()]);
    inputRef.current?.focus();
  }, [content, replyTo]);

  const handleReact = useCallback((messageId: string, emoji: string) => {
    p2pManager.sendReaction(messageId, emoji);
    // Immediately reflect in UI
    setMessages([...p2pManager.getLocalMessages()]);
  }, []);

  const handleConnectToPeer = (username: string) => {
    p2pManager.connectToPeer(username);
    toast.info(`Connecting to @${username}...`);
  };

  // Build a lookup for reply previews
  const msgById = useCallback((id: string) => messages.find(m => m.id === id), [messages]);

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
              {peerCount > 0
                ? `${peerCount} peer${peerCount !== 1 ? 's' : ''} connected`
                : otherOnlineUsers.length > 0
                  ? `${otherOnlineUsers.length} online · server relay`
                  : 'offline'
              }
            </span>
            <span className={`text-[9px] ${peerCount > 0 ? 'text-green-500/70' : 'text-yellow-500/70'}`}>
              {peerCount > 0 ? '· P2P encrypted' : '· server relay'}
            </span>
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
              const replyPreview = msg.reply_to_id ? msgById(msg.reply_to_id) : null;
              const reactionEntries = Object.entries(msg.reactions || {}).filter(([, users]) => users.length > 0);

              return (
                <div
                  key={msg.id || i}
                  className={`flex ${myMsg ? 'justify-end' : 'justify-start'} group`}
                  onMouseEnter={() => setHoveredMsg(msg.id)}
                  onMouseLeave={() => setHoveredMsg(null)}
                >
                  <div className="max-w-[80%] relative">
                    {/* Sender name (other users) */}
                    {!myMsg && (
                      <Link href={`/profile/${msg.from}`} className="text-[10px] font-bold text-zinc-500 hover:text-green-400 mb-1 block transition-colors">
                        @{msg.from}
                      </Link>
                    )}

                    {/* Message bubble */}
                    <div className={`px-4 py-2.5 rounded-lg border ${
                      myMsg
                        ? 'bg-green-500/10 border-green-500/30 rounded-tr-sm'
                        : 'bg-zinc-900 border-zinc-800'
                    }`}>
                      {/* Reply preview */}
                      {msg.reply_to_content && (
                        <div className="mb-2 pl-2 border-l-2 border-zinc-600">
                          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                            Replying to {replyPreview?.from || 'message'}
                          </span>
                          <p className="text-[11px] text-zinc-500 italic truncate mt-0.5">
                            {msg.reply_to_content}
                          </p>
                        </div>
                      )}

                      <p className="text-sm text-zinc-100 font-mono"><MentionText text={msg.content} /></p>
                      <div className="flex justify-end mt-1">
                        <span className="text-[9px] text-zinc-500">
                          {msg.created_at
                            ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'now'}
                        </span>
                      </div>
                    </div>

                    {/* Reactions row */}
                    {reactionEntries.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {reactionEntries.map(([emoji, users]) => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(msg.id, emoji)}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs transition-all ${
                              users.includes(user?.username || '')
                                ? 'bg-green-500/15 border border-green-500/30'
                                : 'bg-zinc-800/50 border border-zinc-700/50 hover:bg-zinc-800'
                            }`}
                            title={users.join(', ')}
                          >
                            <span>{emoji}</span>
                            <span className="text-[10px] text-zinc-400 font-bold">{users.length}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Action buttons on hover */}
                    {hoveredMsg === msg.id && (
                      <div className={`absolute -top-3 ${myMsg ? 'left-0' : 'right-0'} flex items-center gap-0.5 bg-black border border-zinc-800 rounded-lg p-0.5 shadow-xl z-10`}>
                        {/* Quick reaction picker */}
                        {QUICK_EMOJIS.map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(msg.id, emoji)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800 text-xs transition-colors"
                            title={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                        {/* Reply button */}
                        <button
                          onClick={() => {
                            setReplyTo({ id: msg.id, content: msg.content.slice(0, 80) + (msg.content.length > 80 ? '...' : '') });
                            inputRef.current?.focus();
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400 hover:text-green-400 transition-colors"
                          title="Reply"
                        >
                          <Reply size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 sm:p-6 border-t border-zinc-800 bg-black/60 backdrop-blur">
          {/* Reply indicator bar */}
          {replyTo && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs">
              <Reply size={12} className="text-green-500 shrink-0" />
              <span className="text-zinc-500 font-bold uppercase tracking-wider text-[9px]">Replying</span>
              <span className="text-zinc-400 truncate flex-1">{replyTo.content}</span>
              <button
                onClick={() => setReplyTo(null)}
                className="text-zinc-600 hover:text-red-400 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="flex gap-3">
            <input
              ref={inputRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-4 py-3 text-sm outline-none focus:border-green-500/50 text-zinc-200"
              placeholder={canSend ? "Local broadcast to nearby operatives..." : otherOnlineUsers.length > 0 ? "Connecting to online operatives..." : "No operatives online..."}
              disabled={!canSend}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && canSend) handleSend();
              }}
            />
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="px-5 border border-green-500/40 bg-green-500/10 text-green-400 rounded-lg transition-all hover:bg-green-500/20 disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
          {!canSend && otherOnlineUsers.length > 0 && (
            <p className="text-[9px] text-yellow-600/70 mt-2 text-center animate-pulse">
              Connecting via relay... messages will be delivered when connection establishes
            </p>
          )}
          {otherOnlineUsers.length === 0 && (
            <p className="text-[9px] text-zinc-600 mt-2 text-center">
              No other operatives are currently online
            </p>
          )
          }
          {canSend && peerCount === 0 && otherOnlineUsers.length > 0 && (
            <p className="text-[9px] text-yellow-600/60 mt-2 text-center">
              ⚡ Using server relay — messages may have slight delay
            </p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
