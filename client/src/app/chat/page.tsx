"use client";

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import Link from 'next/link';
import { Search, User } from 'lucide-react';

export default function ChatsIndexPage() {
  const [search, setSearch] = useState('');

  return (
    <DashboardLayout>
      <header className="h-16 border-b border-green-500/30 flex items-center px-8 bg-black/60 backdrop-blur-md">
        <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest glow-text">Direct Channels</h2>
      </header>

      <div className="flex-1 p-8 bg-[#050505]">
        <div className="max-w-lg mx-auto">
          <div className="relative mb-8">
            <Search className="absolute left-4 top-3 text-zinc-500" size={18} />
            <input 
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search operative by username..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-12 pr-4 py-3 text-sm outline-none focus:border-green-500/50 text-zinc-200"
            />
          </div>

          <div className="space-y-3">
             {search && (
               <Link 
                 href={`/chat/${search}`}
                 className="flex items-center justify-between p-4 bg-black/60 border border-green-500/30 rounded-lg hover:border-green-500 transition-colors group"
               >
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center">
                     <User size={14} className="text-zinc-500 group-hover:text-green-400" />
                   </div>
                   <span className="font-bold text-zinc-200">@{search}</span>
                 </div>
                 <span className="text-xs text-green-500 font-bold uppercase tracking-widest">Message</span>
               </Link>
             )}
             {!search && (
               <div className="text-center text-zinc-600 text-sm py-12">// Enter a username to initiate a secure connection</div>
             )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
