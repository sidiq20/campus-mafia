"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { PullToRefresh } from '@/components/PullToRefresh';
import { MentionText } from '@/components/MentionText';
import { apiFetch, WS_URL } from '@/lib/api';
import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { RankBadgeSmall } from '@/components/RankBadge';
import { Send, ArrowLeft, Reply, X, Check, CheckCheck, SmilePlus, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  reply_to_id: string | null;
  reply_to_content: string | null;
  is_read: boolean;
  is_edited: boolean;
  created_at: string;
};

type DmReaction = {
  message_id: string;
  user_id: string;
  reaction: string;
};

const TYPING_DEBOUNCE_MS = 1500;
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function DirectChatPage() {
  const { username } = useParams() as { username: string };
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);

  // Online status for this user
  const { data: onlineUsers = [] } = useQuery<string[]>({
    queryKey: ['online-users'],
    queryFn: async () => {
      const res = await apiFetch('/api/users/online');
      return res.ok ? res.json() : [];
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
  const isOnline = onlineUsers.includes(username);

  // Fetch the other user's profile (for rank badge)
  const { data: otherUser } = useQuery({
    queryKey: ['user', username],
    queryFn: async () => {
      const res = await apiFetch(`/api/users/${username}`);
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    },
    staleTime: 60_000,
  });
  const [editingDmId, setEditingDmId] = useState<string | null>(null);
  const [editDmText, setEditDmText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; content: string } | null>(null);
  const [sendingLock, setSendingLock] = useState(false);
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

  const { data: reactions } = useQuery<DmReaction[]>({
    queryKey: ['dm-reactions', username],
    queryFn: async () => {
      const res = await apiFetch(`/api/chat/direct/${username}/reactions`);
      return res.ok ? res.json() : [];
    },
    staleTime: 5_000,
    enabled: !!user,
  });

  // Group reactions by message_id
  const reactionsByMsg = useCallback(() => {
    const map = new Map<string, DmReaction[]>();
    reactions?.forEach(r => {
      const existing = map.get(r.message_id) || [];
      existing.push(r);
      map.set(r.message_id, existing);
    });
    return map;
  }, [reactions]);

  // Mark messages as read when opening this chat
  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/chat/direct/${username}/read`, { method: 'POST' })
      .then(res => {
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ['dm-unread'] });
          queryClient.invalidateQueries({ queryKey: ['chats'] });
        }
      })
      .catch(() => {});
  }, [username, user, queryClient]);

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
    onMutate: () => setSendingLock(true),
    onSuccess: () => {
      setContent('');
      setReplyTo(null);
      setSendingLock(false);
      queryClient.invalidateQueries({ queryKey: ['chat', username] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
    onError: (err) => {
      setSendingLock(false);
      toast.error(err instanceof Error ? err.message : 'Transmission failed');
    }
  });

  const editDmMutation = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const res = await apiFetch(`/api/chat/direct/messages/${messageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      return res.json();
    },
    onMutate: async ({ messageId, content }) => {
      await queryClient.cancelQueries({ queryKey: ['chat', username] });
      const previousMessages = queryClient.getQueryData<Message[]>(['chat', username]);
      queryClient.setQueryData<Message[]>(['chat', username], (old) =>
        old?.map(m => m.id === messageId ? { ...m, content } : m)
      );
      setEditingDmId(null);
      return { previousMessages };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previousMessages) queryClient.setQueryData(['chat', username], context.previousMessages);
      toast.error(err.message || 'Edit failed');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['chat', username] }),
  });

  const reactMutation = useMutation({
    mutationFn: async ({ message_id, reaction }: { message_id: string; reaction: string }) => {
      const res = await apiFetch(`/api/chat/direct/${username}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id, reaction })
      });
      if (!res.ok) throw new Error('Failed to react');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dm-reactions', username] }),
  });

  // ——— WebSocket ———
  useEffect(() => {
    if (!user) return;
    const ws = new WebSocket(`${WS_URL}/api/ws`);
    typingWsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'TypingIndicator'
            && data.from_username === username
            && data.target_username === user.username) {
          setOtherTyping(data.is_typing);
        }

        if (data.type === 'NewDirectMessage'
            && data.sender_username === username
            && data.receiver_username === user.username) {
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
              is_edited: false,
              created_at: data.created_at || new Date().toISOString(),
            };
            return [...old, newMsg];
          });
          queryClient.invalidateQueries({ queryKey: ['dm-unread'] });
          queryClient.invalidateQueries({ queryKey: ['chats'] });
        }

        // Real-time reaction update
        if (data.type === 'DmReaction' && (data.target_username === user.username || data.sender_username === username)) {
          queryClient.invalidateQueries({ queryKey: ['dm-reactions', username] });
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

  useEffect(() => { setOtherTyping(false); }, [messages]);

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
    if (sendingLock || !content.trim() || mutation.isPending) return;
    sendTypingIndicator(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    mutation.mutate({
      receiver_username: username,
      content: content.trim(),
      reply_to_id: replyTo?.id || null,
    });
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const isSending = sendingLock || mutation.isPending;
  const msgReactions = reactionsByMsg();

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center gap-4 px-4 sm:px-8 bg-black/60 backdrop-blur-md">
        <Link href="/chat" className="text-zinc-500 hover:text-green-400 transition-colors shrink-0">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text truncate flex items-center gap-2">
              Direct Channel //{' '}
              <Link href={`/profile/${username}`} className="hover:text-green-300 transition-colors">
                @{username}
              </Link>
              <RankBadgeSmall rank={otherUser?.rank} />
            </h2>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isOnline
                  ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]'
                  : 'bg-zinc-700'
              }`}
              title={isOnline ? 'Online' : 'Offline'}
            />
          </div>
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
            ) : messages?.map(msg => {
              const myMsg = msg.sender_id === user?.id;
              const msgRxs = msgReactions.get(msg.id) || [];
              const isEditing = editingDmId === msg.id;
              return (
                <div key={msg.id} className={`flex ${myMsg ? 'justify-end' : 'justify-start'} group`}>
                  <div className="max-w-[75%] sm:max-w-[60%]">
                    {msg.reply_to_content && (
                      <div className={`mb-1 px-3 py-1.5 rounded text-[10px] border-l-2 ${myMsg ? 'bg-green-500/5 border-green-400/40 text-green-300/70' : 'bg-zinc-800/50 border-zinc-600 text-zinc-400'}`}>
                        <span className="font-bold text-[8px] uppercase tracking-widest block mb-0.5">
                          {myMsg ? 'You replied to' : `${username} replied to`}
                        </span>
                        {msg.reply_to_content}
                      </div>
                    )}
                    {isEditing ? (
                      <div className={`p-3 sm:p-4 rounded-lg border ${myMsg ? 'bg-green-500/10 border-green-500/30 rounded-tr-sm' : 'bg-zinc-900 border-zinc-800 rounded-tl-sm'}`}>
                        <textarea
                          value={editDmText}
                          onChange={e => setEditDmText(e.target.value)}
                          className="w-full bg-zinc-900 border border-green-500/50 rounded-lg p-2 text-sm text-zinc-200 outline-none resize-none mb-2"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setEditingDmId(null)}
                            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              if (editDmText.trim()) {
                                editDmMutation.mutate({ messageId: msg.id, content: editDmText.trim() });
                              }
                            }}
                            disabled={editDmMutation.isPending || !editDmText.trim() || editDmText.trim() === msg.content}
                            className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded text-[10px] font-bold transition-all"
                          >
                            {editDmMutation.isPending ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`p-3 sm:p-4 rounded-lg border ${myMsg ? 'bg-green-500/10 border-green-500/30 rounded-tr-sm' : 'bg-zinc-900 border-zinc-800 rounded-tl-sm'}`}>
                        <p className="text-sm text-zinc-100 font-mono"><MentionText text={msg.content} /></p>
                        <div className="flex items-center justify-between gap-2 mt-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-zinc-500">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {msg.is_edited && <span className="text-[9px] text-zinc-600 italic">(edited)</span>}
                            {/* Read receipt – only shown on own messages */}
                            {myMsg && (
                              <span title={msg.is_read ? 'Read' : 'Sent'}>
                                {msg.is_read
                                  ? <CheckCheck size={12} className="text-green-400" />
                                  : <Check size={12} className="text-zinc-500" />}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {/* Edit button – only on own messages */}
                            {myMsg && !isEditing && (
                              <button
                                onClick={() => { setEditDmText(msg.content); setEditingDmId(msg.id); }}
                                className="text-[9px] text-zinc-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Edit"
                              >
                                <Edit2 size={12} />
                              </button>
                            )}
                            {/* Reaction picker */}
                            {user && (
                              <div className="relative group/reaction">
                                <button className="text-[9px] text-zinc-600 hover:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <SmilePlus size={12} />
                                </button>
                                <div className="absolute bottom-full right-0 mb-1 hidden group-hover/reaction:flex gap-0.5 bg-black border border-zinc-800 rounded-lg p-1 shadow-xl z-10">
                                  {REACTIONS.map(r => (
                                    <button
                                      key={r}
                                      onClick={() => reactMutation.mutate({ message_id: msg.id, reaction: r })}
                                      className="text-sm hover:scale-125 transition-transform px-0.5"
                                    >
                                      {r}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
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
                        {/* Reactions display */}
                        {msgRxs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(
                              msgRxs.reduce((acc: Record<string, number>, r) => {
                                acc[r.reaction] = (acc[r.reaction] || 0) + 1;
                                return acc;
                              }, {})
                            ).map(([emoji, count]) => (
                              <span key={emoji} className="text-[10px] bg-black/40 border border-zinc-800 rounded px-1.5 py-0.5">
                                {emoji} {count > 1 && <span className="text-zinc-500">{count}</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
                if (e.key === 'Enter' && !e.shiftKey && content.trim() && !isSending) handleSend();
              }}
            />
            <button
              onClick={handleSend}
              disabled={!content.trim() || isSending}
              className={`px-5 border rounded transition-all disabled:opacity-50 ${isSending ? 'bg-zinc-800 text-zinc-500 border-zinc-700' : 'bg-green-500/10 text-green-400 border-green-500/40 hover:bg-green-500/20'}`}
            >
              {isSending ? <span className="text-xs animate-pulse">...</span> : <Send size={18} />}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
