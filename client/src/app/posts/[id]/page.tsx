"use client";

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { MentionText } from '@/components/MentionText';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Zap, MessageSquare, Repeat2, Trash2, Reply, User, Share2 } from 'lucide-react';
import PollCard from '@/components/PollCard';
import type { PollData } from '@/components/PollCard';

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
  author_display_name: string;
  author_username: string | null;
  parent_id: string | null;
  created_at: string;
};

function formatTimeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

export default function PostDetailPage() {
  const { id } = useParams() as { id: string };
  const { user } = useUser();
  const queryClient = useQueryClient();

  const { data: post, isLoading } = useQuery<Post>({
    queryKey: ['post', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/posts/${id}`);
      if (!res.ok) throw new Error('Post not found');
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: poll } = useQuery<PollData | null>({
    queryKey: ['poll', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/posts/${id}/poll`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: comments, refetch: refetchComments } = useQuery<Comment[]>({
    queryKey: ['comments', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/posts/${id}/comments`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const boostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/posts/${id}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction_type: 'boost' })
      });
      if (!res.ok) throw new Error('Failed to boost');
    },
    onSuccess: () => {
      toast.success("Broadcast boosted (+1 INF)");
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    }
  });

  const repostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/posts/${id}/repost`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to repost');
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.status === 'reposted' ? 'Broadcast retransmitted' : 'Repost removed');
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to repost');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/posts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      toast.success("Broadcast purged");
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    }
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center bg-[#050505]">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-zinc-600 font-mono">Loading transmission...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!post) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center bg-[#050505]">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3">
              <MessageSquare size={20} className="text-zinc-600" />
            </div>
            <p className="text-sm text-zinc-500 font-mono">Transmission not found.</p>
            <Link href="/feed" className="text-xs text-green-600 hover:text-green-400 mt-2 inline-block transition-colors">
              Back to feed
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isMine = user?.id === post.user_id;

  // Build nested comment tree
  const topLevelComments = comments?.filter(c => !c.parent_id) || [];
  const repliesByParent = new Map<string, Comment[]>();
  comments?.forEach(c => {
    if (c.parent_id) {
      const existing = repliesByParent.get(c.parent_id) || [];
      existing.push(c);
      repliesByParent.set(c.parent_id, existing);
    }
  });

  const commentCount = comments?.length || 0;
  const boostCount = post.boost_count || 0;
  const repostCount = post.repost_count || 0;

  return (
    <DashboardLayout>
      <header className="h-14 border-b border-zinc-800 flex items-center gap-4 px-4 sm:px-6 bg-black/80 backdrop-blur-md sticky top-0 z-10">
        <Link href="/feed" className="text-zinc-500 hover:text-white transition-colors p-1 -ml-1">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-sm font-bold text-zinc-200">Post</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-[#050505]">
        <div className="max-w-xl mx-auto">
          {/* Post */}
          <div className="px-4 sm:px-6 pt-4 pb-2 border-b border-zinc-800/50">
            {/* Author */}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                {post.is_anonymous ? (
                  <Zap size={16} className="text-zinc-600" />
                ) : (
                  <User size={16} className="text-zinc-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                {post.is_anonymous ? (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-zinc-500">Anonymous</span>
                    <span className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-[9px] text-zinc-600 uppercase font-bold">Incognito</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/profile/${post.author_username || post.author_name}`} className="font-bold text-sm text-white hover:underline">
                      {post.author_name}
                    </Link>
                    {post.author_username && (
                      <Link href={`/profile/${post.author_username}`} className="text-xs text-zinc-500 hover:text-green-400 transition-colors">
                        @{post.author_username}
                      </Link>
                    )}
                    <Link href={`/chat/${post.author_username || post.author_name}`} className="text-[10px] font-bold text-green-600 hover:text-green-400 border border-green-900 px-1.5 py-0.5 rounded transition-colors">
                      DM
                    </Link>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {post.faction_name && !post.is_anonymous && (
                    <span className="text-[10px] text-zinc-600">{post.faction_name}</span>
                  )}
                  {post.faction_name && !post.is_anonymous && <span className="text-zinc-800">·</span>}
                  <span className="text-xs text-zinc-600">
                    {post.created_at ? new Date(post.created_at).toLocaleString() : 'Just now'}
                  </span>
                </div>
              </div>
              {isMine && (
                <button onClick={() => deleteMutation.mutate()} className="text-zinc-600 hover:text-red-400 transition-colors p-1 -mr-1" title="Delete">
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            {/* Content */}
            <div className="mb-4">
              <p className="text-[15px] text-zinc-200 leading-relaxed whitespace-pre-wrap font-[350]">
                <MentionText text={post.content} />
              </p>
            </div>

            {/* Poll */}
            {poll && <PollCard poll={poll} postId={id} />}

            {/* Timestamp detail */}
            <div className="pb-2 border-b border-zinc-800/30 mb-1">
              <span className="text-xs text-zinc-600">
                {post.created_at ? new Date(post.created_at).toLocaleString('en-US', {
                  hour: 'numeric', minute: '2-digit', hour12: true,
                  month: 'short', day: 'numeric', year: 'numeric'
                }) : 'Just now'}
              </span>
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between py-2 max-w-md">
              <button
                onClick={() => {}}
                className="group flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-400 transition-colors"
                title={`${commentCount} Replies`}
              >
                <MessageSquare size={16} className="group-hover:text-blue-400 transition-colors" />
                <span className="font-medium tabular-nums">{commentCount || ''}</span>
              </button>

              <button
                onClick={() => {
                  if (!user) { toast.error("Create an identity first."); return; }
                  boostMutation.mutate();
                }}
                disabled={boostMutation.isPending || post.has_boosted}
                className={`group flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50 ${post.has_boosted ? 'text-green-500 cursor-default' : 'text-zinc-500 hover:text-green-400'}`}
                title={post.has_boosted ? 'Boosted' : 'Boost'}
              >
                <Zap size={16} className={`transition-colors ${post.has_boosted ? 'fill-green-500 text-green-500' : 'group-hover:text-green-400'}`} />
                <span className={`font-medium tabular-nums ${post.has_boosted ? 'text-green-500' : ''}`}>{boostCount || ''}</span>
              </button>

              <button
                onClick={() => !user ? toast.error("Create an identity first.") : repostMutation.mutate()}
                disabled={repostMutation.isPending}
                className={`group flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50 ${post.has_reposted ? 'text-green-500 cursor-default' : 'text-zinc-500 hover:text-green-400'}`}
                title={post.has_reposted ? 'Reposted' : 'Repost'}
              >
                <Repeat2 size={16} className={`transition-colors ${post.has_reposted ? 'text-green-500' : 'group-hover:text-green-400'}`} />
                <span className={`font-medium tabular-nums ${post.has_reposted ? 'text-green-500' : ''}`}>{repostCount || ''}</span>
              </button>

              {/* Share */}
              <button
                onClick={() => {
                  const url = window.location.href;
                  if (navigator.share) {
                    navigator.share({ title: 'DepartmentOS Broadcast', text: post.content.slice(0, 100), url }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(url).then(() => toast.success('Link copied')).catch(() => {});
                  }
                }}
                className="group flex items-center gap-1.5 text-xs text-zinc-500 hover:text-green-400 transition-colors"
                title="Share"
              >
                <Share2 size={16} className="group-hover:text-green-400 transition-colors" />
              </button>
            </div>
          </div>



          {/* Comments Section */}
          <div className="divide-y divide-zinc-800/30">
            {topLevelComments.length > 0 ? (
              topLevelComments.map(comment => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  replies={repliesByParent.get(comment.id) || []}
                  postId={id}
                  refetchComments={refetchComments}
                  depth={0}
                />
              ))
            ) : (
              <div className="px-4 sm:px-6 py-12 text-center">
                <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3">
                  <MessageSquare size={18} className="text-zinc-600" />
                </div>
                <p className="text-sm text-zinc-500 font-medium">No replies yet</p>
                <p className="text-xs text-zinc-600 mt-1">Be the first to respond to this broadcast.</p>
              </div>
            )}
          </div>

          {/* Sticky bottom reply */}
          <div className="sticky bottom-0 border-t border-zinc-800 bg-black/90 backdrop-blur-md px-4 sm:px-6 py-3">
            <ReplyForm postId={id} parentId={null} onSuccess={() => refetchComments()} placeholder="Post your reply..." />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function CommentThread({ comment, replies, postId, refetchComments, depth }: {
  comment: Comment;
  replies: Comment[];
  postId: string;
  refetchComments: () => void;
  depth: number;
}) {
  const { user } = useUser();
  const [showReplyForm, setShowReplyForm] = useState(false);
  const queryClient = useQueryClient();

  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiFetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, parent_id: comment.id })
      });
      if (!res.ok) throw new Error('Failed to reply');
      return res.json();
    },
    onSuccess: () => {
      setShowReplyForm(false);
      refetchComments();
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      toast.success("Reply sent (+2 INF)");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to reply. Try again.');
    }
  });

  return (
    <div className={`px-4 sm:px-6 py-4 ${depth > 0 ? 'ml-8 sm:ml-12 border-l-2 border-zinc-800/40' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
          <User size={14} className="text-zinc-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Link
              href={`/profile/${comment.author_username || comment.author_display_name}`}
              className="font-bold text-sm text-zinc-200 hover:underline"
            >
              {comment.author_display_name}
            </Link>
            {comment.author_username && (
              <Link href={`/profile/${comment.author_username}`} className="text-xs text-zinc-500 hover:text-green-400 transition-colors">
                @{comment.author_username}
              </Link>
            )}
            {comment.author_display_name === user?.display_name && (
              <span className="text-[10px] text-green-600">· you</span>
            )}
            <span className="text-xs text-zinc-600 ml-auto">
              {formatTimeAgo(comment.created_at)}
            </span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">
            <MentionText text={comment.content} />
          </p>
          <div className="flex items-center gap-4 mt-1.5">
            <button
              onClick={() => setShowReplyForm(!showReplyForm)}
              className="flex items-center gap-1 text-xs text-zinc-600 hover:text-green-400 transition-colors"
            >
              <Reply size={12} />
              <span>Reply</span>
            </button>
          </div>

          {showReplyForm && (
            <div className="mt-3 mb-2">
              <ReplyForm
                postId={postId}
                parentId={comment.id}
                onSuccess={() => { setShowReplyForm(false); refetchComments(); }}
                placeholder={`Reply to @${comment.author_username || comment.author_display_name}...`}
              />
            </div>
          )}

          {replies.map(reply => (
            <CommentThread
              key={reply.id}
              comment={reply}
              replies={[]}
              postId={postId}
              refetchComments={refetchComments}
              depth={depth + 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReplyForm({ postId, parentId, onSuccess, placeholder }: {
  postId: string;
  parentId: string | null;
  onSuccess: () => void;
  placeholder: string;
}) {
  const { user } = useUser();
  const [text, setText] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, parent_id: parentId })
      });
      if (!res.ok) throw new Error('Failed to reply');
      return res.json();
    },
    onMutate: async () => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['comments', postId] });

      // Snapshot previous comments
      const previousComments = queryClient.getQueryData<Comment[]>(['comments', postId]);

      // Optimistically add the new comment with a unique ID
      const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimisticComment: Comment = {
        id: optimisticId,
        post_id: postId,
        content: text.trim(),
        author_display_name: user?.display_name || user?.username || 'You',
        author_username: user?.username || null,
        parent_id: parentId,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Comment[]>(['comments', postId], (old) => {
        return old ? [...old, optimisticComment] : [optimisticComment];
      });

      return { previousComments, optimisticId };
    },
    onSuccess: (data, _vars, context) => {
      setText('');
      // Replace only the specific optimistic comment with the real server response
      const optimisticId = context?.optimisticId;
      queryClient.setQueryData<Comment[]>(['comments', postId], (old) => {
        if (!old) return [data];
        return old.map(c => c.id === optimisticId ? data : c);
      });
      onSuccess();
      toast.success('Reply added (+2 INF)');
    },
    onError: (err, _vars, context) => {
      // Roll back to previous state
      if (context?.previousComments) {
        queryClient.setQueryData(['comments', postId], context.previousComments);
      }
      toast.error(err instanceof Error ? err.message : 'Failed');
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    },
  });

  const sendingRef = useRef(false);

  const handleReply = () => {
    if (!user) { toast.error('Create an identity first.'); return; }
    if (!text.trim() || mutation.isPending || sendingRef.current) return;
    sendingRef.current = true;
    mutation.mutate(undefined, {
      onSettled: () => { sendingRef.current = false; },
    });
  };

  return (
    <div className="flex items-center gap-3">
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={user ? placeholder : 'Create an identity to reply'}
        disabled={!user}
        className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-200 placeholder-zinc-600 disabled:opacity-40"
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleReply();
          }
        }}
      />
      <button
        onClick={handleReply}
        disabled={!user || !text.trim() || mutation.isPending || sendingRef.current}
        className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-full text-xs font-bold transition-all disabled:cursor-not-allowed"
      >
        {mutation.isPending ? (
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </span>
        ) : 'Reply'}
      </button>
    </div>
  );
}
