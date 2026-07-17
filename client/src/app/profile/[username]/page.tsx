"use client";

import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MentionText } from '@/components/MentionText';
import { apiFetch } from '@/lib/api';
import { User, Shield, Zap, Target, AlertTriangle, Radio, MessageSquare, Pin, Send, Loader2, X } from 'lucide-react';
import { RankBadgeFull } from '@/components/RankBadge';
import Link from 'next/link';
import { toast } from 'sonner';
import { useUser } from '@/contexts/UserContext';
import { useState } from 'react';

// Shared Post type for profile card
type Post = {
  id: string;
  content: string;
  influence_earned: number;
  author_name: string;
  author_username: string | null;
  faction_name: string | null;
  is_anonymous: boolean | null;
  user_id: string | null;
  reply_count: number;
  has_boosted: boolean;
  has_reposted: boolean;
  created_at: string;
};

export default function UserProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const { user: localUser } = useUser();
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const queryClient = useQueryClient();

  const transferMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiFetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_username: username, amount }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || 'Transfer failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(`Sent ${transferAmount} INF to @${username}`);
      setShowTransfer(false);
      setTransferAmount('');
      queryClient.invalidateQueries({ queryKey: ['user', username] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user', username],
    queryFn: async () => {
      const res = await apiFetch(`/api/users/${username}`);
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center bg-[#050505] text-green-500 animate-pulse">
          Decrypting profile data for {username}...
        </div>
      </DashboardLayout>
    );
  }

  if (error || !user) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center bg-[#050505] text-red-500">
          Operative {username} not found or data encrypted beyond reach.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <header className="h-14 border-b border-green-500/20 flex items-center px-6 bg-black/40 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">Operative Profile: @{username}</h2>
      </header>

      <div className="flex-1 p-6 pb-24 overflow-y-auto bg-[#050505]">
        <div className="max-w-2xl mx-auto space-y-6">
          
          {/* Header Card */}
          <div className="border border-green-500/30 bg-black/80 backdrop-blur-xl p-8 rounded-lg relative overflow-hidden shadow-[0_0_40px_rgba(34,197,94,0.1)]">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-8 relative z-10">
              <div className="w-24 h-24 rounded-xl bg-black border-2 border-green-500/50 flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.2)] shrink-0">
                <User size={48} className="text-green-500" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 tracking-tighter mb-1">@{user.username}</h1>
                
                <Link
                  href={user.faction_id ? `/factions/${user.faction_id}` : '#'}
                  className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs font-bold text-zinc-300 ${
                    user.faction_name ? 'hover:border-purple-500/50 hover:text-purple-400 hover:bg-purple-500/10 transition-all' : 'pointer-events-none'
                  }`}
                >
                  <Shield size={14} className={user.faction_name ? "text-purple-500" : "text-zinc-500"} />
                  {user.faction_name ? `Syndicate: ${user.faction_name}` : 'Unaffiliated'}
                </Link>
              </div>

              <div className="flex flex-col gap-2">
                <RankBadgeFull rank={user.rank} influence={user.influence} />
                <div className="flex flex-col gap-2">
                  <Link 
                    href={`/chat/${username}`} 
                    className="px-4 py-2 bg-green-500/10 text-green-400 border border-green-500/40 rounded text-xs font-bold uppercase tracking-widest hover:bg-green-500/20 text-center"
                  >
                    Message
                  </Link>
                  {localUser && localUser.username !== username && (
                    <button
                      onClick={() => setShowTransfer(true)}
                      className="px-4 py-2 bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded text-xs font-bold uppercase tracking-widest hover:bg-yellow-500/20 text-center flex items-center justify-center gap-1.5"
                    >
                      <Send size={12} /> Send INF
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-zinc-800 bg-black/40 p-5 rounded">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="text-yellow-500" size={18} />
                <h3 className="text-sm font-bold text-zinc-400 uppercase">Influence</h3>
              </div>
              <p className="text-3xl font-bold text-zinc-100">{user.influence}</p>
            </div>

            <div className="border border-zinc-800 bg-black/40 p-5 rounded">
              <div className="flex items-center gap-2 mb-3">
                <Target className="text-blue-500" size={18} />
                <h3 className="text-sm font-bold text-zinc-400 uppercase">Reputation</h3>
              </div>
              <p className="text-3xl font-bold text-zinc-100">{user.reputation}</p>
            </div>

            <div className="border border-zinc-800 bg-black/40 p-5 rounded">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="text-red-500" size={18} />
                <h3 className="text-sm font-bold text-zinc-400 uppercase">Heat Level</h3>
              </div>
              <p className="text-3xl font-bold text-zinc-100">{user.heat_level}%</p>
            </div>
          </div>

          {/* Their Broadcasts */}
          <OtherUserPostsSection username={username} />

          {/* INF Transfer Modal */}
          {showTransfer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowTransfer(false)}>
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
              <div
                className="relative bg-zinc-950 border border-zinc-800 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] max-w-sm w-full p-6 animate-fade-in"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-widest flex items-center gap-2">
                    <Send size={14} className="text-yellow-400" /> Send INF
                  </h3>
                  <button onClick={() => setShowTransfer(false)} className="text-zinc-600 hover:text-zinc-400">
                    <X size={16} />
                  </button>
                </div>

                <p className="text-[10px] text-zinc-500 mb-4">
                  Send INF to <span className="text-yellow-400 font-bold">@{username}</span>.
                  They will receive the full amount instantly.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block">Amount (INF)</label>
                    <input
                      type="number"
                      min={1}
                      value={transferAmount}
                      onChange={e => setTransferAmount(e.target.value)}
                      placeholder="Enter amount..."
                      className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-3 text-sm outline-none focus:border-yellow-500/50 text-zinc-200 placeholder-zinc-600"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowTransfer(false)}
                      className="flex-1 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const amount = parseInt(transferAmount);
                        if (isNaN(amount) || amount <= 0) {
                          toast.error('Enter a valid amount');
                          return;
                        }
                        transferMutation.mutate(amount);
                      }}
                      disabled={!transferAmount || parseInt(transferAmount) <= 0 || transferMutation.isPending}
                      className="flex-1 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs font-bold text-yellow-400 hover:bg-yellow-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {transferMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                      Send {transferAmount ? `${parseInt(transferAmount)} INF` : ''}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}

function OtherUserPostsSection({ username }: { username: string }) {
  const queryClient = useQueryClient();
  const { data: posts, isLoading } = useQuery<Post[]>({
    queryKey: ['user-posts', username],
    queryFn: async () => {
      const res = await apiFetch(`/api/posts?author_id=${username}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  return (
    <div className="border border-zinc-800 bg-black/40 p-6 rounded-lg">
      <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Radio size={18} className="text-green-500" /> Broadcasts
      </h3>
      {isLoading ? (
        <p className="text-xs text-zinc-600 animate-pulse">Decrypting transmissions...</p>
      ) : !posts || posts.length === 0 ? (
        <p className="text-xs text-zinc-600 italic">No broadcasts yet.</p>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {posts.map(p => (
            <OtherUserPostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function OtherUserPostCard({ post }: { post: Post }) {
  const queryClient = useQueryClient();
  const { user: localUser } = useUser();
  const router = useRouter();

  const boostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/posts/${post.id}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction_type: 'boost' })
      });
      if (!res.ok) throw new Error('Failed to boost');
    },
    onSuccess: () => {
      toast.success("Boosted (+1 INF)");
      queryClient.invalidateQueries({ queryKey: ['user-posts', post.author_name] });
    }
  });

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) return;
    router.push(`/posts/${post.id}`);
  };

  return (
    <div
      onClick={handleCardClick}
      className="border border-zinc-800 bg-black/30 p-4 rounded-lg hover:border-green-500/20 transition-all cursor-pointer"
    >
      <p className="text-xs text-zinc-300 leading-relaxed mb-3 font-mono hover:text-green-300 transition-colors"><MentionText text={post.content} /></p>
      <div className="flex items-center gap-4 pt-3 border-t border-zinc-800/50">
        <button onClick={(e) => { e.stopPropagation(); if (!localUser) { toast.error('Login first'); return; } boostMutation.mutate(); }} disabled={boostMutation.isPending || post.has_boosted}
          className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${post.has_boosted ? 'text-green-500 cursor-default' : 'text-zinc-500 hover:text-green-400'}`}>
          <Zap size={12} className={post.has_boosted ? "fill-green-500" : ""} /> {post.has_boosted ? 'Boosted' : 'Boost'}
        </button>
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest"><MessageSquare size={12} className="inline mr-1" />{post.reply_count}</span>
      </div>
    </div>
  );
}

