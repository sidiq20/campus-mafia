"use client";

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { MentionText } from '@/components/MentionText';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Zap, MessageSquare, Repeat2, Pin, Trash2, Reply } from 'lucide-react';

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

type Comment = {
  id: string;
  post_id: string;
  content: string;
  author_display_name: string;
  parent_id: string | null;
  created_at: string;
};

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
    staleTime: 10_000,
  });

  const { data: comments, refetch: refetchComments } = useQuery<Comment[]>({
    queryKey: ['comments', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/posts/${id}/comments`);
      return res.json();
    },
    staleTime: 5_000,
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
        <div className="flex-1 flex items-center justify-center text-green-500 text-sm animate-pulse font-mono">
          Loading transmission...
        </div>
      </DashboardLayout>
    );
  }

  if (!post) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm font-mono">
          Transmission not found.
        </div>
      </DashboardLayout>
    );
  }

  const isMine = user?.id === post.user_id;
  const isPinned = user?.pinned_post_id === post.id;

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

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center gap-4 px-8 bg-black/60 backdrop-blur-md">
        <Link href="/feed" className="text-zinc-500 hover:text-green-400 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text">Transmission Detail</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Post Card */}
          <div className="border border-zinc-800 bg-black/60 p-6 rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-sm bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                  <Zap size={14} />
                </div>
                <div>
                  {post.is_anonymous ? (
                    <span className="block font-bold text-sm text-zinc-500">Anonymous</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Link href={`/profile/${post.author_name}`} className="block font-bold text-sm text-zinc-200 hover:text-green-400">@{post.author_name}</Link>
                      <Link href={`/chat/${post.author_username || post.author_name}`} className="text-[9px] font-bold text-green-600 hover:text-green-400 border border-green-900 px-1 rounded uppercase">DM</Link>
                    </div>
                  )}
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{post.is_anonymous ? 'Classified' : (post.faction_name || 'Unaffiliated')}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-mono text-zinc-600">
                  {post.created_at ? new Date(post.created_at).toLocaleString() : 'Just now'}
                </span>
                {isMine && (
                  <button onClick={() => deleteMutation.mutate()} className="text-zinc-600 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed mb-6 font-mono"><MentionText text={post.content} /></p>
            <div className="flex gap-4 sm:gap-6 pt-4 border-t border-zinc-800/50">
              <button
                onClick={() => {
                  if (!user) { toast.error("Create an identity first."); return; }
                  boostMutation.mutate();
                }}
                disabled={boostMutation.isPending || post.has_boosted}
                className={`flex items-center gap-1 sm:gap-2 text-xs font-bold uppercase tracking-widest transition-colors ${post.has_boosted ? 'text-green-500 cursor-default' : 'text-zinc-500 hover:text-green-400'}`}
                title={post.has_boosted ? 'Boosted' : 'Boost'}
              >
                <Zap size={14} className={post.has_boosted ? "fill-green-500" : ""} />
                <span className="hidden sm:inline">{post.has_boosted ? 'Boosted' : 'Boost'}</span>
              </button>
              <button
                onClick={() => !user && toast.error("Create an identity first.")}
                className="flex items-center gap-1 sm:gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-blue-400 transition-colors"
                title={`${post.reply_count} Replies`}
              >
                <MessageSquare size={14} />
                <span className="hidden sm:inline">{post.reply_count} Replies</span>
              </button>
              <button
                onClick={() => !user ? toast.error("Create an identity first.") : repostMutation.mutate()}
                disabled={repostMutation.isPending}
                className={`flex items-center gap-1 sm:gap-2 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50 ${post.has_reposted ? 'text-green-500 cursor-default' : 'text-zinc-500 hover:text-green-400'}`}
                title={post.has_reposted ? 'Reposted' : 'Repost'}
              >
                <Repeat2 size={14} className={post.has_reposted ? 'text-green-500' : ''} />
                <span className="hidden sm:inline">{post.has_reposted ? 'Reposted' : 'Repost'}</span>
              </button>
              {isMine && (
                <span className={`flex items-center gap-1 sm:gap-2 text-xs font-bold uppercase tracking-widest ${isPinned ? 'text-yellow-500' : 'text-zinc-600'}`}>
                  <Pin size={14} className={isPinned ? 'fill-yellow-500' : ''} />
                  <span className="hidden sm:inline">{isPinned ? 'Pinned' : 'Pin'}</span>
                </span>
              )}
            </div>
          </div>

          {/* Comments Section */}
          <div className="border border-zinc-800 bg-black/40 p-6 rounded-lg">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <MessageSquare size={14} /> Replies ({comments?.length || 0})
            </h3>
            <div className="space-y-4">
              {topLevelComments.map(comment => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  replies={repliesByParent.get(comment.id) || []}
                  postId={id}
                  refetchComments={refetchComments}
                  depth={0}
                />
              ))}
              {(!comments || comments.length === 0) && (
                <p className="text-xs text-zinc-600 italic text-center py-4">No replies yet. Be the first to respond.</p>
              )}
            </div>

            {/* Reply Input */}
            <div className="mt-6 pt-6 border-t border-zinc-800">
              <ReplyForm postId={id} parentId={null} onSuccess={() => refetchComments()} placeholder="Add your intel..." />
            </div>
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
    }
  });

  return (
    <div className={`${depth > 0 ? 'ml-6 pl-4 border-l border-zinc-800/50' : ''}`}>
      <div className="text-xs mb-3 group">
        <div className="flex items-center justify-between mb-1">
          <Link href={`/profile/${comment.author_display_name}`} className="font-bold text-zinc-400 hover:text-green-400 transition-colors">
            @{comment.author_display_name}
            {comment.author_display_name === user?.display_name && (
              <span className="text-[9px] text-green-600 ml-1">(you)</span>
            )}
          </Link>
          <span className="text-[9px] font-mono text-zinc-600">
            {comment.created_at ? new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </div>
        <p className="text-zinc-300 leading-relaxed"><MentionText text={comment.content} /></p>
        <button
          onClick={() => setShowReplyForm(!showReplyForm)}
          className="text-[9px] text-zinc-600 hover:text-green-400 mt-1 flex items-center gap-1 transition-colors"
        >
          <Reply size={10} /> Reply
        </button>
      </div>

      {showReplyForm && (
        <div className="ml-6 mb-3">
          <ReplyForm
            postId={postId}
            parentId={comment.id}
            onSuccess={() => { setShowReplyForm(false); refetchComments(); }}
            placeholder={`Reply to @${comment.author_display_name}...`}
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
  );
}

function ReplyForm({ postId, parentId, onSuccess, placeholder }: {
  postId: string;
  parentId: string | null;
  onSuccess: () => void;
  placeholder: string;
}) {
  const [text, setText] = useState('');

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
    onSuccess: () => {
      setText('');
      onSuccess();
      toast.success('Reply added (+2 INF)');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed')
  });

  return (
    <div className="flex gap-3">
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-4 py-2 text-xs outline-none focus:border-green-500/50 text-zinc-200"
        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && text.trim() && mutation.mutate()}
      />
      <button
        onClick={() => mutation.mutate()}
        disabled={!text.trim() || mutation.isPending}
        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
      >
        {mutation.isPending ? '...' : 'Reply'}
      </button>
    </div>
  );
}
