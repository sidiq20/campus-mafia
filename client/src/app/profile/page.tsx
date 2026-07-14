"use client";

import { useState } from 'react';

// Shared Post type for profile cards
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
import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/contexts/UserContext';
import { User, Shield, Zap, Target, AlertTriangle, Edit2, Check, X, CalendarDays, Award, MessageSquare, Radio, TrendingUp, BookOpen, Pin } from 'lucide-react';
import { RankBadgeFull } from '@/components/RankBadge';
import { TitleSection } from '@/components/TitleBadge';
import { DailyInfTracker } from '@/components/DailyInfTracker';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types for profile data
type ProfileBroadcast = {
  id: string;
  content: string;
  channel_type: string;
  created_at: string;
};

type BoostedPost = {
  id: string;
  content: string;
  author_name: string;
  created_at: string;
};

export default function ProfilePage() {
  const { user, isLoading, refetch } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');

  const handleUpdate = async () => {
    try {
      const body: any = {};
      if (displayName) body.display_name = displayName;
      if (bioText !== undefined) body.bio = bioText;
      const res = await apiFetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Update failed');
      toast.success('Profile updated');
      setIsEditing(false);
      setIsEditingBio(false);
      refetch();
    } catch {
      toast.error('Update failed');
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center bg-[#050505] text-green-500 animate-pulse">
          Decrypting profile data...
        </div>
      </DashboardLayout>
    );
  }

  if (!user) return null;

  return (
    <DashboardLayout>
      <header className="h-14 border-b border-zinc-800 flex items-center px-6 bg-black">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Operative Profile</h2>
      </header>

      <div className="flex-1 p-6 pb-24 overflow-y-auto bg-[#050505]">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Header Card */}
          <div className="relative border border-zinc-800 bg-zinc-900/40 p-8 rounded-2xl overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-transparent"></div>
            
            <div className="relative flex flex-col md:flex-row items-center gap-8">
              <div className="w-28 h-28 rounded-2xl bg-black border border-zinc-700 flex items-center justify-center shadow-inner shrink-0">
                <User size={56} className="text-zinc-600" />
              </div>
              
              <div className="flex-1 text-center md:text-left">
                {isEditing ? (
                  <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                    <input 
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      className="bg-black border border-green-500/50 rounded px-3 py-1 text-3xl font-bold text-white outline-none"
                    />
                    <button onClick={handleUpdate} className="text-green-500 hover:text-green-400 p-1"><Check size={24}/></button>
                    <button onClick={() => setIsEditing(false)} className="text-red-500 hover:text-red-400 p-1"><X size={24}/></button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                    <h1 className="text-4xl font-extrabold text-white tracking-tighter">{user.display_name}</h1>
                    <button onClick={() => { setDisplayName(user.display_name); setIsEditing(true); }} className="text-zinc-500 hover:text-green-400">
                      <Edit2 size={18} />
                    </button>
                  </div>
                )}
                <p className="text-zinc-500 font-mono text-sm mb-2">@{user.username}</p>
                
                {/* Bio */}
                {isEditingBio ? (
                  <div className="mb-3 flex items-start gap-2">
                    <textarea 
                      value={bioText}
                      onChange={e => setBioText(e.target.value)}
                      className="flex-1 bg-black border border-green-500/50 rounded px-3 py-2 text-xs text-zinc-300 outline-none resize-none"
                      rows={2}
                      placeholder="Write something about yourself..."
                    />
                    <button onClick={handleUpdate} className="text-green-500 hover:text-green-400 p-1 mt-1"><Check size={18}/></button>
                    <button onClick={() => setIsEditingBio(false)} className="text-red-500 hover:text-red-400 p-1 mt-1"><X size={18}/></button>
                  </div>
                ) : user.bio ? (
                  <div className="mb-3 flex items-start gap-2">
                    <BookOpen size={14} className="text-zinc-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-zinc-400 leading-relaxed text-left">{user.bio}</p>
                    <button onClick={() => { setBioText(user.bio); setIsEditingBio(true); }} className="text-zinc-600 hover:text-green-400 shrink-0 mt-0.5">
                      <Edit2 size={12} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setBioText(''); setIsEditingBio(true); }} className="mb-3 text-[10px] text-zinc-600 hover:text-green-400 italic flex items-center gap-1">
                    <BookOpen size={12} /> Add bio
                  </button>
                )}
                
                <div className="flex flex-wrap justify-center md:justify-start gap-3">
                  <div className="flex items-center gap-2 px-3 py-1 bg-black border border-zinc-800 rounded-full text-xs text-zinc-400">
                    <Shield size={14} className={user.faction_name ? "text-purple-500" : "text-zinc-600"} />
                    {user.faction_name || 'Unaffiliated'}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-black border border-zinc-800 rounded-full text-xs text-zinc-400">
                    <CalendarDays size={14} />
                    Joined {new Date(user.created_at || Date.now()).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <RankBadgeFull rank={user.rank} influence={user.influence} />
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Influence', value: user.influence, icon: Zap, color: 'text-yellow-500' },
              { label: 'Reputation', value: user.reputation, icon: Target, color: 'text-blue-500' },
              { label: 'Heat Level', value: `${user.heat_level}%`, icon: AlertTriangle, color: 'text-red-500' },
            ].map((stat, i) => (
              <div key={i} className="border border-zinc-800 bg-zinc-900/30 p-5 rounded-xl hover:border-zinc-700 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <stat.icon className={stat.color} size={20} />
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{stat.label}</h3>
                </div>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
              </div>
            ))}
          </div>

          <DailyInfTracker />

          <div className="border border-zinc-800 bg-zinc-900/30 p-6 rounded-xl">
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Award size={18} className="text-green-500" /> Titles
            </h3>
            <TitleSection />
          </div>

          {/* Pinned Post */}
          {user.pinned_post_id && user.pinned_post_content && (
            <div className="border border-yellow-500/30 bg-yellow-500/5 p-6 rounded-xl">
              <h3 className="text-xs font-bold text-yellow-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Pin size={14} /> Pinned Broadcast
              </h3>
              <div className="bg-black/40 border border-yellow-500/20 rounded-lg p-4">
                <p className="text-sm text-zinc-300 font-mono">{user.pinned_post_content}</p>
              </div>
            </div>
          )}

          {/* Broadcasts Section */}
          <ProfileBroadcastsSection />

          {/* Boosted Posts Section */}
          <ProfileBoostedSection />

        </div>
      </div>
    </DashboardLayout>
  );
}

