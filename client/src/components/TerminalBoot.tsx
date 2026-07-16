"use client";

import { useState, useEffect } from 'react';
import { Skull } from 'lucide-react';

type Line = { text: string; done: boolean; color?: string; delay?: number };

const BOOT_LINES: Omit<Line, 'done'>[] = [
  { text: '[BOOT] Dept.OS v2.4.1 // Campus Mafia Protocol', color: 'text-green-400', delay: 200 },
  { text: '[AUTH] Establishing secure uplink...', color: 'text-green-300', delay: 150 },
  { text: '[NET] Scanning nearby operatives...', color: 'text-cyan-400', delay: 120 },
  { text: '[INF] Loading faction intelligence grid...', color: 'text-yellow-400', delay: 130 },
  { text: '[CRYPTO] Initializing encrypted comms channels...', color: 'text-purple-400', delay: 140 },
  { text: '[TERRITORY] Syncing tactical zone data...', color: 'text-orange-400', delay: 110 },
  { text: '', color: 'text-transparent', delay: 80 },
  { text: '> System ready. All protocols nominal.', color: 'text-green-400', delay: 200 },
  { text: '> Welcome, operative. You are cleared for access.', color: 'text-green-300', delay: 180 },
];

export default function TerminalBoot({ onComplete }: { onComplete?: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [currentChar, setCurrentChar] = useState(0);
  const [finished, setFinished] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const [bootPhase, setBootPhase] = useState<'booting' | 'ready' | 'done'>('booting');

  // Blinking cursor
  useEffect(() => {
    const interval = setInterval(() => setShowCursor(c => !c), 530);
    return () => clearInterval(interval);
  }, []);

  // Type out lines
  useEffect(() => {
    if (currentLineIdx >= BOOT_LINES.length) return;

    const line = BOOT_LINES[currentLineIdx];
    if (line.text === '') {
      setLines(prev => [...prev, { text: '', done: true, color: 'text-transparent' }]);
      setCurrentLineIdx(i => i + 1);
      setCurrentChar(0);
      return;
    }

    if (currentChar < line.text.length) {
      const timeout = setTimeout(() => {
        setCurrentChar(c => c + 1);
      }, 15 + Math.random() * 30); // Typewriter jitter
      return () => clearTimeout(timeout);
    }

    // Line complete
    const timeout = setTimeout(() => {
      setLines(prev => prev.map((l, i) => i === currentLineIdx ? { ...l, done: true } : l));
      setCurrentLineIdx(i => i + 1);
      setCurrentChar(0);
    }, line.delay || 200);
    return () => clearTimeout(timeout);
  }, [currentLineIdx, currentChar]);

  // Mark as finished once all lines are done
  useEffect(() => {
    if (currentLineIdx >= BOOT_LINES.length && !finished) {
      const timeout = setTimeout(() => {
        setFinished(true);
        setBootPhase('ready');
        onComplete?.();

        // Transition to "done" after showing the ready state
        setTimeout(() => {
          setBootPhase('done');
        }, 1200);
      }, 600);
      return () => clearTimeout(timeout);
    }
  }, [currentLineIdx, finished, onComplete]);

  // Build the current line being typed
  const currentLine = currentLineIdx < BOOT_LINES.length ? BOOT_LINES[currentLineIdx] : null;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-black/90 border border-green-500/30 rounded-xl p-5 sm:p-6 shadow-[0_0_40px_rgba(34,197,94,0.1)] font-mono text-xs sm:text-sm leading-relaxed overflow-hidden">
        {/* Terminal header */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-green-500/20">
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
          <div className="w-3 h-3 rounded-full bg-green-500/60" />
          <span className="text-[9px] text-zinc-600 uppercase tracking-widest ml-2">deptos-terminal v2.4.1</span>
        </div>

        {/* Boot lines */}
        <div className="space-y-1">
          {lines.map((line, i) => (
            <div key={i} className={`${line.color || 'text-green-400'} ${line.done ? 'opacity-100' : 'opacity-70'}`}>
              {line.text}
              {i === currentLineIdx - 1 && !line.done && showCursor && (
                <span className="text-green-400 animate-pulse">▊</span>
              )}
            </div>
          ))}
          {currentLine && currentLine.text && (
            <div className={currentLine.color || 'text-green-400'}>
              {currentLine.text.slice(0, currentChar)}
              {showCursor && <span className="text-green-400 animate-pulse">▊</span>}
            </div>
          )}

          {/* Cursor at the end when boot is complete */}
          {bootPhase === 'ready' && (
            <div className="text-green-400 animate-pulse">
              <span className="text-green-500">_</span>
              <span className="text-zinc-600 ml-1 text-[10px]">System ready — awaiting input...</span>
            </div>
          )}
        </div>
      </div>

      {/* Hero heading — fades in after boot completes */}
      <div className={`transition-all duration-1000 mt-10 text-center ${
        bootPhase === 'done' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6 pointer-events-none'
      }`}>
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/50 mb-6 shadow-[0_0_60px_rgba(34,197,94,0.3)]">
          <Skull className="text-green-400 drop-shadow-[0_0_15px_rgba(34,197,94,0.8)] w-10 h-10" />
        </div>
        <h1
          className="text-5xl sm:text-7xl md:text-8xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-green-300 via-green-500 to-emerald-700 uppercase drop-shadow-[0_0_40px_rgba(34,197,94,0.4)] mb-6"
        >
          Dept.OS
        </h1>
        <p className="text-lg sm:text-xl text-zinc-400 leading-relaxed max-w-2xl mx-auto font-medium mb-3">
          Dominate the university underground. Factions, territory, influence.
        </p>
        <p className="text-sm text-zinc-600 max-w-xl mx-auto">
          A cyberpunk campus warfare game. Build your reputation, control territory, and rise through the ranks.
        </p>
      </div>
    </div>
  );
}
