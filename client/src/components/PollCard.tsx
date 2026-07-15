"use client";

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';

export type PollData = {
  id: string;
  question: string;
  expires_at: string;
  total_votes: number;
  options: Array<{
    id: string;
    label: string;
    vote_count: number;
    percentage: number;
    voted_by_me: boolean;
  }>;
};

export default function PollCard({ poll, postId, onVote }: { poll: PollData; postId: string; onVote?: () => void }) {
  const { user } = useUser();
  const [votingOption, setVotingOption] = useState<string | null>(null);
  const [pollState, setPollState] = useState<PollData>(poll);
  const isExpired = new Date(poll.expires_at).getTime() < Date.now();
  const hasVoted = poll.options.some(o => o.voted_by_me);

  const voteMutation = useMutation({
    mutationFn: async (optionId: string) => {
      const res = await apiFetch(`/api/polls/${poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: optionId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onMutate: (optionId) => {
      setVotingOption(optionId);
    },
    onSuccess: (data, optionId) => {
      if (data.status === 'unvoted') {
        // Remove vote
        setPollState(prev => ({
          ...prev,
          total_votes: prev.total_votes - 1,
          options: prev.options.map(o => ({
            ...o,
            voted_by_me: false,
            vote_count: o.id === optionId ? o.vote_count - 1 : o.vote_count,
          })),
        }));
        // Recalculate percentages
        setPollState(prev => recalcPercentages(prev));
        toast.success("Vote removed");
      } else {
        // Add/change vote
        setPollState(prev => {
          const hadPrevVote = prev.options.some(o => o.voted_by_me);
          return {
            ...prev,
            total_votes: hadPrevVote ? prev.total_votes : prev.total_votes + 1,
            options: prev.options.map(o => ({
              ...o,
              voted_by_me: o.id === optionId,
              vote_count: o.id === optionId
                ? (o.voted_by_me ? o.vote_count : o.vote_count + 1)
                : (o.voted_by_me ? o.vote_count - 1 : o.vote_count),
            })),
          };
        });
        setPollState(prev => recalcPercentages(prev));
        toast.success("Vote recorded");
      }
      onVote?.();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setVotingOption(null),
  });

  if (pollState.total_votes === 0 && !isExpired) {
    // Fresh poll — no vote count percentages
    return (
      <div className="mt-4 border border-zinc-800 rounded-lg bg-zinc-950/50 p-4">
        <p className="text-xs font-bold text-zinc-300 mb-3">{poll.question}</p>
        <div className="space-y-2">
          {pollState.options.map(opt => (
            <button
              key={opt.id}
              onClick={() => {
                if (!user) { toast.error("Create an identity first."); return; }
                voteMutation.mutate(opt.id);
              }}
              disabled={voteMutation.isPending || isExpired}
              className="w-full text-left px-3 py-2 border border-zinc-800 rounded-lg text-xs text-zinc-400 hover:border-green-500/50 hover:text-green-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[9px] text-zinc-600 mt-2">No votes yet · {isExpired ? 'Expired' : 'Vote now'}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 border border-zinc-800 rounded-lg bg-zinc-950/50 p-4">
      <p className="text-xs font-bold text-zinc-300 mb-3">{poll.question}</p>
      <div className="space-y-2">
        {pollState.options.map(opt => {
          const pct = opt.percentage;
          return (
            <button
              key={opt.id}
              onClick={() => {
                if (!user) { toast.error("Create an identity first."); return; }
                voteMutation.mutate(opt.id);
              }}
              disabled={voteMutation.isPending || isExpired}
              className={`w-full relative overflow-hidden rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer ${
                opt.voted_by_me
                  ? 'border border-green-500/50 ring-1 ring-green-500/30'
                  : 'border border-zinc-800 hover:border-zinc-600'
              }`}
            >
              {/* Progress bar background */}
              <div
                className={`absolute inset-0 transition-all duration-500 ${
                  opt.voted_by_me ? 'bg-green-500/10' : 'bg-zinc-900/50'
                }`}
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {opt.voted_by_me && <span className="text-green-400 text-[9px]">✓</span>}
                  <span className={`text-xs truncate ${opt.voted_by_me ? 'text-green-300' : 'text-zinc-400'}`}>
                    {opt.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold text-zinc-500">{opt.vote_count}</span>
                  <span className={`text-[10px] font-bold ${opt.voted_by_me ? 'text-green-400' : 'text-zinc-600'}`}>
                    {pct}%
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[9px] text-zinc-600 mt-2">
        {pollState.total_votes} vote{pollState.total_votes !== 1 ? 's' : ''}
        {isExpired ? ' · Closed' : ' · Vote now'}
      </p>
    </div>
  );
}

function recalcPercentages(poll: PollData): PollData {
  const total = poll.options.reduce((sum, o) => sum + o.vote_count, 0);
  if (total === 0) return { ...poll, options: poll.options.map(o => ({ ...o, percentage: 0 })) };
  return {
    ...poll,
    total_votes: total,
    options: poll.options.map(o => ({
      ...o,
      percentage: Math.round((o.vote_count / total) * 100),
    })),
  };
}
