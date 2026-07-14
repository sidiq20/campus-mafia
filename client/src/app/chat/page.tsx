"use client";

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { PullToRefresh } from '@/components/PullToRefresh';
import Link from 'next/link';
import { Search, User, MessageSquare } from 'lucide-react';
import { apiFetch } from '@/lib/api';

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
};

export default function ChatsIndexPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  
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

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center px-8 bg-black/60 backdrop-blur-md">
        <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text">Direct Channels</h2>
      </header>

      <PullToRefresh onRefresh={refetchChats} className="flex-1 p-8 bg-[#050505]">
        <div className="max-w-lg mx-auto space-y-8">
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
                      <span className="block font-bold text-zinc-200">{user.display_name}</span>
                      <span className="text-[10px] text-zinc-500">@{user.username}</span>
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
                    <span className="font-bold text-zinc-200">{chat.display_name}</span>
                    <span className="text-[9px] text-zinc-600 font-mono">
                      {new Date(chat.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate">{chat.last_message}</p>
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
