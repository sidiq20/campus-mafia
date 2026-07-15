"use client";

import { useState, useRef } from 'react';
import { Zap, Trash2, MessageSquare, ShieldAlert, TrendingUp, Pin, Repeat2, Search } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { DailyInfTracker } from '@/components/DailyInfTracker';
import { BroadcastCooldown } from '@/components/BroadcastCooldown';
import { PullToRefresh } from '@/components/PullToRefresh';
import { MentionText } from '@/components/MentionText';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
  boost_count: number;
  repost_count: number;
  has_boosted: boolean;
  has_reposted: boolean;
  created_at: string;
};

type Comment = {
  id: string;
  post_id: string;
  content: string;
  author_username: string | null;
  author_name: string;
  created_at: string;
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: posts, isLoading, refetch } = useQuery<Post[]>({
    queryKey: ['posts'],
    queryFn: async () => {
      const res = await apiFetch('/api/posts');
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
    staleTime: 30_000,
  });

  // Client-side filter for immediate visual feedback; search page is the primary endpoint
  const filteredPosts = searchQuery.trim()
    ? posts?.filter(post => 
        post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.author_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : posts;

  const mutation = useMutation({
    mutationFn: async (newPost: { content: string, is_anonymous: boolean }) => {
      const res = await apiFetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPost)
      });
      if (!res.ok) throw new Error('Failed to create post');
      return res.json();
    },
    onMutate: async (newPost) => {
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      await queryClient.cancelQueries({ queryKey: ['me'] });
      
      const previousPosts = queryClient.getQueryData<Post[]>(['posts']);
      const previousUser = queryClient.getQueryData<any>(['me']);
      
      if (previousUser) {
        queryClient.setQueryData(['me'], {
          ...previousUser,
          influence: previousUser.influence + 10
        });
      }
      
      queryClient.setQueryData<Post[]>(['posts'], (old) => {
        const optimisticPost: Post = {
          id: `temp-${Date.now()}`,
          content: newPost.content,
          influence_earned: 0,
          author_name: newPost.is_anonymous ? 'Anonymous' : (user?.username || 'phantom'),
          author_username: user?.username || null,
          faction_name: newPost.is_anonymous ? null : (user?.faction_name || null),
          is_anonymous: newPost.is_anonymous,
          user_id: user?.id || null,
          reply_count: 0,
          boost_count: 0,
          repost_count: 0,
          has_boosted: false,
          has_reposted: false,
          created_at: new Date().toISOString(),
        };
        return old ? [optimisticPost, ...old] : [optimisticPost];
      });
      return { previousPosts, previousUser };
    },
    onError: (err, newPost, context) => {
      if (context?.previousPosts) {
        queryClient.setQueryData(['posts'], context.previousPosts);
      }
      if (context?.previousUser) {
        queryClient.setQueryData(['me'], context.previousUser);
      }
      setContent(newPost.content);
      const msg = err instanceof Error ? err.message : 'Transmission failed. Signal lost.';
      toast.error('Broadcast Blocked', { description: msg });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onSuccess: () => {
      setContent('');
      toast.success('Broadcast sent (+10 INF)');
    },
  });

  const handleBroadcast = () => {
    if (!content.trim()) return;
    mutation.mutate({ content, is_anonymous: isAnonymous });
  };

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center justify-between px-8 bg-black/60 backdrop-blur-md">
        <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text">Global Feed // Live</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) {
              router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
            }
          }}
          className="relative"
        >
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search intel, operatives..."
            className="bg-zinc-900 border border-zinc-800 rounded pl-9 pr-4 py-1.5 text-xs outline-none focus:border-green-500/50 text-zinc-200 w-64"
          />
        </form>
      </header>
      
      <PullToRefresh onRefresh={refetch} className="flex-1">
        <div className="p-8 space-y-8 pb-24">
          {/* Daily INF Tracker */}
          <div className="max-w-2xl mx-auto">
            <DailyInfTracker />
          </div>

          {/* Post Input */}
          <div className="p-6 border border-zinc-800 bg-black/60 backdrop-blur rounded-lg focus-within:border-green-500/50 transition-all duration-300 shadow-[0_0_20px_rgba(0,0,0,0.5)] animate-slide-in">
            <textarea 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-transparent resize-none outline-none text-sm placeholder:text-zinc-600 text-zinc-100" 
              placeholder="Broadcast encrypted intel..."
              rows={3}
            ></textarea>
            <div className="flex justify-between items-center mt-4 border-t border-zinc-800 pt-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <BroadcastCooldown />
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest" title="+10 INF Reward"><TrendingUp size={10} className="inline mr-1" /><span className="hidden sm:inline">+10 INF Reward</span></span>
                <label className="flex items-center gap-1 sm:gap-2 cursor-pointer text-xs text-zinc-400 hover:text-green-400 transition-colors" title="Incognito">
                  <input 
                    type="checkbox" 
                    checked={isAnonymous} 
                    onChange={(e) => setIsAnonymous(e.target.checked)} 
                    className="accent-green-500"
                  />
                  <ShieldAlert size={14} /> <span className="hidden sm:inline">Incognito</span>
                </label>
              </div>
              <button 
                onClick={handleBroadcast}
                disabled={mutation.isPending || !content.trim()}
                title="Broadcast"
                className="px-3 sm:px-6 py-2 bg-green-500/10 text-green-400 border border-green-500/40 rounded text-xs font-bold uppercase tracking-widest hover:bg-green-500/20 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all duration-300 disabled:opacity-50"
              >
                {mutation.isPending ? '...' : '📡'}
                <span className="hidden sm:inline ml-1">{mutation.isPending ? 'Transmitting...' : 'Broadcast'}</span>
              </button>
            </div>
          </div>

          {/* Real Posts */}
          {isLoading ? (
            <div className="text-center text-green-500 text-sm py-12 animate-pulse font-mono">// Scanning frequencies...</div>
          ) : filteredPosts?.length === 0 ? (
            <div className="text-center text-zinc-600 text-sm py-12">No intel matches your search.</div>
          ) : (
            <div className="space-y-6">
              {filteredPosts?.map((post, i) => (
                <div key={post.id} className="animate-slide-in" style={{ animationDelay: `${i * 100}ms` }}>
                  <PostCard 
                    post={post}
                    isMine={!!user && user.id === post.user_id}
                    isAnonymousUser={!user}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </PullToRefresh>
    </DashboardLayout>
  );
}

function PostCard({ post, isMine, isAnonymousUser }: { post: Post, isMine: boolean, isAnonymousUser?: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const isPinned = user?.pinned_post_id === post.id;
  const router = useRouter();

  const displayAuthor = post.is_anonymous ? 'Anonymous' : `@${post.author_name}`;
  const displayFaction = post.is_anonymous ? 'Classified' : (post.faction_name || 'Unaffiliated');

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/posts/${post.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      toast.success("Broadcast purged");
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    }
  });

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
      toast.success("Broadcast boosted (+1 INF)");
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });

  const repostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/posts/${post.id}/repost`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to repost');
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.status === 'reposted' ? 'Broadcast retransmitted' : 'Repost removed');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    }
  });

  const pinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/posts/${post.id}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: isPinned ? null : post.id })
      });
      if (!res.ok) throw new Error('Failed to toggle pin');
      return res.json();
    },
    onSuccess: () => {
      toast.success(isPinned ? 'Broadcast unpinned' : 'Broadcast pinned to profile');
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });

  const commentSendingRef = useRef(false);

  const { data: comments } = useQuery<Comment[]>({
    queryKey: ['comments', post.id],
    queryFn: async () => {
      const res = await apiFetch(`/api/posts/${post.id}/comments`);
      return res.json();
    },
    enabled: showComments,
    staleTime: 15_000,
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText })
      });
      if (!res.ok) throw new Error('Failed to comment');
    },
    onMutate: () => { commentSendingRef.current = true; },
    onSuccess: () => {
      setCommentText('');
      toast.success("Comment added (+2 INF)");
      queryClient.invalidateQueries({ queryKey: ['comments', post.id] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onSettled: () => { commentSendingRef.current = false; },
  });

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if interacting with buttons/links inside
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea')) return;
    router.push(`/posts/${post.id}`);
  };

  return (
    <div 
      onClick={handleCardClick}
      className="border border-zinc-800 bg-black/60 p-6 rounded-lg hover:border-green-500/30 transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.3)] cursor-pointer"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500" onClick={e => e.stopPropagation()}>
            <Zap size={14} />
          </div>
          <div>
            {post.is_anonymous ? (
              <span className="block font-bold text-sm text-zinc-500">Anonymous</span>
            ) : (
              <div className="flex items-center gap-2">
                <Link href={`/profile/${post.author_username || post.author_name}`} onClick={e => e.stopPropagation()} className="block font-bold text-sm text-zinc-200 hover:text-green-400">@{post.author_name}</Link>
                <Link href={`/chat/${post.author_username || post.author_name}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-green-600 hover:text-green-400 border border-green-900 px-1 rounded uppercase">DM</Link>
              </div>
            )}
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{displayFaction}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono text-zinc-600">
            {post.created_at ? new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
          </span>
          {isMine && (
            <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(); }} className="text-zinc-600 hover:text-red-500 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed mb-6 font-mono hover:text-green-300 transition-colors"><MentionText text={post.content} /></p>
      <div className="flex justify-between items-center pt-4 border-t border-zinc-800/50">
        <div className="flex items-center gap-6 sm:gap-10">
          {/* Reply */}
          <button 
            onClick={(e) => { e.stopPropagation(); setShowComments(!showComments); }}
            className="group flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-400 transition-colors"
            title={`${post.reply_count} Replies`}
          >
            <MessageSquare size={16} className="group-hover:text-blue-400 transition-colors" />
            <span className="font-medium tabular-nums">{post.reply_count || ''}</span>
          </button>
          {/* Boost */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (isAnonymousUser) {
                toast.error("Anonymous Operatives cannot boost transmissions. Create an identity first.");
                return;
              }
              boostMutation.mutate();
            }} 
            disabled={boostMutation.isPending || post.has_boosted}
            className={`group flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50 ${post.has_boosted ? 'text-green-500 cursor-default' : 'text-zinc-500 hover:text-green-400'}`}
            title={post.has_boosted ? 'Boosted' : 'Boost'}
          >
            <Zap size={16} className={`transition-colors ${post.has_boosted ? 'fill-green-500 text-green-500' : 'group-hover:text-green-400'}`} />
            <span className={`font-medium tabular-nums ${post.has_boosted ? 'text-green-500' : ''}`}>{post.boost_count || ''}</span>
          </button>
          {/* Repost */}
          <button 
            onClick={(e) => { e.stopPropagation(); !isAnonymousUser && repostMutation.mutate(); }}
            disabled={repostMutation.isPending}
            className={`group flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50 ${post.has_reposted ? 'text-green-500 cursor-default' : 'text-zinc-500 hover:text-green-400'}`}
            title={post.has_reposted ? 'Reposted' : 'Repost'}
          >
            <Repeat2 size={16} className={`transition-colors ${post.has_reposted ? 'text-green-500' : 'group-hover:text-green-400'}`} />
            <span className={`font-medium tabular-nums ${post.has_reposted ? 'text-green-500' : ''}`}>{post.repost_count || ''}</span>
          </button>
          {/* Pin (own posts only) */}
          {isMine && (
            <button 
              onClick={(e) => { e.stopPropagation(); pinMutation.mutate(); }}
              disabled={pinMutation.isPending}
              className={`group flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50 ${isPinned ? 'text-yellow-500' : 'text-zinc-500 hover:text-yellow-400'}`}
              title={isPinned ? 'Pinned' : 'Pin'}
            >
              <Pin size={16} className={`transition-colors ${isPinned ? 'fill-yellow-500 text-yellow-500' : 'group-hover:text-yellow-400'}`} />
            </button>
          )}
        </div>
      </div>

      {showComments && (
        <div className="mt-6 pt-6 border-t border-zinc-800 space-y-4 pl-4 sm:pl-6 border-l border-zinc-800">
          {comments?.map(c => (
            <div key={c.id} className="text-xs flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
              <div className="min-w-0">
                <Link href={`/profile/${c.author_username || c.author_name}`} onClick={(e) => e.stopPropagation()} className="font-bold text-zinc-400 hover:text-green-400 mr-2 sm:mr-3 transition-colors whitespace-nowrap">@{c.author_name}</Link>
                <span className="text-zinc-300 break-words"><MentionText text={c.content} /></span>
              </div>
              <span className="text-[9px] font-mono text-zinc-600 shrink-0">{c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            </div>
          ))}
          <div className="flex gap-2 sm:gap-3 mt-4">              <input 
              type="text" 
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Add your intel..." 
              className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded px-3 sm:px-4 py-2 text-xs outline-none focus:border-green-500/50 text-zinc-200"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!commentText.trim() || commentSendingRef.current) return;
                  commentMutation.mutate();
                }
              }}
            />
            <button 
              onClick={() => {
                if (!commentText.trim() || commentSendingRef.current) return;
                commentMutation.mutate();
              }}
              disabled={!commentText.trim() || commentSendingRef.current}
              className="px-3 sm:px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50 shrink-0"
            >
              {commentSendingRef.current ? '...' : 'Reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
