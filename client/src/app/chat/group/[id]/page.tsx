"use client";

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { MentionText } from '@/components/MentionText';
import { apiFetch, WS_URL } from '@/lib/api';
import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { Send, ArrowLeft, Users, X, UserPlus, Crown, ShieldAlert, Trash2, Edit3, Save, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

type GroupMessage = {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  author_name: string;
  display_name: string;
  is_edited: boolean;
  created_at: string;
};

type GroupMember = {
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  joined_at: string;
};

type GroupData = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_by_name: string;
  member_count: number | null;
  created_at: string;
};

export default function GroupChatPage() {
  const { id } = useParams() as { id: string };
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [sendingLock, setSendingLock] = useState(false);
  const [editingDmId, setEditingDmId] = useState<string | null>(null);
  const [editDmText, setEditDmText] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: group } = useQuery<GroupData>({
    queryKey: ['group', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/groups/${id}`);
      if (!res.ok) throw new Error('Failed to load group');
      return res.json();
    },
    staleTime: 15_000,
  });

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

  const updateGroupMutation = useMutation({
    mutationFn: async (data: { name?: string; description?: string }) => {
      const res = await apiFetch(`/api/groups/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast.success('Group updated!');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['group', id] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const editGroupMsgMutation = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const res = await apiFetch(`/api/groups/${id}/messages/${messageId}`, {
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
      await queryClient.cancelQueries({ queryKey: ['group-chat', id] });
      const previousMessages = queryClient.getQueryData<GroupMessage[]>(['group-chat', id]);
      queryClient.setQueryData<GroupMessage[]>(['group-chat', id], (old) =>
        old?.map(m => m.id === messageId ? { ...m, content } : m)
      );
      setEditingDmId(null);
      return { previousMessages };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previousMessages) queryClient.setQueryData(['group-chat', id], context.previousMessages);
      toast.error(err.message || 'Edit failed');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['group-chat', id] }),
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

  // WebSocket for real-time updates
  useEffect(() => {
    if (!user) return;
    const ws = new WebSocket(`${WS_URL}/api/ws`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'GroupChatMessage' && data.group_id === id) {
          queryClient.setQueryData<GroupMessage[]>(['group-chat', id], (old) => {
            if (!old) return old;
            if (data.id && old.some(m => m.id === data.id)) return old;
            const newMsg: GroupMessage = {
              id: data.id || `ws-${Date.now()}`,
              group_id: data.group_id,
              user_id: data.user_id || '',
              content: data.content,
              author_name: data.author_name,
              display_name: data.display_name,
              is_edited: false,
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

  const startEditing = () => {
    setEditName(group?.name || '');
    setEditDescription(group?.description || '');
    setEditing(true);
  };

  const saveEdit = () => {
    const updates: { name?: string; description?: string } = {};
    if (editName.trim() && editName.trim() !== group?.name) {
      updates.name = editName.trim();
    }
    if (editDescription !== (group?.description || '')) {
      updates.description = editDescription;
    }
    if (Object.keys(updates).length === 0) {
      setEditing(false);
      return;
    }
    updateGroupMutation.mutate(updates);
  };

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center gap-3 px-4 sm:px-8 bg-black/60 backdrop-blur-md">
        <Link href="/chat" className="text-zinc-500 hover:text-green-400 transition-colors shrink-0">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-bold text-green-500 outline-none focus:border-green-500/50 w-40"
                placeholder="Group name"
                maxLength={50}
              />
              <button
                onClick={saveEdit}
                disabled={updateGroupMutation.isPending}
                className="p-1.5 text-green-500 hover:text-green-400 transition-colors disabled:opacity-50"
                title="Save"
              >
                <Save size={14} />
              </button>
              <button
                onClick={() => setEditing(false)}
                className="p-1.5 text-zinc-500 hover:text-zinc-400 transition-colors"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text truncate flex items-center gap-2">
                <Users size={14} className="text-purple-400" />
                {group?.name || 'Group Chat'}
                {isAdmin && (
                  <button
                    onClick={startEditing}
                    className="p-1 text-zinc-600 hover:text-green-400 transition-colors"
                    title="Edit group"
                  >
                    <Edit3 size={12} />
                  </button>
                )}
              </h2>
              {group?.description && !editing && (
                <p className="text-[10px] text-zinc-500 truncate mt-0.5">{group.description}</p>
              )}
            </>
          )}
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
              const isEditing = editingDmId === msg.id;
              return (
                <div key={msg.id} className={`flex ${myMsg ? 'justify-end' : 'justify-start'} group`}>
                  <div className="max-w-[80%]">
                    {!myMsg && (
                      <Link href={`/profile/${msg.author_name}`} className="text-[10px] font-bold text-zinc-500 hover:text-green-400 mb-1 block transition-colors">
                        @{msg.display_name}
                      </Link>
                    )}
                    {isEditing ? (
                      <div className={`px-4 py-2.5 rounded-lg border ${
                        myMsg ? 'bg-purple-500/10 border-purple-500/30 rounded-tr-sm' : 'bg-zinc-900 border-zinc-800'
                      }`}>
                        <textarea
                          value={editDmText}
                          onChange={e => setEditDmText(e.target.value)}
                          className="w-full bg-zinc-900 border border-purple-500/50 rounded-lg p-2 text-sm text-zinc-200 outline-none resize-none mb-2"
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
                                editGroupMsgMutation.mutate({ messageId: msg.id, content: editDmText.trim() });
                              }
                            }}
                            disabled={editGroupMsgMutation.isPending || !editDmText.trim() || editDmText.trim() === msg.content}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded text-[10px] font-bold transition-all"
                          >
                            {editGroupMsgMutation.isPending ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`px-4 py-2.5 rounded-lg border ${
                        myMsg ? 'bg-purple-500/10 border-purple-500/30 rounded-tr-sm' : 'bg-zinc-900 border-zinc-800'
                      }`}>
                        <p className="text-sm text-zinc-100 font-mono"><MentionText text={msg.content} /></p>
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-1">
                            {myMsg && !isEditing && (
                              <button
                                onClick={() => { setEditDmText(msg.content); setEditingDmId(msg.id); }}
                                className="text-[9px] text-zinc-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Edit"
                              >
                                <Edit2 size={11} />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {msg.is_edited && <span className="text-[9px] text-zinc-600 italic">(edited)</span>}
                            <span className="text-[9px] text-zinc-500">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
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
            {/* Header with close button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                <Users size={14} /> Members <span className="text-zinc-600 font-mono normal-case">({members?.length || 0})</span>
              </h3>
              <button
                onClick={() => setShowMembers(false)}
                className="md:hidden p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>

            {editing && (
              <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/20">
                <label className="text-[9px] text-zinc-500 uppercase tracking-widest block mb-1">Description</label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs outline-none focus:border-green-500/50 text-zinc-300 resize-none"
                  rows={2}
                  maxLength={500}
                  placeholder="Group description..."
                />
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[8px] text-zinc-600">{editDescription.length}/500</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditing(false)}
                      className="text-[9px] text-zinc-500 hover:text-zinc-400 uppercase tracking-widest transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={updateGroupMutation.isPending}
                      className="text-[9px] font-bold text-green-500 hover:text-green-400 uppercase tracking-widest transition-colors disabled:opacity-50"
                    >
                      {updateGroupMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {members?.length === 0 ? (
                <div className="px-4 py-8 text-center text-[10px] text-zinc-600">No members yet</div>
              ) : (
                <div className="divide-y divide-zinc-800/40">
                  {members?.map(m => {
                    const isSelf = m.user_id === user?.id;
                    return (
                      <div key={m.user_id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/40 transition-colors">
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          m.role === 'admin' 
                            ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30' 
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}>
                          {m.display_name.charAt(0).toUpperCase()}
                        </div>
                        {/* Name and username */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/profile/${m.username}`} className="text-sm font-bold text-zinc-200 hover:text-green-400 truncate transition-colors">
                              {m.display_name}
                            </Link>
                            {m.role === 'admin' && (
                              <span className="text-[8px] text-yellow-500/70 font-bold uppercase tracking-wider border border-yellow-500/20 px-1 py-0.5 rounded shrink-0">Admin</span>
                            )}
                            {isSelf && (
                              <span className="text-[8px] text-zinc-600">you</span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500">@{m.username}</div>
                        </div>
                        {/* Admin actions */}
                        {isAdmin && !isSelf && m.role !== 'admin' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => promoteMutation.mutate(m.user_id)}
                              className="p-1.5 text-zinc-500 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition-all"
                              title="Promote to admin"
                            >
                              <ShieldAlert size={13} />
                            </button>
                            <button
                              onClick={() => removeMemberMutation.mutate(m.user_id)}
                              className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                              title="Remove member"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="p-3 border-t border-zinc-800 bg-black/20">
                <div className="flex gap-2">
                  <input
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value)}
                    placeholder="Add username..."
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs outline-none focus:border-purple-500/50 text-zinc-200 placeholder-zinc-600"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newMemberName.trim()) {
                        addMemberMutation.mutate(newMemberName.trim());
                      }
                    }}
                  />
                  <button
                    onClick={() => newMemberName.trim() && addMemberMutation.mutate(newMemberName.trim())}
                    disabled={!newMemberName.trim()}
                    className="px-3 py-2 border border-purple-500/40 bg-purple-500/10 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/20 disabled:opacity-50 transition-all"
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
