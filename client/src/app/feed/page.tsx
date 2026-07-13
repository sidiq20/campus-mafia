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
  user_id: string | null;
  reply_count: number;
  has_boosted: boolean;
  created_at: string;
};

type Comment = {
  id: string;
  post_id: string;
  content: string;
  author_name: string;
  created_at: string;
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
          faction_name: newPost.is_anonymous ? null : (user?.faction_name || null),
          is_anonymous: newPost.is_anonymous,
          user_id: user?.id || null,
          reply_count: 0,
          has_boosted: false,
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
      toast.error('Transmission failed. Signal lost.');
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
      <header className="h-16 border-b border-green-500/30 flex items-center px-8 bg-black/60 backdrop-blur-md">
        <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text">Global Feed // Live</h2>
        <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
          <span className="text-[10px] font-bold text-green-500 uppercase">System Active</span>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-8 space-y-8 pb-24">
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
            <div className="flex items-center gap-6">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">+10 INF Reward</span>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400 hover:text-green-400 transition-colors">
                <input 
                  type="checkbox" 
                  checked={isAnonymous} 
                  onChange={(e) => setIsAnonymous(e.target.checked)} 
                  className="accent-green-500"
                />
                <ShieldAlert size={14} /> Incognito
              </label>
            </div>
            <button 
              onClick={handleBroadcast}
              disabled={mutation.isPending || !content.trim()}
              className="px-6 py-2 bg-green-500/10 text-green-400 border border-green-500/40 rounded text-xs font-bold uppercase tracking-widest hover:bg-green-500/20 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all duration-300 disabled:opacity-50"
            >
              {mutation.isPending ? 'Transmitting...' : 'Broadcast'}
            </button>
          </div>
        </div>

        {/* Real Posts */}
        {isLoading ? (
          <div className="text-center text-green-500 text-sm py-12 animate-pulse font-mono">// Scanning frequencies...</div>
        ) : posts?.length === 0 ? (
          <div className="text-center text-zinc-600 text-sm py-12">Network silent. No intel detected.</div>
        ) : (
          <div className="space-y-6">
            {posts?.map((post, i) => (
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
    </DashboardLayout>
  );
}

function PostCard({ post, isMine, isAnonymousUser }: { post: Post, isMine: boolean, isAnonymousUser?: boolean }) {
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
      queryClient.invalidateQueries({ queryKey: ['me'] });
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
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });

  return (
    <div className="border border-zinc-800 bg-black/60 p-6 rounded-lg hover:border-green-500/30 transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.3)]">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
            <Zap size={14} />
          </div>
          <div>
            <span className={`block font-bold text-sm ${post.is_anonymous ? 'text-zinc-500' : 'text-zinc-200'}`}>{displayAuthor}</span>
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{displayFaction}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono text-zinc-600">
            {post.created_at ? new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
          </span>
          {isMine && (
            <button onClick={() => deleteMutation.mutate()} className="text-zinc-600 hover:text-red-500 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed mb-6 font-mono">{post.content}</p>
      <div className="flex justify-between items-center pt-4 border-t border-zinc-800/50">
        <div className="flex gap-6">
          <button 
            onClick={() => {
              if (isAnonymousUser) {
                toast.error("Anonymous Operatives cannot boost transmissions. Create an identity first.");
                return;
              }
              boostMutation.mutate();
            }} 
            disabled={boostMutation.isPending || post.has_boosted}
            className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors ${post.has_boosted ? 'text-green-500 cursor-default' : 'text-zinc-500 hover:text-green-400'}`}
          >
            <Zap size={14} className={post.has_boosted ? "fill-green-500" : ""} />
            <span>{post.has_boosted ? 'Boosted' : 'Boost'}</span>
          </button>
          <button 
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-blue-400 transition-colors"
          >
            <MessageSquare size={14} />
            <span>{post.reply_count} Replies</span>
          </button>
        </div>
        <span className="text-[10px] font-bold text-green-500 glow-text uppercase tracking-widest">+{post.influence_earned} INF</span>
      </div>

      {showComments && (
        <div className="mt-6 pt-6 border-t border-zinc-800 space-y-4 pl-6 border-l border-zinc-800">
          {comments?.map(c => (
            <div key={c.id} className="text-xs flex justify-between">
              <div>
                <span className="font-bold text-zinc-400 mr-3">@{c.author_name}</span>
                <span className="text-zinc-300">{c.content}</span>
              </div>
              <span className="text-[9px] font-mono text-zinc-600">{c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            </div>
          ))}
          <div className="flex gap-3 mt-4">
            <input 
              type="text" 
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Add your intel..." 
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-4 py-2 text-xs outline-none focus:border-green-500/50 text-zinc-200"
            />
            <button 
              onClick={() => commentMutation.mutate()}
              disabled={!commentText.trim() || commentMutation.isPending}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
            >
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
