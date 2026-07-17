"use client";

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { User, Loader2 } from 'lucide-react';

type UserResult = {
  id: string;
  username: string;
  display_name: string;
};

interface UserAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minQueryLength?: number;
  className?: string;
}

export default function UserAutocomplete({
  value,
  onChange,
  placeholder = 'Search users...',
  disabled = false,
  minQueryLength = 1,
  className = '',
}: UserAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync internal query state when parent value changes (e.g. on clear)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Debounced user search
  const { data: users, isFetching } = useQuery<UserResult[]>({
    queryKey: ['user-search', query],
    queryFn: async () => {
      if (!query.trim() || query.length < minQueryLength) return [];
      const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      return res.ok ? res.json() : [];
    },
    staleTime: 10_000,
    enabled: query.trim().length >= minQueryLength,
  });

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectUser = (username: string) => {
    onChange(username);
    setQuery(username);
    setShowDropdown(false);
    inputRef.current?.blur();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setQuery(newVal);
    onChange(newVal); // sync every keystroke to parent
    setShowDropdown(true);
    setSelectedIdx(0);
  };

  const handleFocus = () => {
    if (query.trim().length >= minQueryLength) {
      setShowDropdown(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || !users || users.length === 0) {
      if (e.key === 'Enter') {
        onChange(query); // pass raw input if no selection
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => (prev + 1) % users.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => (prev <= 0 ? users.length - 1 : prev - 1));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < users.length) {
        selectUser(users[selectedIdx].username);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full bg-black border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-red-500/50 text-zinc-200 placeholder-zinc-600 disabled:opacity-40 ${className}`}
        />
        {isFetching && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin" />
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && users && users.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-black border border-zinc-800 rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.8)] z-50 max-h-48 overflow-y-auto"
        >
          {users.slice(0, 10).map((u, i) => (
            <button
              key={u.id}
              onClick={() => selectUser(u.username)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${
                i === selectedIdx
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'hover:bg-zinc-900/80'
              } border-b border-zinc-800/30 last:border-0`}
            >
              <div className="w-7 h-7 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                <User size={12} className="text-zinc-500" />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-bold text-zinc-200 truncate">{u.display_name}</span>
                <span className="text-[9px] text-zinc-500 truncate">@{u.username}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
