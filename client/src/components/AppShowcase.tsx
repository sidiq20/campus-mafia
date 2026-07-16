"use client";

import { useState, useEffect } from 'react';
import { MessageSquare, Skull, Crosshair, MapIcon, User, Bell, Menu } from 'lucide-react';

const MOCK_POSTS = [
  { author: 'cyber_null', faction: 'The Cartel', content: 'library mainframe is exposed. hit at 0200. who\'s with me?', boosts: 12, time: '2m ago' },
  { author: 'ne0n_raver', faction: 'The Ravens', content: 'just intercepted comms: 404 planning something big in the quad. stay sharp.', boosts: 8, time: '7m ago' },
  { author: 'hex_lord', faction: 'Ghost Protocol', content: 'propaganda boost active. double INF for the next hour. make it count.', boosts: 24, time: '15m ago' },
];

export default function AppShowcase() {
  const [visiblePosts, setVisiblePosts] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'territory'>('feed');

  useEffect(() => {
    const timers = MOCK_POSTS.map((_, i) =>
      setTimeout(() => setVisiblePosts(p => [...p, i]), 600 + i * 500)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative mx-auto max-w-[320px]">
      {/* Phone frame */}
      <div className="relative bg-black rounded-[2.5rem] border-2 border-zinc-800 shadow-[0_0_60px_rgba(34,197,94,0.15)] overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-b-xl z-10 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-zinc-800" />
        </div>

        {/* Status bar */}
        <div className="pt-8 pb-2 px-5 flex items-center justify-between text-[9px] text-zinc-500 font-mono">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <span className="w-3.5 h-2 border border-zinc-600 rounded-sm relative overflow-hidden">
              <span className="absolute inset-0.5 right-0.5 bg-green-500/60 rounded-sm" />
            </span>
            <span>📶</span>
          </div>
        </div>

        {/* App header */}
        <div className="px-4 py-2 border-b border-green-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skull size={14} className="text-green-500" />
            <span className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Dept.OS</span>
          </div>
          <div className="flex items-center gap-3">
            <Bell size={12} className="text-zinc-600" />
            <User size={12} className="text-zinc-600" />
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-widest transition-colors ${
              activeTab === 'feed' ? 'text-green-400 border-b-2 border-green-500' : 'text-zinc-600'
            }`}
          >
            Feed
          </button>
          <button
            onClick={() => setActiveTab('territory')}
            className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-widest transition-colors ${
              activeTab === 'territory' ? 'text-green-400 border-b-2 border-green-500' : 'text-zinc-600'
            }`}
          >
            Territory
          </button>
        </div>

        {/* Content area */}
        <div className="h-[380px] overflow-hidden">
          {activeTab === 'feed' ? (
            <div className="p-3 space-y-2">
              {/* Compose bar */}
              <div className="flex items-center gap-2 mb-3 p-2 border border-zinc-800 rounded-lg bg-zinc-900/50">
                <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                  <span className="text-[7px] text-green-400 font-bold">C</span>
                </div>
                <span className="text-[9px] text-zinc-600 italic">Broadcast intel...</span>
                <Crosshair size={10} className="text-zinc-700 ml-auto" />
              </div>

              {MOCK_POSTS.map((post, i) => (
                <div
                  key={i}
                  className={`p-3 border border-zinc-800 bg-black/40 rounded-lg transition-all duration-500 ${
                    visiblePosts.includes(i) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[9px] font-bold text-green-400">@{post.author}</span>
                    <span className="text-[7px] text-zinc-700">{post.faction}</span>
                    <span className="text-[7px] text-zinc-700 ml-auto">{post.time}</span>
                  </div>
                  <p className="text-[10px] text-zinc-300 leading-relaxed font-mono">{post.content}</p>
                  <div className="flex items-center gap-3 mt-2 text-[8px] text-zinc-600">
                    <span>🔥 {post.boosts}</span>
                    <span>💬 {Math.floor(post.boosts / 3)}</span>
                    <span>🔄 {Math.floor(post.boosts / 5)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3">
              {/* Territory grid mockup */}
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 9 }).map((_, i) => {
                  const colors = ['bg-green-500/20', 'bg-red-500/20', 'bg-purple-500/20', 'bg-blue-500/20', 'bg-yellow-500/20', 'bg-orange-500/20', 'bg-green-500/20', 'bg-red-500/20', 'bg-purple-500/20'];
                  const borders = ['border-green-500/30', 'border-red-500/30', 'border-purple-500/30', 'border-blue-500/30', 'border-yellow-500/30', 'border-orange-500/30', 'border-green-500/30', 'border-red-500/30', 'border-purple-500/30'];
                  const names = ['Lib', 'Quad', 'Lab', 'Dorm', 'Gym', 'Hall', 'Cafe', 'Park', 'Hub'];
                  return (
                    <div key={i} className={`aspect-square ${colors[i]} border ${borders[i]} rounded flex flex-col items-center justify-center gap-0.5 transition-all hover:scale-105`}>
                      <span className="text-[9px] font-bold" style={{ color: borders[i].includes('green') ? '#4ade80' : borders[i].includes('red') ? '#f87171' : '#c084fc' }}>
                        {names[i]}
                      </span>
                      <span className="text-[6px] text-zinc-600">{Math.floor(40 + Math.random() * 80)} DEF</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <div className="border-t border-zinc-800 px-4 py-2 flex items-center justify-around">
          {[Crosshair, MessageSquare, MapIcon, User].map((Icon, i) => (
            <div key={i} className={`flex flex-col items-center gap-0.5 ${i === 0 ? 'text-green-500' : 'text-zinc-700'}`}>
              <Icon size={14} />
              <span className="text-[6px] uppercase tracking-wider">{
                ['Feed', 'Chat', 'Map', 'Profile'][i]
              }</span>
            </div>
          ))}
        </div>
      </div>

      {/* Glow effect behind the phone */}
      <div className="absolute -inset-4 bg-gradient-to-t from-green-500/5 via-transparent to-transparent blur-3xl -z-10 rounded-3xl" />
    </div>
  );
}
