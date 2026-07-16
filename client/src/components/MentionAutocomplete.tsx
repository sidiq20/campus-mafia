"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { User } from 'lucide-react';
import Link from 'next/link';

type UserResult = {
  id: string;
  username: string;
  display_name: string;
};

interface MentionAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  minQueryLength?: number;
}

export function MentionAutocomplete({
  value,
  onChange,
  placeholder = 'Type here...',
  className = '',
  rows = 3,
  disabled = false,
  onKeyDown,
  minQueryLength = 1,
}: MentionAutocompleteProps) {
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionStart, setMentionStart] = useState(-1);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced mention query for autocomplete
  const { data: mentionUsers } = useQuery<UserResult[]>({
    queryKey: ['mention-search', mentionQuery],
    queryFn: async () => {
      if (!mentionQuery.trim() || mentionQuery.length < minQueryLength) return [];
      const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(mentionQuery)}`);
      return res.ok ? res.json() : [];
    },
    staleTime: 10_000,
    enabled: mentionQuery.trim().length >= minQueryLength && showMentions,
  });

  // Track @mention being typed
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    onChange(newVal);

    // Find the last @mention pattern before cursor position
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = newVal.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex >= 0) {
      // Check if there's a space before the @ (or it's at start of string)
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1);
        // Only show if no space after @ and query is alphanumeric
        if (!query.includes(' ') && /^[\w]*$/.test(query)) {
          setMentionQuery(query);
          setMentionStart(atIndex);
          setShowMentions(true);
          setSelectedIdx(0);
          return;
        }
      }
    }
    setShowMentions(false);
    setMentionStart(-1);
  }, [onChange]);

  // Insert selected mention
  const insertMention = useCallback((username: string) => {
    if (mentionStart < 0) return;

    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + mentionQuery.length + 1); // +1 for @
    const newVal = `${before}@${username} ${after}`;
    onChange(newVal);
    setShowMentions(false);
    setMentionStart(-1);
    setMentionQuery('');

    // Focus back on input
    setTimeout(() => {
      inputRef.current?.focus();
      const cursorPos = before.length + username.length + 2;
      inputRef.current?.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  }, [value, mentionStart, mentionQuery, onChange]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && mentionUsers && mentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(prev => (prev + 1) % mentionUsers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(prev => (prev <= 0 ? mentionUsers.length - 1 : prev - 1));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (selectedIdx >= 0 && selectedIdx < mentionUsers.length) {
          e.preventDefault();
          insertMention(mentionUsers[selectedIdx].username);
          return;
        }
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }
    onKeyDown?.(e);
  }, [showMentions, mentionUsers, selectedIdx, insertMention, onKeyDown]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        rows={rows}
        disabled={disabled}
      />

      {/* Mention suggestions dropdown */}
      {showMentions && mentionUsers && mentionUsers.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 right-0 mb-1 bg-black border border-zinc-800 rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.8)] z-50 max-h-48 overflow-y-auto"
        >
          {mentionUsers.slice(0, 8).map((u, i) => (
            <button
              key={u.id}
              onClick={() => insertMention(u.username)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${
                i === selectedIdx ? 'bg-green-500/10 border-green-500/30' : 'hover:bg-zinc-900/80'
              } border-b border-zinc-800/30 last:border-0`}
            >
              <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                <User size={10} className="text-zinc-500" />
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
