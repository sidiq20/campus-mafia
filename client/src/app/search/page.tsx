"use client";

import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, User, Zap, MessageSquare, Repeat2, ArrowLeft, Hash, Clock, X } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/contexts/UserContext';
import { PullToRefresh } from '@/components/PullToRefresh';
import { MentionText } from '@/components/MentionText';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { toast } from 'sonner';

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

type UserSearchResult = {
  id: string;
  username: string;
  display_name: string;
};

export default function SearchPageWrapper() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center text-green-500 animate-pulse text-sm">
          Loading search...
        </div>
      </DashboardLayout>
    }>
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(query);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { user } = useUser();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced value for autocomplete queries
  const [debouncedInput, setDebouncedInput] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInput(searchInput);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Autocomplete suggestions
  const { data: suggestUsers } = useQuery<UserSearchResult[]>({
    queryKey: ['suggest-users', debouncedInput],
    queryFn: async () => {
      if (!debouncedInput.trim()) return [];
      const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(debouncedInput)}`);
      return res.ok ? res.json() : [];
    },
    staleTime: 10_000,
    enabled: debouncedInput.trim().length > 0 && showSuggestions,
  });

  const { data: suggestPosts } = useQuery<Post[]>({
    queryKey: ['suggest-posts', debouncedInput],
    queryFn: async () => {
      if (!debouncedInput.trim()) return [];
      const res = await apiFetch(`/api/posts?q=${encodeURIComponent(debouncedInput)}`);
      return res.ok ? res.json() : [];
    },
    staleTime: 10_000,
    enabled: debouncedInput.trim().length > 0 && showSuggestions,
  });

  // Recent searches stored in localStorage
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('recent-searches');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const saveRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, 5);
      localStorage.setItem('recent-searches', JSON.stringify(updated));
      return updated;
    });
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recent-searches');
  };

  const removeRecentSearch = (term: string) => {
    setRecentSearches(prev => {
      const updated = prev.filter(s => s !== term);
      localStorage.setItem('recent-searches', JSON.stringify(updated));
      return updated;
    });
  };

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Main search queries (when there's a submitted query)
  const { data: searchUsers, isFetching: isUsersLoading } = useQuery<UserSearchResult[]>({
    queryKey: ['search-users', query],
    queryFn: async () => {
      if (!query.trim()) return [];
      const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      return res.ok ? res.json() : [];
    },
    staleTime: 15_000,
    enabled: query.trim().length > 0,
  });

  const { data: posts, isLoading: isPostsLoading } = useQuery<Post[]>({
    queryKey: ['search-posts', query],
    queryFn: async () => {
      if (!query.trim()) return [];
      const res = await apiFetch(`/api/posts?q=${encodeURIComponent(query)}`);
      return res.ok ? res.json() : [];
    },
    staleTime: 15_000,
    enabled: query.trim().length > 0,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      saveRecentSearch(searchInput.trim());
      setShowSuggestions(false);
      router.push(`/search?q=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = (suggestUsers?.length || 0) + (suggestPosts?.length || 0);
    if (totalItems === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev <= 0 ? totalItems - 1 : prev - 1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      const userCount = suggestUsers?.length || 0;
      if (selectedIndex < userCount) {
        const user = suggestUsers![selectedIndex];
        router.push(`/profile/${user.username}`);
      } else {
        const post = suggestPosts![selectedIndex - userCount];
        router.push(`/posts/${post.id}`);
      }
      setShowSuggestions(false);
    }
  };

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [suggestUsers, suggestPosts]);

  const isLoading = isPostsLoading || isUsersLoading;

  const refetch = async () => {
    await queryClient.invalidateQueries({ queryKey: ['search-posts'] });
    await queryClient.invalidateQueries({ queryKey: ['search-users'] });
  };

  const hasSuggestions = (suggestUsers && suggestUsers.length > 0) || (suggestPosts && suggestPosts.length > 0);

  return (
    <DashboardLayout>
      <header className="sticky top-0 z-30 border-b border-green-500/30 bg-black/60 backdrop-blur-md">
        <div className="flex items-center gap-4 px-4 sm:px-8 h-16">
          <Link href="/feed" className="text-zinc-500 hover:text-green-400 transition-colors shrink-0">
            <ArrowLeft size={20} />
          </Link>
          <div ref={searchRef} className="flex-1 max-w-xl relative">
            <form onSubmit={handleSearch}>
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setShowSuggestions(true);
                  setSelectedIndex(-1);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder="Search intel, operatives..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded pl-9 pr-4 py-2 text-sm outline-none focus:border-green-500/50 text-zinc-200 placeholder:text-zinc-600"
                autoFocus
              />
            </form>

            {/* Autocomplete / Recent Searches Dropdown */}
            {showSuggestions && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-black border border-zinc-800 rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.8)] z-50 max-h-80 overflow-y-auto">
                {/* Recent Searches — shown when input is empty */}
                {!searchInput.trim() && recentSearches.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[9px] font-bold text-zinc-600 uppercase tracking-widest border-b border-zinc-800/50 flex items-center justify-between sticky top-0 bg-black/95 backdrop-blur">
                      <div className="flex items-center gap-2">
                        <Clock size={10} /> Recent Searches
                      </div>
                      <button
                        onClick={clearRecentSearches}
                        className="text-zinc-600 hover:text-zinc-400 text-[8px] uppercase tracking-widest font-bold transition-colors"
                      >
                        Clear all
                      </button>
                    </div>
                    {recentSearches.map((term) => (
                      <div key={term} className="flex items-center px-4 py-2.5 hover:bg-zinc-900/80 transition-colors group border-b border-zinc-800/30 last:border-0">
                        <button
                          onClick={() => {
                            setSearchInput(term);
                            setShowSuggestions(false);
                            router.push(`/search?q=${encodeURIComponent(term)}`);
                          }}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <Clock size={12} className="text-zinc-600 shrink-0" />
                          <span className="text-xs text-zinc-300 truncate">{term}</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentSearch(term);
                          }}
                          className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0 p-1"
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Autocomplete — shown when user is typing */}
                {searchInput.trim() && (
                  <>
                    {debouncedInput.trim() && !suggestUsers && !suggestPosts ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-[10px] text-green-500/60 animate-pulse uppercase tracking-widest">Searching...</p>
                      </div>
                    ) : hasSuggestions ? (
                      <>
                        {/* User Suggestions */}
                        {suggestUsers && suggestUsers.length > 0 && (
                          <div>
                            <div className="px-4 py-1.5 text-[9px] font-bold text-zinc-600 uppercase tracking-widest border-b border-zinc-800/50 flex items-center gap-2 sticky top-0 bg-black/95 backdrop-blur">
                              <User size={10} /> Operatives
                            </div>
                            {suggestUsers.slice(0, 4).map((u, i) => (
                              <Link
                                key={u.id}
                                href={`/profile/${u.username}`}
                                onClick={() => setShowSuggestions(false)}
                                className={`flex items-center gap-3 px-4 py-2.5 transition-colors border-b border-zinc-800/30 last:border-0 ${
                                  selectedIndex === i ? 'bg-green-500/10 border-green-500/30' : 'hover:bg-zinc-900/80'
                                }`}
                              >
                                <div className="w-7 h-7 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                                  <User size={12} className="text-zinc-500" />
                                </div>
                                <div className="min-w-0">
                                  <span className="block text-xs font-bold text-zinc-200 truncate">{u.display_name}</span>
                                  <span className="text-[10px] text-zinc-500 truncate">@{u.username}</span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}

                        {/* Post Suggestions */}
                        {suggestPosts && suggestPosts.length > 0 && (
                          <div>
                            <div className="px-4 py-1.5 text-[9px] font-bold text-zinc-600 uppercase tracking-widest border-b border-zinc-800/50 flex items-center gap-2 sticky top-0 bg-black/95 backdrop-blur">
                              <Hash size={10} /> Intel Reports
                            </div>
                            {suggestPosts.slice(0, 4).map((p, i) => {
                              const idx = (suggestUsers?.length || 0) + i;
                              return (
                                <Link
                                  key={p.id}
                                  href={`/posts/${p.id}`}
                                  onClick={() => setShowSuggestions(false)}
                                  className={`block px-4 py-2.5 transition-colors border-b border-zinc-800/30 last:border-0 ${
                                    selectedIndex === idx ? 'bg-green-500/10 border-green-500/30' : 'hover:bg-zinc-900/80'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 mb-0.5">
                                    <span className="font-bold">{p.is_anonymous ? 'Anonymous' : `@${p.author_name}`}</span>
                                    <span className="text-zinc-700">·</span>
                                    <span>{p.created_at ? new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}</span>
                                  </div>
                                  <p className="text-xs text-zinc-300 truncate leading-relaxed">{p.content}</p>
                                  <div className="flex items-center gap-3 mt-1 text-[9px] text-zinc-600">
                                    <span className="flex items-center gap-1"><MessageSquare size={9} />{p.reply_count || 0}</span>
                                    <span className="flex items-center gap-1"><Zap size={9} />{p.boost_count || 0}</span>
                                    <span className="flex items-center gap-1"><Repeat2 size={9} />{p.repost_count || 0}</span>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        )}

                        {/* See all results */}
                        <button
                          onClick={() => {
                            saveRecentSearch(searchInput.trim());
                            setShowSuggestions(false);
                            router.push(`/search?q=${encodeURIComponent(searchInput.trim())}`);
                          }}
                          className="w-full px-4 py-3 text-[10px] font-bold text-green-500 hover:bg-green-500/5 uppercase tracking-widest border-t border-zinc-800/50 transition-colors"
                        >
                          <Search size={12} className="inline mr-1.5" />
                          See all results for &ldquo;{searchInput}&rdquo;
                        </button>
                      </>
                    ) : (
                      <div className="px-4 py-8 text-center">
                        <Search size={20} className="text-zinc-800 mx-auto mb-2" />
                        <p className="text-[10px] text-zinc-600 uppercase tracking-widest">No suggestions found</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold hidden sm:block whitespace-nowrap">
            {query ? `Results for "${query}"` : 'Search'}
          </span>
        </div>
      </header>

      <PullToRefresh onRefresh={refetch} className="flex-1">
        <div className="p-4 sm:p-8 space-y-8 pb-24">
          {!query ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Search size={48} className="text-zinc-800 mb-4" />
              <h2 className="text-lg font-bold text-zinc-600 uppercase tracking-widest">Search for intel</h2>
              <p className="text-xs text-zinc-700 mt-2">Find broadcasts and operatives across the network</p>
            </div>
          ) : isLoading ? (
            <div className="text-center text-green-500 text-sm py-12 animate-pulse font-mono">// Scanning frequencies...</div>
          ) : (
            <>
              {/* Users Section */}
              {searchUsers && searchUsers.length > 0 && (
                <div>
                  <div className="mb-4">
                    <h3 className="text-[10px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-2">
                      <User size={12} /> Operatives ({searchUsers.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                    {searchUsers.map(u => (
                      <Link
                        key={u.id}
                        href={`/profile/${u.username}`}
                        className="flex items-center gap-3 p-4 border border-zinc-800 bg-black/40 rounded-lg hover:border-green-500/30 hover:bg-green-500/5 transition-all duration-200 group"
                      >
                        <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 group-hover:border-green-500/30 transition-colors">
                          <User size={16} className="text-zinc-500 group-hover:text-green-400 transition-colors" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-zinc-200 truncate group-hover:text-green-400 transition-colors">{u.display_name}</span>
                          <span className="text-[11px] text-zinc-500 truncate">@{u.username}</span>
                        </div>
                        <div className="text-[10px] text-green-600 opacity-0 group-hover:opacity-100 transition-opacity uppercase font-bold">
                          View →
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Posts Section */}
              <div>
                <div className="mb-4">
                  <h3 className="text-[10px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-2">
                    <Zap size={12} /> Intel Reports ({posts?.length || 0})
                  </h3>
                </div>
                {posts?.length === 0 && (!searchUsers || searchUsers.length === 0) ? (
                  <div className="text-center py-16">
                    <p className="text-zinc-500 text-sm mb-2">No results found for &ldquo;{query}&rdquo;</p>
                    <p className="text-[10px] text-zinc-600">Try a different search term</p>
                  </div>
                ) : posts?.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-zinc-500 text-xs">No broadcasts match your search</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {posts?.map((post, i) => (
                      <div key={post.id} className="animate-fade-in" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}>
                        <SearchPostCard post={post} isMine={!!user && user.id === post.user_id} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </PullToRefresh>
    </DashboardLayout>
  );
}

function SearchPostCard({ post, isMine }: { post: Post; isMine: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useUser();
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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['search-posts'] });
      const previousPosts = queryClient.getQueryData<Post[]>(['search-posts']);
      queryClient.setQueryData<Post[]>(['search-posts'], (old) =>
        old?.map(p => p.id === post.id ? { ...p, has_boosted: true, boost_count: p.boost_count + 1 } : p)
      );
      return { previousPosts };
    },
    onSuccess: () => {
      toast.success("Broadcast boosted (+1 INF)");
    },
    onError: (_err, _vars, context) => {
      if (context?.previousPosts) queryClient.setQueryData(['search-posts'], context.previousPosts);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['search-posts'] });
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
      await queryClient.cancelQueries({ queryKey: ['search-posts'] });
      const previousPosts = queryClient.getQueryData<Post[]>(['search-posts']);
      queryClient.setQueryData<Post[]>(['search-posts'], (old) =>
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
      if (context?.previousPosts) queryClient.setQueryData(['search-posts'], context.previousPosts);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['search-posts'] });
    }
  });

  const displayFaction = post.is_anonymous ? 'Classified' : (post.faction_name || 'Unaffiliated');

  const handleCardClick = (e: React.MouseEvent) => {
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
          <div className="w-8 h-8 rounded-sm bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
            <Zap size={14} />
          </div>
          <div>
            {post.is_anonymous ? (
              <span className="block font-bold text-sm text-zinc-500">Anonymous</span>
            ) : (
              <div className="flex items-center gap-2">
                <Link href={`/profile/${post.author_username || post.author_name}`} onClick={e => e.stopPropagation()} className="block font-bold text-sm text-zinc-200 hover:text-green-400 transition-colors">
                  @{post.author_name}
                </Link>
                <Link href={`/chat/${post.author_username || post.author_name}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-green-600 hover:text-green-400 border border-green-900 px-1 rounded uppercase transition-colors">
                  DM
                </Link>
              </div>
            )}
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{displayFaction}</span>
          </div>
        </div>
        <span className="text-[10px] font-mono text-zinc-600 whitespace-nowrap">
          {post.created_at ? new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
        </span>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed mb-6 font-mono hover:text-green-300 transition-colors">
        <MentionText text={post.content} />
      </p>
      <div className="flex items-center gap-6 pt-4 border-t border-zinc-800/50">
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/posts/${post.id}`); }}
          className="group flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-400 transition-colors"
          title={`${post.reply_count} Replies`}
        >
          <MessageSquare size={16} className="group-hover:text-blue-400 transition-colors" />
          <span className="font-medium tabular-nums">{post.reply_count || ''}</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!user) {
              toast.error("Create an identity first.");
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!user) {
              toast.error("Create an identity first.");
              return;
            }
            repostMutation.mutate();
          }}
          disabled={repostMutation.isPending}
          className={`group flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50 ${post.has_reposted ? 'text-green-500 cursor-default' : 'text-zinc-500 hover:text-green-400'}`}
          title={post.has_reposted ? 'Reposted' : 'Repost'}
        >
          <Repeat2 size={16} className={`transition-colors ${post.has_reposted ? 'text-green-500' : 'group-hover:text-green-400'}`} />
          <span className={`font-medium tabular-nums ${post.has_reposted ? 'text-green-500' : ''}`}>{post.repost_count || ''}</span>
        </button>
      </div>
    </div>
  );
}
