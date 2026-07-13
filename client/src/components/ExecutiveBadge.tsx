"use client";

import { Crown, Star, Shield, User } from 'lucide-react';

type RoleType = 'head' | 'vice_head' | 'executive' | 'member';

const roleConfig: Record<RoleType, {
  label: string;
  icon: React.ReactNode;
  color: string;
  border: string;
  bg: string;
  text: string;
}> = {
  head: {
    label: 'Head',
    icon: <Crown size={14} />,
    color: 'text-yellow-400',
    border: 'border-yellow-500/50',
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-400',
  },
  vice_head: {
    label: 'Vice Head',
    icon: <Star size={14} />,
    color: 'text-cyan-400',
    border: 'border-cyan-500/50',
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-400',
  },
  executive: {
    label: 'Executive',
    icon: <Shield size={14} />,
    color: 'text-purple-400',
    border: 'border-purple-500/50',
    bg: 'bg-purple-500/15',
    text: 'text-purple-400',
  },
  member: {
    label: 'Operative',
    icon: <User size={14} />,
    color: 'text-zinc-500',
    border: 'border-zinc-700/30',
    bg: 'bg-zinc-800/30',
    text: 'text-zinc-500',
  },
};

export function ExecutiveBadgeSmall({ role }: { role: string }) {
  const normalizedRole = (['head', 'vice_head', 'executive', 'member'] as RoleType[]).includes(role as RoleType)
    ? (role as RoleType)
    : 'member';
  const cfg = roleConfig[normalizedRole];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${cfg.bg} ${cfg.border} border ${cfg.text} whitespace-nowrap`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

/**
 * Full executive badge with username — available for use in dedicated leadership cards.
 * Not currently wired into any page.
 */
