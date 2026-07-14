"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch, WS_URL } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { Send, Terminal } from 'lucide-react';
import { toast } from 'sonner';

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingWsRef = useRef<WebSocket | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: ['chat', username],
    queryFn: async () => {
      const res = await apiFetch(`/api/chat/direct/${username}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
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
    mutationFn: async (msg: { receiver_username: string, content: string }) => {
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
      queryClient.invalidateQueries({ queryKey: ['chat', username] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Transmission failed')
  });

  // ——— WebSocket for typing indicators ———
  useEffect(() => {
    if (!user) return;
    const ws = new WebSocket(`${WS_URL}/api/ws`);
    typingWsRef.current = ws;

    ws.onopen = () => {
      // Connection ready
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Show typing indicator only when the OTHER user is typing to US
        if (data.type === 'TypingIndicator'
            && data.from_username === username
            && data.target_username === user.username) {
          setOtherTyping(data.is_typing);
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      setOtherTyping(false);
    };

    return () => {
      // Send "stopped typing" when navigating away
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
  }, [user, username]);

  // Reset typing indicator when messages change (user sent/received a message)
  useEffect(() => {
    setOtherTyping(false);
  }, [messages]);

  const sendTypingIndicator = useCallback((typing: boolean) => {
    const ws = typingWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    // Throttle to avoid spamming
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

    // Clear previous timeout
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    // After TYPING_DEBOUNCE_MS of no typing, send "stopped"
    typingTimerRef.current = setTimeout(() => {
      sendTypingIndicator(false);
    }, TYPING_DEBOUNCE_MS);
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center px-8 bg-black/60 backdrop-blur-md">
        <div className="flex-1">
          <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text">Direct Channel // @{username}</h2>
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-4">
          {isLoading ? (
            <div className="text-center text-green-500 text-sm animate-pulse font-mono">// Decrypting history...</div>
          ) : messages?.map(msg => (
            <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] p-4 rounded border ${msg.sender_id === user?.id ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
                <p className="text-sm text-zinc-100 font-mono">{msg.content}</p>
                <span className="text-[9px] text-zinc-500 mt-2 block">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-zinc-800 bg-black/60 backdrop-blur">
          <div className="flex gap-4">
            <input 
              value={content}
              onChange={handleInputChange}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-4 py-3 text-sm outline-none focus:border-green-500/50 text-zinc-200"
              placeholder="Secure transmission..."
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && content.trim()) {
                  sendTypingIndicator(false);
                  if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                  mutation.mutate({ receiver_username: username, content: content.trim() });
                }
              }}
            />
            <button 
              onClick={() => {
                sendTypingIndicator(false);
                if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                mutation.mutate({ receiver_username: username, content });
              }}
              disabled={!content.trim() || mutation.isPending}
              className="px-6 bg-green-500/10 text-green-400 border border-green-500/40 rounded hover:bg-green-500/20 transition-all"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
