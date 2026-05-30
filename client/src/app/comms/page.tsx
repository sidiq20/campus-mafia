"use client";

import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { MessageSquare, Lock, Send } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch, WS_URL } from '@/lib/api';

type ChatMessage = {
  id: string;
  channel_type: string;
  channel_id: string | null;
  content: string;
  author_name: string;
  faction_name: string | null;
  created_at: string;
};

export default function CommsPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<'global' | 'faction' | null>('global');
  const [content, setContent] = useState('');
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
    refetchInterval: 2000, // Fallback polling in case WS misses something
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const path = activeChannel === 'global' 
        ? '/api/comms/global'
        : `/api/comms/faction/${user?.faction_id}`;
        
      const res = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (!res.ok) throw new Error('Transmission failed');
      return res.json();
    },
    onSuccess: () => {
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['chat', activeChannel] });
    },
    onError: () => {
      toast.error('Transmission failed. Signal lost.');
    }
  });

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!content.trim() || !activeChannel) return;
    mutation.mutate();
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
      
      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar Channels List */}
        <div className="w-1/3 border-r border-zinc-800 bg-black/40 flex flex-col p-4 gap-4 overflow-y-auto">
          <h3 className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Available Frequencies</h3>
          
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
        <div className="flex-1 flex flex-col bg-[#050505]">
          {!activeChannel ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Lock className="text-zinc-700 w-12 h-12 mx-auto mb-4" />
                <h3 className="text-zinc-500 font-bold uppercase tracking-widest">Select a channel to decrypt</h3>
              </div>
            </div>
          ) : (
            <>
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {isLoading ? (
                  <div className="text-center text-zinc-500 text-sm py-10 animate-pulse">Decrypting signal...</div>
                ) : messages?.length === 0 ? (
                  <div className="text-center text-zinc-500 text-sm py-10">No logs found on this frequency.</div>
                ) : (
                  messages?.map(msg => (
                    <div key={msg.id} className={`flex flex-col ${msg.author_name === user?.username ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold ${msg.author_name === user?.username ? 'text-zinc-400' : 'text-zinc-300'}`}>
                          @{msg.author_name}
                        </span>
                        {msg.faction_name && activeChannel === 'global' && (
                          <span className="text-[10px] bg-zinc-900 text-zinc-500 px-1 rounded">{msg.faction_name}</span>
                        )}
                      </div>
                      <div className={`px-4 py-2 rounded max-w-[80%] ${
                        msg.author_name === user?.username 
                          ? (activeChannel === 'global' ? 'bg-green-500/20 text-green-100 border border-green-500/30' : 'bg-purple-500/20 text-purple-100 border border-purple-500/30')
                          : 'bg-zinc-900 text-zinc-200 border border-zinc-800'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 border-t border-zinc-800 bg-black/40">
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
