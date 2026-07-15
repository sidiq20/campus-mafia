"use client";

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { PullToRefresh } from '@/components/PullToRefresh';
import Link from 'next/link';
import { Search, User, MessageSquare, Users, Plus, X, UserPlus, Radio } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { p2pManager } from '@/lib/offline';
import P2PScanAnimation from '@/components/P2PScanAnimation';

type UserData = {
  id: string;
  username: string;
  display_name: string;
};

type ChatListItem = {
  username: string;
  display_name: string;
  last_message: string;
  created_at: string;
  unread_count: number;
};

export default function ChatsIndexPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<string>('');
  const [suggestedContacts, setSuggestedContacts] = useState<string[]>([]);
  
  const prefetchChat = useCallback((username: string) => {
    queryClient.prefetchQuery({
      queryKey: ['chat', username],
      queryFn: async () => {
        const res = await apiFetch(`/api/chat/direct/${username}`);
        if (!res.ok) throw new Error('Failed to fetch messages');
        return res.json();
      },
      staleTime: 10_000,
    });
  }, [queryClient]);

  const { data: users } = useQuery<UserData[]>({
    queryKey: ['users', search],
    queryFn: async () => {
      if (!search.trim()) return [];
      const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(search)}`);
      return res.ok ? res.json() : [];
    },
    enabled: search.trim().length > 0,
    staleTime: 30_000,
  });

  const { data: chats, refetch: refetchChats } = useQuery<ChatListItem[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      const res = await apiFetch('/api/chat/direct');
      return res.ok ? res.json() : [];
    },
    staleTime: 30_000,
  });

  type Group = {
    id: string;
    name: string;
    member_count: number;
    created_by_name: string;
  };

  const { data: groups, refetch: refetchGroups } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await apiFetch('/api/groups');
      return res.ok ? res.json() : [];
    },
    staleTime: 30_000,
  });

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const members = groupMembers.split(',').map(m => m.trim()).filter(Boolean);
      const res = await apiFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName, member_usernames: members })
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Group created!');
      setShowCreateGroup(false);
      setGroupName('');
      setGroupMembers('');
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  // Suggest contacts from recent conversations for group building
  const { data: recentContacts } = useQuery<ChatListItem[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      const res = await apiFetch('/api/chat/direct');
      return res.ok ? res.json() : [];
    },
    staleTime: 30_000,
  });

  const toggleSuggestion = (username: string) => {
    setGroupMembers(prev => {
      const current = prev.split(',').map(m => m.trim()).filter(Boolean);
      if (current.includes(username)) {
        return current.filter(m => m !== username).join(', ');
      }
      return [...current, username].join(', ');
    });
  };

  // Filter out already-added and self from suggestions
  const memberList = groupMembers.split(',').map(m => m.trim()).filter(Boolean);
  const contactSuggestions = recentContacts?.filter(c => !memberList.includes(c.username)).slice(0, 8) || [];

  // P2P local network — poll for reactive updates
  const [p2pPeers, setP2pPeers] = useState<string[]>([]);
  useEffect(() => {
    const interval = setInterval(() => {
      setP2pPeers(p2pManager.getConnectedPeers());
    }, 2000);
    setP2pPeers(p2pManager.getConnectedPeers());
    return () => clearInterval(interval);
  }, []);

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center px-4 sm:px-8 bg-black/60 backdrop-blur-md">
        <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text">Direct Channels</h2>
        <button
          onClick={() => setShowCreateGroup(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-green-400 hover:border-green-500/30 transition-all"
        >
          <Plus size={14} />
          Group
        </button>
      </header>

      <PullToRefresh onRefresh={() => { refetchChats(); refetchGroups(); }} className="flex-1 p-4 sm:p-8 bg-[#050505]">
        <div className="max-w-lg mx-auto space-y-8">
          {/* Create Group Modal */}
          {showCreateGroup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateGroup(false)}>
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
              <div className="relative bg-zinc-950 border border-zinc-800 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] max-w-lg w-full p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">Create Group</h3>
                  <button onClick={() => setShowCreateGroup(false)} className="text-zinc-600 hover:text-zinc-400"><X size={16} /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block">Group Name</label>
                    <input
                      value={groupName}
                      onChange={e => setGroupName(e.target.value)}
                      placeholder="Operation room..."
                      className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-green-500/50 text-zinc-200 placeholder-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block flex items-center gap-1.5">
                      <UserPlus size={12} /> Members (comma-separated usernames)
                    </label>
                    <input
                      value={groupMembers}
                      onChange={e => setGroupMembers(e.target.value)}
                      placeholder="user1, user2, user3"
                      className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-green-500/50 text-zinc-200 placeholder-zinc-600"
                    />
                    
                    {/* Recent conversation suggestions */}
                    {contactSuggestions.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-2">From recent conversations:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {contactSuggestions.map(c => (
                            <button
                              key={c.username}
                              onClick={() => toggleSuggestion(c.username)}
                              className={`text-[10px] px-2.5 py-1.5 rounded-full border transition-all ${
                                memberList.includes(c.username)
                                  ? 'bg-green-500/10 border-green-500/40 text-green-400'
                                  : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                              }`}
                            >
                              {memberList.includes(c.username) ? '✓ ' : '+ '}
                              @{c.username}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => createGroupMutation.mutate()}
                    disabled={!groupName.trim() || createGroupMutation.isPending}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-bold transition-all"
                  >
                    {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-3 text-zinc-500" size={18} />
            <input 
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search operative by name or username..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-12 pr-4 py-3 text-sm outline-none focus:border-green-500/50 text-zinc-200"
            />
          </div>

          {/* Local P2P Network */}
          {!search && (
            <div>
              <h3 className="text-xs font-bold text-green-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Radio size={14} className="text-green-400" />
                <span>Local Network</span>
                {p2pPeers.length > 0 && (
                  <span className="relative w-2 h-2 ml-1">
                    <span className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-60" />
                    <span className="absolute inset-0 bg-green-500 rounded-full" />
                  </span>
                )}
              </h3>
              
              {/* Peers connected — show chat link */}
              {p2pPeers.length > 0 ? (
                <Link
                  href="/chat/local"
                  className="flex items-center gap-3 p-4 bg-black/60 border border-green-500/20 rounded-lg hover:border-green-500/40 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center shrink-0 group-hover:shadow-[0_0_10px_rgba(34,197,94,0.3)] transition-shadow">
                    <Radio size={14} className="text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-green-400 truncate">Local Area Chat</div>
                    <div className="text-[10px] text-zinc-500">{p2pPeers.length} peer{p2pPeers.length > 1 ? 's' : ''} nearby · P2P encrypted</div>
                  </div>
                </Link>
              ) : (
                /* Scanning animation when no peers yet */
                <div className="flex items-center gap-4 p-4 bg-black/60 border border-zinc-800 rounded-lg">
                  <P2PScanAnimation active={true} peerCount={0} size="md" />
                  <div>
                    <div className="text-sm font-bold text-zinc-500">Local Area Chat</div>
                    <div className="text-[10px] text-zinc-600 flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-600 animate-pulse inline-block" />
                      Scanning for nearby operatives...
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Group Chats */}
          {groups && groups.length > 0 && !search && (
            <div>
              <h3 className="text-xs font-bold text-purple-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Users size={14} /> Group Chats
              </h3>
              <div className="space-y-2">
                {groups.map(g => (
                  <Link
                    key={g.id}
                    href={`/chat/group/${g.id}`}
                    className="flex items-center gap-3 p-4 bg-black/60 border border-purple-500/20 rounded-lg hover:border-purple-500/40 transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center shrink-0">
                      <Users size={14} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-zinc-200 truncate">{g.name}</div>
                      <div className="text-[10px] text-zinc-500">{g.member_count} members · by @{g.created_by_name}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* User Search Results */}
          {search ? (
            <div className="space-y-3">
              {users?.map(user => (
                <Link 
                  key={user.id}
                  href={`/chat/${user.username}`}
                  onPointerEnter={() => prefetchChat(user.username)}
                  className="flex items-center justify-between p-4 bg-black/60 border border-zinc-800 rounded-lg hover:border-green-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center">
                      <User size={14} className="text-zinc-500" />
                    </div>
                    <div>
                      <Link href={`/profile/${user.username}`} onClick={(e) => e.stopPropagation()} className="block font-bold text-zinc-200 hover:text-green-400 transition-colors">{user.display_name}</Link>
                      <Link href={`/profile/${user.username}`} onClick={(e) => e.stopPropagation()} className="text-[10px] text-zinc-500 hover:text-green-400 transition-colors">@{user.username}</Link>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Recent Conversations</h3>
              {chats?.map(chat => (
                <Link 
                  key={chat.username}
                  href={`/chat/${chat.username}`}
                  onPointerEnter={() => prefetchChat(chat.username)}
                  className="block p-4 bg-black/60 border border-zinc-800 rounded-lg hover:border-green-500/30 transition-colors"
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link href={`/profile/${chat.username}`} onClick={(e) => e.stopPropagation()} className="font-bold text-zinc-200 hover:text-green-400 truncate transition-colors">{chat.display_name}</Link>
                      {chat.unread_count > 0 && (
                        <span className="bg-green-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 shadow-[0_0_6px_rgba(0,255,65,0.4)]">
                          {chat.unread_count}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-zinc-600 font-mono shrink-0">
                      {new Date(chat.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className={`text-xs truncate ${chat.unread_count > 0 ? 'text-zinc-300 font-bold' : 'text-zinc-400'}`}>{chat.last_message}</p>
                </Link>
              ))}
              {(!chats || chats.length === 0) && <p className="text-center text-zinc-700 py-8 italic">No recent chats.</p>}
            </div>
          )}
        </div>
      </PullToRefresh>
    </DashboardLayout>
  );
}
