"use client";

import { useState } from 'react';
import { Zap, Trash2, MessageSquare, ShieldAlert } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

type Post = {
  id: string;
  content: string;
  influence_earned: number;
  author_name: string;
  faction_name: string | null;
  is_anonymous: boolean | null;
  user_id: string;
  reply_count: number;
  has_boosted: boolean;
};

type Comment = {
  id: string;
  post_id: string;
  content: string;
  author_name: string;
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const { data: posts, isLoading } = useQuery<Post[]>({
    queryKey: ['posts'],
    queryFn: async () => {
      const res = await apiFetch('/api/posts');
      if (!res.ok) throw new Error('Network response was not ok');
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
      const previousPosts = queryClient.getQueryData<Post[]>(['posts']);
      
      queryClient.setQueryData<Post[]>(['posts'], (old) => {
        const optimisticPost: Post = {
          id: `temp-${Date.now()}`,
          content: newPost.content,
          influence_earned: 0,
          author_name: newPost.is_anonymous ? 'Anonymous' : (user?.username || 'phantom'),
          faction_name: newPost.is_anonymous ? null : (user?.faction_name || null),
          is_anonymous: newPost.is_anonymous,
          user_id: user?.id || 'temp',
          reply_count: 0,
          has_boosted: false,
        };
        return old ? [optimisticPost, ...old] : [optimisticPost];
      });
      
      setContent('');
      return { previousPosts };
    },
    onError: (err, newPost, context) => {
      if (context?.previousPosts) {
        queryClient.setQueryData(['posts'], context.previousPosts);
      }
      setContent(newPost.content);
      toast.error('Transmission failed. Signal lost.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
    onSuccess: () => {
      toast.success('Broadcast transmitted');
    },
  });

  const handleBroadcast = () => {
    if (!content.trim()) return;
    mutation.mutate({ content, is_anonymous: isAnonymous });
  };

  return (
    <DashboardLayout>
      <header className="h-14 border-b border-green-500/20 flex items-center px-6 bg-black/40 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest">Global Feed // Live</h2>
        <div className="ml-auto flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
          <span className="text-xs text-green-500/70">Connected</span>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
        {/* Post Input */}
        <div className="p-4 border border-zinc-800 bg-black/40 rounded focus-within:border-green-500/50 transition-colors">
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full bg-transparent resize-none outline-none text-sm placeholder:text-zinc-600" 
            placeholder="Drop intel or propaganda..."
            rows={2}
          ></textarea>
          <div className="flex justify-between items-center mt-2 border-t border-zinc-800/50 pt-3">
            <div className="flex items-center gap-4">
              <span className="text-xs text-zinc-600">+10 Influence per drop</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                <input 
                  type="checkbox" 
                  checked={isAnonymous} 
                  onChange={(e) => setIsAnonymous(e.target.checked)} 
                  className="accent-green-500"
                />
                <ShieldAlert size={14} /> Incognito Mode
              </label>
            </div>
            <button 
              onClick={handleBroadcast}
              disabled={mutation.isPending || !content.trim()}
              className="px-4 py-1.5 bg-green-500/10 text-green-500 border border-green-500/30 rounded text-xs font-bold uppercase hover:bg-green-500/20 transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? 'Transmitting...' : 'Broadcast'}
            </button>
          </div>
        </div>

        {/* Real Posts */}
        {isLoading ? (
          <div className="text-center text-zinc-500 text-sm py-10 animate-pulse">Scanning frequencies...</div>
        ) : posts?.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm py-10">No intel on the network yet. Drop some.</div>
        ) : (
          posts?.map(post => (
            <PostCard 
              key={post.id}
              post={post}
              isMine={user?.id === post.user_id}
            />
          ))
        )}
      </div>
    </DashboardLayout>
  );
}

function PostCard({ post, isMine }: { post: Post, isMine: boolean }) {
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');

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
    }
  });

  const { data: comments } = useQuery<Comment[]>({
    queryKey: ['comments', post.id],
    queryFn: async () => {
      const res = await apiFetch(`/api/posts/${post.id}/comments`);
      return res.json();
    },
    enabled: showComments,
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
    onSuccess: () => {
      setCommentText('');
      toast.success("Comment added (+2 INF)");
      queryClient.invalidateQueries({ queryKey: ['comments', post.id] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    }
  });

  return (
    <div className="border border-zinc-800 bg-black/40 p-4 rounded hover:border-zinc-700 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span className={`font-bold text-sm ${post.is_anonymous ? 'text-zinc-500' : 'text-zinc-200'}`}>{displayAuthor}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">{displayFaction}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-600">Just now</span>
          {isMine && (
            <button onClick={() => deleteMutation.mutate()} className="text-zinc-600 hover:text-red-500 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed mb-3">{post.content}</p>
      <div className="flex justify-between items-center pt-3 border-t border-zinc-900/50">
        <div className="flex gap-4">
          <button 
            onClick={() => boostMutation.mutate()} 
            disabled={boostMutation.isPending || post.has_boosted}
            className={`flex items-center gap-1.5 text-xs transition-colors ${post.has_boosted ? 'text-green-500 font-bold cursor-default' : 'text-zinc-500 hover:text-green-400'}`}
          >
            <Zap size={14} className={post.has_boosted ? "fill-green-500" : ""} />
            <span>{post.has_boosted ? 'Boosted' : 'Boost'}</span>
          </button>
          <button 
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-400 transition-colors"
          >
            <MessageSquare size={14} />
            <span>{post.reply_count} Replies</span>
          </button>
        </div>
        <span className="text-xs font-bold text-green-500">+{post.influence_earned} INF</span>
      </div>

      {showComments && (
        <div className="mt-4 pt-4 border-t border-zinc-800/50 space-y-3 pl-4 border-l-2 border-zinc-800">
          {comments?.map(c => (
            <div key={c.id} className="text-xs">
              <span className="font-bold text-zinc-400 mr-2">@{c.author_name}</span>
              <span className="text-zinc-300">{c.content}</span>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input 
              type="text" 
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Add your intel..." 
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs outline-none focus:border-green-500/50 text-zinc-200"
            />
            <button 
              onClick={() => commentMutation.mutate()}
              disabled={!commentText.trim() || commentMutation.isPending}
              className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-bold transition-colors disabled:opacity-50"
            >
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
