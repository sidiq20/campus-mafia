"use client";

import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { MessageSquare, Lock, Send, ArrowLeft, Edit2, Trash2 } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BroadcastCooldown } from '@/components/BroadcastCooldown';
import { toast } from 'sonner';
import { MentionText } from '@/components/MentionText';
import { apiFetch, WS_URL } from '@/lib/api';
import Link from 'next/link';

type ChatMessage = {
  id: string;
  channel_type: string;
  channel_id: string | null;
  content: string;
  author_name: string;
  author_display_name: string | null;
  faction_name: string | null;
  is_edited: boolean;
  created_at: string;
};

export default function CommsPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<'global' | 'faction' | null>('global');
  const [content, setContent] = useState('');
  const [sendingLock, setSendingLock] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChannel]);

  // Fetch messages based on active channel
  const { data: messages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: ['chat', activeChannel],
    queryFn: async () => {
      if (!activeChannel) return [];
      const path = activeChannel === 'global' 
        ? '/api/comms/global'
        : `/api/comms/faction/${user?.faction_id}`;
      
      const res = await apiFetch(path);
      if (!res.ok) throw new Error('Failed to load comms');
      return res.json();
    },
    enabled: !!activeChannel && (activeChannel === 'global' || !!user?.faction_id),
    staleTime: 5_000,
    refetchInterval: 2000,
  });

  const mutation = useMutation({
    mutationFn: async (messageContent: string) => {
      const path = activeChannel === 'global' 
        ? '/api/comms/global'
        : `/api/comms/faction/${user?.faction_id}`;
        
      const res = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: messageContent })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Transmission failed');
        throw new Error(errText);
      }
      return res.json();
    },
    onMutate: async (messageContent) => {
      setSendingLock(true);
      await queryClient.cancelQueries({ queryKey: ['chat', activeChannel] });
      const previousMessages = queryClient.getQueryData<ChatMessage[]>(['chat', activeChannel]);
      
      queryClient.setQueryData<ChatMessage[]>(['chat', activeChannel], (old) => {
        const optimisticMsg: ChatMessage = {
          id: `temp-${Date.now()}`,
          channel_type: activeChannel || 'global',
          channel_id: activeChannel === 'global' ? null : (user?.faction_id || null),
          content: messageContent,
          author_name: user?.username || 'phantom',
          author_display_name: user?.display_name || user?.username || 'phantom',
          faction_name: user?.faction_name || 'Unaffiliated',
          is_edited: false,
          created_at: new Date().toISOString(),
        };
        return old ? [...old, optimisticMsg] : [optimisticMsg];
      });
      
      return { previousMessages, messageContent };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['chat', activeChannel], context.previousMessages);
      }
      toast.error(err instanceof Error ? err.message : 'Transmission failed. Signal lost.');
    },
    onSettled: () => {
      setContent('');
      setSendingLock(false);
      queryClient.invalidateQueries({ queryKey: ['chat', activeChannel] });
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
  });

  // Edit/Delete mutations for own messages
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editMessageText, setEditMessageText] = useState('');

  const editMessageMutation = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const res = await apiFetch(`/api/comms/messages/${messageId}`, {
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
      await queryClient.cancelQueries({ queryKey: ['chat', activeChannel] });
      const previousMessages = queryClient.getQueryData<ChatMessage[]>(['chat', activeChannel]);
      queryClient.setQueryData<ChatMessage[]>(['chat', activeChannel], (old) =>
        old?.map(m => m.id === messageId ? { ...m, content } : m)
      );
      setEditingMessageId(null);
      return { previousMessages };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previousMessages) queryClient.setQueryData(['chat', activeChannel], context.previousMessages);
      toast.error(err.message || 'Edit failed');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['chat', activeChannel] }),
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const res = await apiFetch(`/api/comms/messages/${messageId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: ['chat', activeChannel] });
      const previousMessages = queryClient.getQueryData<ChatMessage[]>(['chat', activeChannel]);
      queryClient.setQueryData<ChatMessage[]>(['chat', activeChannel], (old) =>
        old?.filter(m => m.id !== messageId)
      );
      return { previousMessages };
    },
    onError: (err: Error, _messageId, context) => {
      if (context?.previousMessages) queryClient.setQueryData(['chat', activeChannel], context.previousMessages);
      toast.error(err.message || 'Delete failed');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['chat', activeChannel] }),
  });

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!content.trim() || !activeChannel || sendingLock || mutation.isPending) return;
    mutation.mutate(content);
  };

  // Setup WebSocket for real-time updates specific to this page
  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/api/ws`);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ChatMessage') {
          // If the message is for our current channel, invalidate to trigger a refetch
          // (or we could optimistically append, but invalidating ensures order)
          if (
            (activeChannel === 'global' && data.channel_type === 'global') ||
            (activeChannel === 'faction' && data.channel_type === 'faction' && data.channel_id === user?.faction_id)
          ) {
            queryClient.invalidateQueries({ queryKey: ['chat', activeChannel] });
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }
        }
      } catch (err) {
        console.error('WS parse error', err);
      }
    };

    return () => ws.close();
  }, [activeChannel, queryClient, user?.faction_id]);


  return (
    <DashboardLayout>
      <header className="h-14 border-b border-green-500/20 flex items-center px-6 bg-black/40 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">Encrypted Comms</h2>
      </header>
      
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        
        {/* Sidebar Channels List */}
        <div className={`w-full md:w-1/3 md:h-auto border-r border-zinc-800 bg-black/40 flex-col p-4 gap-4 overflow-y-auto shrink-0 ${activeChannel ? 'hidden md:flex' : 'flex'}`}>
          <h3 className="text-xs text-zinc-500 uppercase tracking-widest mb-2 hidden md:block">Available Frequencies</h3>
          
          <div 
            onClick={() => setActiveChannel('global')}
            className={`border p-4 rounded cursor-pointer transition-colors ${
              activeChannel === 'global' ? 'border-green-500 bg-green-500/10' : 'border-green-500/30 bg-green-500/5 hover:border-green-500/50'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <MessageSquare className="text-green-500" size={20} />
              <h3 className="font-bold text-green-500">Global Channel</h3>
            </div>
            <p className="text-xs text-zinc-400">Public broadcasting. High visibility. Zero encryption.</p>
          </div>
          
          {user?.faction_id ? (
            <div 
              onClick={() => setActiveChannel('faction')}
              className={`border p-4 rounded cursor-pointer transition-colors ${
                activeChannel === 'faction' ? 'border-purple-500 bg-purple-500/10' : 'border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Lock className="text-purple-500" size={20} />
                  <h3 className="font-bold text-purple-500">Faction: {user.faction_name}</h3>
                </div>
                <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded uppercase font-bold">Encrypted</span>
              </div>
              <p className="text-xs text-zinc-400">Strictly confidential. Members only.</p>
            </div>
          ) : (
            <div className="border border-zinc-800 bg-zinc-900/50 p-4 rounded opacity-50">
              <div className="flex items-center gap-3 mb-2">
                <Lock className="text-zinc-500" size={20} />
                <h3 className="font-bold text-zinc-500">Faction Channel</h3>
              </div>
              <p className="text-xs text-zinc-600">You must join a syndicate to access encrypted comms.</p>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex-col bg-black/20 min-h-0 ${!activeChannel ? 'hidden md:flex' : 'flex'}`}>
          {!activeChannel ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Lock className="text-zinc-700 w-12 h-12 mx-auto mb-4" />
                <h3 className="text-zinc-500 font-bold uppercase tracking-widest">Select a channel to decrypt</h3>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile Back Button */}
              <div className="md:hidden flex items-center p-3 border-b border-zinc-800 bg-black/60">
                <button 
                  onClick={() => setActiveChannel(null)}
                  className="text-zinc-400 hover:text-green-500 flex items-center gap-2 text-sm uppercase tracking-widest font-bold"
                >
                  <ArrowLeft size={16} />
                  Back to Channels
                </button>
              </div>
              
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {isLoading ? (
                  <div className="text-center text-zinc-500 text-sm py-10 animate-pulse">Decrypting signal...</div>
                ) : messages?.length === 0 ? (
                  <div className="text-center text-zinc-500 text-sm py-10">No logs found on this frequency.</div>
                ) : (
                  messages?.map(msg => {
                    const isMine = msg.author_name === user?.username;
                    const isEditing = editingMessageId === msg.id;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Link href={`/profile/${msg.author_name}`} className={`text-xs font-bold ${isMine ? 'text-zinc-400' : 'text-zinc-300 hover:text-green-400'} transition-colors`}>
                            @{msg.author_display_name || msg.author_name}
                          </Link>
                          {msg.faction_name && activeChannel === 'global' && (
                            <span className="text-[10px] bg-zinc-900 text-zinc-500 px-1 rounded">{msg.faction_name}</span>
                          )}
                          <span className="ml-auto text-[10px] text-zinc-600 flex items-center gap-2">
                            {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
                            {msg.is_edited && <span className="italic">(edited)</span>}
                            {isMine && !isEditing && (
                              <>
                                <button
                                  onClick={() => { setEditMessageText(msg.content); setEditingMessageId(msg.id); }}
                                  className="text-zinc-600 hover:text-blue-400 transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 size={11} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Delete this message?')) deleteMessageMutation.mutate(msg.id);
                                  }}
                                  className="text-zinc-600 hover:text-red-400 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </>
                            )}
                            {!isMine && (
                              <button 
                                onClick={() => { setContent(`@${msg.author_name} `); }}
                                className="text-blue-500 hover:text-blue-400 uppercase font-bold"
                              >
                                Reply
                              </button>
                            )}
                          </span>
                        </div>
                        {isEditing ? (
                          <div className="w-full max-w-[80%]">
                            <textarea
                              value={editMessageText}
                              onChange={e => setEditMessageText(e.target.value)}
                              className={`w-full bg-zinc-900 border border-green-500/50 rounded-lg p-2 text-sm text-zinc-200 outline-none resize-none mb-2 ${
                                activeChannel === 'global' ? 'bg-green-500/10' : 'bg-purple-500/10'
                              }`}
                              rows={2}
                              autoFocus
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => setEditingMessageId(null)}
                                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => {
                                  if (editMessageText.trim()) {
                                    editMessageMutation.mutate({ messageId: msg.id, content: editMessageText.trim() });
                                  }
                                }}
                                disabled={editMessageMutation.isPending || !editMessageText.trim() || editMessageText.trim() === msg.content}
                                className={`px-3 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-50 ${
                                  activeChannel === 'global'
                                    ? 'bg-green-600 hover:bg-green-500 text-white'
                                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                                }`}
                              >
                                {editMessageMutation.isPending ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={`px-4 py-2 rounded max-w-[80%] ${
                            isMine
                              ? (activeChannel === 'global' ? 'bg-green-500/20 text-green-100 border border-green-500/30' : 'bg-purple-500/20 text-purple-100 border border-purple-500/30')
                              : 'bg-zinc-900 text-zinc-200 border border-zinc-800'
                          }`}>
                            <p className="text-sm whitespace-pre-wrap"><MentionText text={msg.content} /></p>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 border-t border-zinc-800 bg-black/40">
                <div className="flex items-center justify-between mb-2">
                  <BroadcastCooldown />
                </div>
                <form onSubmit={handleSend} className="flex gap-2">
                  <input
                    type="text"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={activeChannel === 'global' ? "Broadcast to all syndicates..." : "Transmit encrypted comm..."}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-4 py-2 text-sm outline-none focus:border-green-500/50 text-zinc-200 placeholder:text-zinc-600"
                  />
                  <button 
                    type="submit"
                    disabled={!content.trim() || mutation.isPending}
                    className={`px-4 py-2 rounded flex items-center justify-center transition-colors disabled:opacity-50 ${
                      activeChannel === 'global' ? 'bg-green-500 hover:bg-green-600 text-black' : 'bg-purple-500 hover:bg-purple-600 text-white'
                    }`}
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
        
      </div>
    </DashboardLayout>
  );
}
