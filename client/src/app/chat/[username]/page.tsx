"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
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

export default function DirectChatPage() {
  const { username } = useParams() as { username: string };
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: ['chat', username],
    queryFn: async () => {
      const res = await apiFetch(`/api/chat/direct/${username}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
  });

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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center px-8 bg-black/60 backdrop-blur-md">
        <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text">Direct Channel // @{username}</h2>
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
              onChange={e => setContent(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-4 py-3 text-sm outline-none focus:border-green-500/50 text-zinc-200"
              placeholder="Secure transmission..."
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && mutation.mutate({ receiver_username: username, content })}
            />
            <button 
              onClick={() => mutation.mutate({ receiver_username: username, content })}
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
