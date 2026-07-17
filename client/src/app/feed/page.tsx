"use client";

import { useState, useRef } from 'react';
import { Zap, Trash2, MessageSquare, ShieldAlert, TrendingUp, Pin, Repeat2, Search, BarChart3, Plus, X, Target, AlertTriangle, Edit2 } from 'lucide-react';
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
import PollCard from '@/components/PollCard';
import type { PollData } from '@/components/PollCard';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';

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
  is_edited: boolean;
  created_at: string;
};

type Comment = {
  id: string;
  post_id: string;
  content: string;
  author_username: string | null;
  author_name: string;
  is_edited: boolean;
  created_at: string;
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showPollBuilder, setShowPollBuilder] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
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

  const createPollMutation = useMutation({
    mutationFn: async ({ postId, question, options }: { postId: string; question: string; options: string[] }) => {
      const res = await apiFetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, question, options }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

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
          is_edited: false,
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
    onSuccess: (post) => {
      // If poll builder is active, create the poll on the new post
      if (showPollBuilder && pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2) {
        const validOptions = pollOptions.filter(o => o.trim());
        createPollMutation.mutate({
          postId: post.id,
          question: pollQuestion.trim(),
          options: validOptions,
        });
        // Reset poll
        setShowPollBuilder(false);
        setPollQuestion('');
        setPollOptions(['', '']);
      }
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
      <header className="h-16 border-b border-green-500/30 flex items-center gap-4 px-8 bg-black/60 backdrop-blur-md">
        <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text shrink-0">Global Feed // Live</h2>
        {user && (
          <>
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-blue-500/70" title="Reputation">
              <Target size={10} />
              {user.reputation}
            </span>
            <span className={`hidden sm:flex items-center gap-1 text-[10px] ${
              (user.heat_level || 0) > 70 ? 'text-red-500' : (user.heat_level || 0) > 40 ? 'text-yellow-500' : 'text-zinc-500'
            }`} title="Heat Level">
              <AlertTriangle size={10} />
              {user.heat_level || 0}%
            </span>
          </>
        )}
        {/* Mobile: compact search icon → opens search page */}
        <Link
          href="/search"
          className="sm:hidden ml-auto flex items-center justify-center w-9 h-9 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-green-400 hover:border-green-500/30 hover:bg-green-500/5 transition-all"
        >
          <Search size={16} />
        </Link>

        {/* Desktop: full search bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) {
              router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
            }
          }}
          className="hidden sm:block relative ml-auto"
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
            <MentionAutocomplete
              value={content}
              onChange={setContent}
              placeholder="Broadcast encrypted intel..."
              className="w-full bg-transparent resize-none outline-none text-sm placeholder:text-zinc-600 text-zinc-100"
              rows={3}
            />              {showPollBuilder && (
                <div className="mb-4 border border-purple-500/20 rounded-lg bg-purple-950/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-1"><BarChart3 size={12} /> Poll</span>
                    <button onClick={() => { setShowPollBuilder(false); setPollQuestion(''); setPollOptions(['', '']); }} className="text-zinc-600 hover:text-zinc-400"><X size={14} /></button>
                  </div>
                  <input
                    value={pollQuestion}
                    onChange={e => setPollQuestion(e.target.value)}
                    placeholder="Ask a question..."
                    className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs outline-none focus:border-purple-500/50 text-zinc-200 placeholder-zinc-600"
                  />
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        value={opt}
                        onChange={e => {
                          const updated = [...pollOptions];
                          updated[idx] = e.target.value;
                          setPollOptions(updated);
                        }}
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1 bg-black border border-zinc-800 rounded px-3 py-1.5 text-xs outline-none focus:border-purple-500/50 text-zinc-200 placeholder-zinc-600"
                      />
                      {pollOptions.length > 2 && (
                        <button onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))} className="text-zinc-600 hover:text-red-400">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 6 && (
                    <button
                      onClick={() => setPollOptions([...pollOptions, ''])}
                      className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      <Plus size={12} /> Add option
                    </button>
                  )}
                </div>
              )}
              <div className="flex justify-between items-center mt-4 border-t border-zinc-800 pt-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <BroadcastCooldown />
                  <button
                    onClick={() => setShowPollBuilder(!showPollBuilder)}
                    className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${showPollBuilder ? 'text-purple-400' : 'text-zinc-500 hover:text-purple-400'}`}
                    title="Add Poll"
                  >
                    <BarChart3 size={12} />
                    <span className="hidden sm:inline">Poll</span>
                  </button>
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

function PollDisplay({ postId }: { postId: string }) {
  const { data: poll } = useQuery<PollData | null>({
    queryKey: ['poll', postId],
    queryFn: async () => {
      const res = await apiFetch(`/api/posts/${postId}/poll`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30_000,
  });

  if (!poll) return null;
  return <PollCard poll={poll} postId={postId} />;
}

function PostCard({ post, isMine, isAnonymousUser }: { post: Post, isMine: boolean, isAnonymousUser?: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(post.content);
  const isPinned = user?.pinned_post_id === post.id;
  const router = useRouter();

  const displayAuthor = post.is_anonymous ? 'Anonymous' : `@${post.author_name}`;
  const displayFaction = post.is_anonymous ? 'Classified' : (post.faction_name || 'Unaffiliated');

  const editMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiFetch(`/api/posts/${post.id}`, {
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
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      const previousPosts = queryClient.getQueryData<Post[]>(['posts']);
      queryClient.setQueryData<Post[]>(['posts'], (old) =>
        old?.map(p => p.id === post.id ? { ...p, content } : p)
      );
      setIsEditing(false);
      return { previousPosts };
    },
    onSuccess: () => {
      toast.success("Broadcast updated (-15 INF)");
    },
    onError: (err: Error, _content, context) => {
      if (context?.previousPosts) queryClient.setQueryData(['posts'], context.previousPosts);
      toast.error(err.message || 'Edit failed');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });

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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      const previousPosts = queryClient.getQueryData<Post[]>(['posts']);
      queryClient.setQueryData<Post[]>(['posts'], (old) =>
        old?.map(p => p.id === post.id ? { ...p, has_boosted: true, boost_count: p.boost_count + 1 } : p)
      );
      return { previousPosts };
    },
    onSuccess: () => {
      toast.success("Broadcast boosted (+1 INF)");
    },
    onError: (_err, _vars, context) => {
      if (context?.previousPosts) queryClient.setQueryData(['posts'], context.previousPosts);
    },
    onSettled: () => {
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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      const previousPosts = queryClient.getQueryData<Post[]>(['posts']);
      queryClient.setQueryData<Post[]>(['posts'], (old) =>
        old?.map(p => p.id === post.id ? {
          ...p,
          has_reposted: !p.has_reposted,
          repost_count: p.repost_count + (p.has_reposted ? -1 : 1)
        } : p)
      );
      return { previousPosts };
    },
    onSuccess: (data) => {
      toast.success(data.status === 'reposted' ? 'Broadcast retransmitted' : 'Repost removed');
    },
    onError: (_err, _vars, context) => {
      if (context?.previousPosts) queryClient.setQueryData(['posts'], context.previousPosts);
    },
    onSettled: () => {
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
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(errText || 'Failed to comment');
      }
      return res.json();
    },
    onMutate: async () => {
      commentSendingRef.current = true;
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['comments', post.id] });

      // Snapshot previous comments
      const previousComments = queryClient.getQueryData<Comment[]>(['comments', post.id]);

      // Optimistically add the comment
      const optimisticComment: Comment = {
        id: `opt-${Date.now()}`,
        post_id: post.id,
        content: commentText.trim(),
        author_username: user?.username || null,
        author_name: user?.display_name || user?.username || 'You',
        is_edited: false,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Comment[]>(['comments', post.id], (old) => {
        return old ? [...old, optimisticComment] : [optimisticComment];
      });

      return { previousComments };
    },
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['comments', post.id] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success("Comment added (+2 INF)");
    },
    onError: async (err, _, context) => {
      // Roll back optimistic update
      if (context?.previousComments) {
        queryClient.setQueryData(['comments', post.id], context.previousComments);
      }
      const msg = err instanceof Error ? err.message : 'Reply failed';
      if (msg.includes('banned') || msg.includes('TOO_MANY_REQUESTS')) {
        toast.error('Slow down! You are replying too fast.', { description: 'Please wait before sending another reply.' });
        // Keep textarea content so user can retry after rate limit
      } else {
        setCommentText('');
        toast.error(msg || 'Reply failed. Try again.');
      }
    },
    onSettled: () => {
      commentSendingRef.current = false;
      queryClient.invalidateQueries({ queryKey: ['comments', post.id] });
    },
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
{post.is_edited && <span className="text-[10px] text-zinc-600 italic ml-1">(edited)</span>}
          </span>
          {isMine && !isEditing && (
            <div className="flex items-center gap-1">
              <button onClick={(e) => { e.stopPropagation(); setEditText(post.content); setIsEditing(true); }} className="text-zinc-600 hover:text-blue-400 transition-colors" title="Edit">
                <Edit2 size={14} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(); }} className="text-zinc-600 hover:text-red-500 transition-colors" title="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
      {isEditing ? (
        <div className="mb-6" onClick={e => e.stopPropagation()}>
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            className="w-full bg-zinc-900 border border-green-500/50 rounded-lg p-3 text-sm text-zinc-200 outline-none resize-none mb-3"
            rows={3}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setIsEditing(false); setEditText(post.content); }}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!editText.trim()) return;
                editMutation.mutate(editText.trim());
              }}
              disabled={editMutation.isPending || !editText.trim() || editText.trim() === post.content}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded text-xs font-bold transition-all"
            >
              {editMutation.isPending ? 'Saving...' : 'Save (-15 INF)'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-300 leading-relaxed mb-6 font-mono hover:text-green-300 transition-colors"><MentionText text={post.content} /></p>
      )}

      {/* Poll Display */}
      <PollDisplay postId={post.id} />

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
              <span className="text-[9px] font-mono text-zinc-600 shrink-0">{c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}{c.is_edited && <span className="ml-1 italic">(edited)</span>}</span>
            </div>
          ))}
          <div className="flex gap-2 sm:gap-3 mt-4">              <MentionAutocomplete
                value={commentText}
                onChange={setCommentText}
                placeholder={user ? "Add your intel..." : "Create an identity to reply"}
                className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded px-3 sm:px-4 py-2 text-xs outline-none focus:border-green-500/50 text-zinc-200"
                rows={1}
                disabled={!user}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!user) { toast.error('Create an identity first.'); return; }
                    if (!commentText.trim() || commentSendingRef.current) return;
                    commentMutation.mutate();
                  }
                }}
              />
            <button 
              onClick={() => {
                if (!user) { toast.error('Create an identity first.'); return; }
                if (!commentText.trim() || commentSendingRef.current) return;
                commentMutation.mutate();
              }}
              disabled={!user || !commentText.trim() || commentSendingRef.current}
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