function ProfileBroadcastsSection() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { data: posts, isLoading } = useQuery<Post[]>({
    queryKey: ['profile-posts'],
    queryFn: async () => {
      const res = await apiFetch('/api/posts?author_id=me');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  return (
    <div className="border border-zinc-800 bg-zinc-900/30 p-6 rounded-xl">
      <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Radio size={18} className="text-green-500" /> Recent Transmissions
      </h3>
      {isLoading ? (
        <p className="text-xs text-zinc-600 animate-pulse">Decrypting logs...</p>
      ) : !posts || posts.length === 0 ? (
        <p className="text-xs text-zinc-600 italic">No transmissions yet.</p>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {posts.map(p => (
            <ProfilePostCard key={p.id} post={p} isMine={true} queryClient={queryClient} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProfilePostCard({ post, isMine, queryClient }: { post: Post; isMine: boolean; queryClient: any }) {
  const { user } = useUser();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const isPinned = user?.pinned_post_id === post.id;

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
      queryClient.invalidateQueries({ queryKey: ['profile-posts'] });
    }
  });

  const repostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/posts/${post.id}/repost`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to repost');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Repost toggled');
      queryClient.invalidateQueries({ queryKey: ['profile-posts'] });
    }
  });

  return (
    <div className="border border-zinc-800 bg-black/30 p-4 rounded-lg hover:border-green-500/20 transition-all">
      <Link href={`/posts/${post.id}`} className="block">
        <p className="text-xs text-zinc-300 leading-relaxed mb-3 font-mono hover:text-green-300 transition-colors">{post.content}</p>
      </Link>
      <div className="flex items-center gap-4 pt-3 border-t border-zinc-800/50">
        <button onClick={() => boostMutation.mutate()} disabled={boostMutation.isPending || post.has_boosted}
          className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${post.has_boosted ? 'text-green-500 cursor-default' : 'text-zinc-500 hover:text-green-400'}`}>
          <Zap size={12} className={post.has_boosted ? "fill-green-500" : ""} /> {post.has_boosted ? 'Boosted' : 'Boost'}
        </button>
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest"><MessageSquare size={12} className="inline mr-1" />{post.reply_count}</span>
        {isMine && (
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isPinned ? 'text-yellow-500' : 'text-zinc-600'}`}>
            <Pin size={12} className={isPinned ? 'fill-yellow-500 inline' : 'inline'} /> {isPinned ? 'Pinned' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function ProfileBoostedSection() {
  const { user } = useUser();
  const { data: boosted, isLoading } = useQuery<BoostedPost[]>({
    queryKey: ['profile-boosted'],
    queryFn: async () => {
      const res = await apiFetch('/api/profile/boosted');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  return (
    <div className="border border-zinc-800 bg-zinc-900/30 p-6 rounded-xl">
      <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <TrendingUp size={18} className="text-yellow-500" /> Boosted Intel
      </h3>
      {isLoading ? (
        <p className="text-xs text-zinc-600 animate-pulse">Scanning...</p>
      ) : !boosted || boosted.length === 0 ? (
        <p className="text-xs text-zinc-600 italic">No boosted intel yet.</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {boosted.map(p => (
            <div key={p.id} className="border border-zinc-800 bg-black/30 p-4 rounded-lg hover:border-yellow-500/20 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold text-yellow-600 uppercase tracking-widest">
                  By {p.author_name}
                </span>
                <span className="text-[9px] font-mono text-zinc-600">
                  {new Date(p.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{p.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}