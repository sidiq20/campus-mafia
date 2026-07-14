"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { PullToRefresh } from '@/components/PullToRefresh';
import { apiFetch, WS_URL } from '@/lib/api';
import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { Send, ArrowLeft, Reply, X } from 'lucide-react';
import { toast } from 'sonner';

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  reply_to_id: string | null;
  reply_to_content: string | null;
  is_read: boolean;
  created_at: string;
};

const TYPING_DEBOUNCE_MS = 1500;

export default function DirectChatPage() {
  const { username } = useParams() as { username: string };
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; content: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingWsRef = useRef<WebSocket | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: messages, isLoading, refetch } = useQuery<Message[]>({
    queryKey: ['chat', username],
    queryFn: async () => {
      const res = await apiFetch(`/api/chat/direct/${username}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    staleTime: 10_000,
  });

  // Mark messages as read when opening this chat
  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/chat/direct/${username}/read`, { method: 'POST' })
      .then(res => {
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ['dm-unread'] });
        }
      })
      .catch(() => {});
  }, [username, user]);

  const mutation = useMutation({
    mutationFn: async (msg: { receiver_username: string, content: string; reply_to_id?: string | null }) => {
      const res = await apiFetch('/api/chat/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg)
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Failed to send message');
        throw new Error(errText);
      }
      return res.json();
    },
    onSuccess: () => {
      setContent('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['chat', username] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Transmission failed')
  });

  // ——— WebSocket for typing indicators + real-time messages ———
  useEffect(() => {
    if (!user) return;
    const ws = new WebSocket(`${WS_URL}/api/ws`);
    typingWsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Typing indicator
        if (data.type === 'TypingIndicator'
            && data.from_username === username
            && data.target_username === user.username) {
          setOtherTyping(data.is_typing);
        }

        // Real-time new DM — appear instantly in the cache
        if (data.type === 'NewDirectMessage'
            && data.sender_username === username
            && data.receiver_username === user.username) {
          // Add to cache without refetch
          queryClient.setQueryData<Message[]>(['chat', username], (old) => {
            if (!old) return old;
            const newMsg: Message = {
              id: `ws-${Date.now()}`,
              sender_id: data.sender_id,
              receiver_id: user.id,
              content: data.content,
              reply_to_id: null,
              reply_to_content: data.reply_to_content || null,
              is_read: false,
              created_at: data.created_at || new Date().toISOString(),
            };
            return [...old, newMsg];
          });
        }
      } catch (_) {}
    };

    ws.onclose = () => setOtherTyping(false);

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'TypingIndicator',
          from_username: user.username,
          target_username: username,
          is_typing: false,
        }));
      }
      ws.close();
      typingWsRef.current = null;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [user, username, queryClient]);

  useEffect(() => {
    setOtherTyping(false);
  }, [messages]);

  const sendTypingIndicator = useCallback((typing: boolean) => {
    const ws = typingWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (typing && now - lastTypingSentRef.current < 800) return;
    lastTypingSentRef.current = now;
    ws.send(JSON.stringify({
      type: 'TypingIndicator',
      from_username: user?.username || 'unknown',
      target_username: username,
      is_typing: typing,
    }));
  }, [user, username]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
    sendTypingIndicator(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => sendTypingIndicator(false), TYPING_DEBOUNCE_MS);
  };

  const handleSend = () => {
    sendTypingIndicator(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (content.trim()) {
      mutation.mutate({
        receiver_username: username,
        content: content.trim(),
        reply_to_id: replyTo?.id || null,
      });
    }
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center gap-4 px-4 sm:px-8 bg-black/60 backdrop-blur-md">
        <Link href="/chat" className="text-zinc-500 hover:text-green-400 transition-colors shrink-0">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text truncate">Direct Channel // @{username}</h2>
          {otherTyping && (
            <p className="text-[10px] text-green-400/70 mt-0.5 animate-pulse flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="ml-1">typing</span>
            </p>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden bg-[#050505]">
        <PullToRefresh ref={scrollRef} onRefresh={refetch} className="flex-1">
          <div className="flex-1 p-4 sm:p-8 space-y-3">
            {isLoading ? (
              <div className="text-center text-green-500 text-sm animate-pulse font-mono">// Decrypting history...</div>
            ) : messages?.length === 0 ? (
              <div className="text-center text-zinc-600 text-xs py-12 font-mono italic">No messages yet. Send the first transmission.</div>
            ) : messages?.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'} group`}>
                <div className={`max-w-[75%] sm:max-w-[60%] ${msg.sender_id === user?.id ? 'order-1' : 'order-1'}`}>
                  {/* Reply context bubble */}
                  {msg.reply_to_content && (
                    <div className={`mb-1 px-3 py-1.5 rounded text-[10px] border-l-2 ${msg.sender_id === user?.id ? 'bg-green-500/5 border-green-400/40 text-green-300/70' : 'bg-zinc-800/50 border-zinc-600 text-zinc-400'}`}>
                      <span className="font-bold text-[8px] uppercase tracking-widest block mb-0.5">
                        {msg.sender_id === user?.id ? 'You replied to' : `${username} replied to`}
                      </span>
                      {msg.reply_to_content}
                    </div>
                  )}
                  {/* Message bubble */}
                  <div className={`p-3 sm:p-4 rounded-lg border ${msg.sender_id === user?.id ? 'bg-green-500/10 border-green-500/30 rounded-tr-sm' : 'bg-zinc-900 border-zinc-800 rounded-tl-sm'}`}>
                    <p className="text-sm text-zinc-100 font-mono">{msg.content}</p>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <span className="text-[9px] text-zinc-500">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {/* Reply button */}
                      {user && (
                        <button
                          onClick={() => {
                            setReplyTo({ id: msg.id, content: msg.content.slice(0, 80) + (msg.content.length > 80 ? '...' : '') });
                            inputRef.current?.focus();
                          }}
                          className="text-[9px] text-zinc-600 hover:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Reply"
                        >
                          <Reply size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PullToRefresh>

        {/* Reply preview bar */}
        {replyTo && (
          <div className="px-4 sm:px-6 py-2 border-t border-green-500/20 bg-green-500/5 flex items-center gap-3">
            <Reply size={14} className="text-green-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[9px] font-bold text-green-400 uppercase tracking-widest block">Replying</span>
              <p className="text-xs text-zinc-400 truncate">{replyTo.content}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-zinc-300 shrink-0">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="p-4 sm:p-6 border-t border-zinc-800 bg-black/60 backdrop-blur">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              value={content}
              onChange={handleInputChange}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-4 py-3 text-sm outline-none focus:border-green-500/50 text-zinc-200"
              placeholder="Secure transmission..."
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && content.trim()) handleSend();
              }}
            />
            <button
              onClick={handleSend}
              disabled={!content.trim()}
              className="px-5 bg-green-500/10 text-green-400 border border-green-500/40 rounded hover:bg-green-500/20 transition-all disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
