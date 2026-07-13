"use client";

import { useEffect, useCallback } from 'react';
import { Shield, AlertTriangle, X, UserPlus } from 'lucide-react';

type ConfirmJoinDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  factionName: string;
  isConfirming: boolean;
};

export default function ConfirmJoinDialog({
  isOpen,
  onClose,
  onConfirm,
  factionName,
  isConfirming,
}: ConfirmJoinDialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-md border border-purple-500/40 bg-zinc-950/95 backdrop-blur-xl rounded-2xl shadow-[0_0_60px_rgba(168,85,247,0.2)] animate-slide-in overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-dialog-title"
      >
        {/* Glow accents */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-red-500/10 rounded-full blur-[80px] pointer-events-none" />

        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isConfirming}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors disabled:opacity-50 z-10"
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        <div className="p-8 relative z-10">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-purple-500/10 border-2 border-purple-500/30 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(168,85,247,0.15)]">
            <Shield className="text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]" size={32} />
          </div>

          {/* Title */}
          <h2
            id="join-dialog-title"
            className="text-center text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-violet-600 uppercase tracking-tight mb-2"
          >
            Confirm Allegiance
          </h2>

          {/* Faction name */}
          <p className="text-center text-sm text-zinc-400 mb-6">
            You are about to pledge your loyalty to{' '}
            <span className="font-bold text-purple-400">{factionName}</span>.
          </p>

          {/* Warning card */}
          <div className="border border-yellow-500/30 bg-yellow-950/10 rounded-xl p-4 mb-8">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-yellow-500 shrink-0 mt-0.5 drop-shadow-[0_0_5px_rgba(234,179,8,0.3)]" />
              <div>
                <h3 className="text-xs font-bold text-yellow-500 uppercase tracking-widest mb-1">
                  ⚠ 5-Day Cooldown Warning
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Once you join <span className="font-bold text-zinc-300">{factionName}</span>, you will be locked in for{' '}
                  <span className="font-bold text-yellow-500">5 days</span>. You won&apos;t be able to leave, change factions, or create a new one during this period. Choose wisely.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={onConfirm}
              disabled={isConfirming}
              className="w-full py-3.5 bg-purple-500/10 text-purple-400 border border-purple-500/50 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isConfirming ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                  Encrypting Connection...
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  Confirm Allegiance
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isConfirming}
              className="w-full py-2.5 text-zinc-500 border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-widest hover:text-zinc-300 hover:border-zinc-700 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
