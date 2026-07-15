"use client";

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { MentionText } from '@/components/MentionText';
import { apiFetch, WS_URL } from '@/lib/api';
import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { Send, ArrowLeft, Users, X, UserPlus, Crown, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type GroupMessage = {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  author_name: string;
  display_name: string;
  created_at: string;
};

type GroupMember = {
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  joined_at: string;
};

export default function GroupChatPage() {
  const { id } = useParams() as { id: string };
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [sendingLock, setSendingLock] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, refetch } = useQuery<GroupMessage[]>({
    queryKey: ['group-chat', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/groups/${id}/messages`);
      if (!res.ok) throw new Error('Failed to load messages');
      return res.json();
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const { data: members, refetch: refetchMembers } = useQuery<GroupMember[]>({
    queryKey: ['group-members', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/groups/${id}/members`);
      return res.ok ? res.json() : [];
    },
    staleTime: 15_000,
  });

  const isAdmin = members?.some(m => m.user_id === user?.id && m.role === 'admin');

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiFetch(`/api/groups/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onMutate: () => setSendingLock(true),
    onSuccess: () => {
      setContent('');
      setSendingLock(false);
      queryClient.invalidateQueries({ queryKey: ['group-chat', id] });
    },
    onError: (err: Error) => {
      setSendingLock(false);
      toast.error(err.message);
    }
  });

  const addMemberMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await apiFetch(`/api/groups/${id}/members/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      toast.success('Member added!');
      setNewMemberName('');
      refetchMembers();
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/groups/${id}/members/${userId}/remove`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      toast.success('Member removed');
      refetchMembers();
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const promoteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/groups/${id}/members/${userId}/promote`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      toast.success('Promoted to admin');
      refetchMembers();
    },
    onError: (err: Error) => toast.error(err.message)
  });

  // ——— WebSocket for real-time updates ———
  useEffect(() => {
    if (!user) return;
    const ws = new WebSocket(`${WS_URL}/api/ws`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'GroupChatMessage' && data.group_id === id) {
          queryClient.setQueryData<GroupMessage[]>(['group-chat', id], (old) => {
            if (!old) return old;
            // Avoid duplicates from polling + WS using the real DB id
            if (data.id && old.some(m => m.id === data.id)) return old;
            const newMsg: GroupMessage = {
              id: data.id || `ws-${Date.now()}`,
              group_id: data.group_id,
              user_id: data.user_id || '',
              content: data.content,
              author_name: data.author_name,
              display_name: data.display_name,
              created_at: data.created_at || new Date().toISOString(),
            };
            return [...old, newMsg];
          });
          setTimeout(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
          }, 50);
        }
      } catch (_) {}
    };

    return () => ws.close();
  }, [user, id, queryClient]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!content.trim() || sendingLock || sendMutation.isPending) return;
    sendMutation.mutate(content.trim());
  };

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center gap-3 px-4 sm:px-8 bg-black/60 backdrop-blur-md">
        <Link href="/chat" className="text-zinc-500 hover:text-green-400 transition-colors shrink-0">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text truncate flex items-center gap-2">
            <Users size={14} className="text-purple-400" />
            Group Chat
          </h2>
        </div>
        <button
          onClick={() => setShowMembers(!showMembers)}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-[10px] font-bold transition-all ${
            showMembers ? 'border-purple-500/50 text-purple-400 bg-purple-500/10' : 'border-zinc-700 text-zinc-400 hover:text-purple-400 hover:border-purple-500/30'
          }`}
        >
          <Users size={14} />
          {members?.length || 0}
        </button>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#050505]">
        {/* Message area */}
        <div className="flex-1 flex flex-col min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
            {messages?.length === 0 ? (
              <div className="text-center text-zinc-600 text-xs py-12 font-mono italic">No messages yet. Send the first one.</div>
            ) : messages?.map(msg => {
              const myMsg = msg.user_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${myMsg ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%]">
                    {!myMsg && (
                      <Link href={`/profile/${msg.author_name}`} className="text-[10px] font-bold text-zinc-500 hover:text-green-400 mb-1 block transition-colors">
                        @{msg.display_name}
                      </Link>
                    )}
                    <div className={`px-4 py-2.5 rounded-lg border ${
                      myMsg ? 'bg-purple-500/10 border-purple-500/30 rounded-tr-sm' : 'bg-zinc-900 border-zinc-800'
                    }`}>
                      <p className="text-sm text-zinc-100 font-mono"><MentionText text={msg.content} /></p>
                      <div className="flex justify-end mt-1">
                        <span className="text-[9px] text-zinc-500">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-zinc-800 bg-black/60">
            <div className="flex gap-2">
              <input
                value={content}
                onChange={e => setContent(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm outline-none focus:border-purple-500/50 text-zinc-200"
                placeholder="Send a message..."
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(); }}
              />
              <button
                onClick={handleSend}
                disabled={!content.trim() || sendingLock}
                className="px-5 border border-purple-500/40 bg-purple-500/10 text-purple-400 rounded-lg transition-all hover:bg-purple-500/20 disabled:opacity-50"
              >
                {sendingLock ? <span className="text-xs animate-pulse">...</span> : <Send size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Members sidebar */}
        {showMembers && (
          <div className="w-full md:w-72 border-t md:border-t-0 md:border-l border-zinc-800 bg-black/40 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                <Users size={14} /> Members ({members?.length || 0})
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {members?.map(m => {
                const isSelf = m.user_id === user?.id;
                return (
                  <div key={m.user_id} className="flex items-center justify-between p-2.5 bg-zinc-900/50 border border-zinc-800/50 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/profile/${m.username}`} className="text-xs font-bold text-zinc-200 hover:text-green-400 truncate transition-colors">
                          {m.display_name}
                        </Link>
                        {m.role === 'admin' && (
                          <Crown size={10} className="text-yellow-500 shrink-0" />
                        )}
                      </div>
                      <div className="text-[9px] text-zinc-600">@{m.username}</div>
                    </div>
                    {isAdmin && !isSelf && m.role !== 'admin' && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => promoteMutation.mutate(m.user_id)}
                          className="p-1 text-zinc-500 hover:text-yellow-400 transition-colors"
                          title="Promote to admin"
                        >
                          <ShieldAlert size={12} />
                        </button>
                        <button
                          onClick={() => removeMemberMutation.mutate(m.user_id)}
                          className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                          title="Remove member"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {isAdmin && (
              <div className="p-4 border-t border-zinc-800">
                <div className="flex gap-2">
                  <input
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value)}
                    placeholder="Add username..."
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs outline-none focus:border-purple-500/50 text-zinc-200"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newMemberName.trim()) {
                        addMemberMutation.mutate(newMemberName.trim());
                      }
                    }}
                  />
                  <button
                    onClick={() => newMemberName.trim() && addMemberMutation.mutate(newMemberName.trim())}
                    disabled={!newMemberName.trim()}
                    className="p-2 border border-purple-500/40 bg-purple-500/10 text-purple-400 rounded hover:bg-purple-500/20 disabled:opacity-50 transition-all"
                  >
                    <UserPlus size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
