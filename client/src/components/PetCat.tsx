"use client";

import { useState, useEffect, useRef, useCallback } from 'react';

const CAT_ASCII = [
  "  /\\_/\\  ",
  " ( o.o ) ",
  "  > ^ <  ",
];

const CAT_SLEEP = [
  "  /\\_/\\  ",
  " ( - . - )  ",
  "  > ~ <  ",
];

const CAT_HAPPY = [
  "  /\\_/\\  ",
  " ( ^.^ ) ",
  "  > ^ <  ",
];

const CAT_WAVE = [
  "  /\\_/\\  ",
  " ( ^_^)/ ",
  "  > ^ <  ",
];

type Mood = 'idle' | 'sleep' | 'happy' | 'wave';

const MOOD_TICK = 8000; // change mood every 8s

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;

export default function PetCat({ recentActivity }: { recentActivity: string[] }) {
  const [name, setName] = useState(() => {
    if (typeof window === 'undefined') return 'Byte';
    return localStorage.getItem('petcat-name') || 'Byte';
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [scale, setScale] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const saved = localStorage.getItem('petcat-scale');
    if (saved) {
      try { return parseFloat(saved) || 1; } catch {}
    }
    return 1;
  });
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 20, y: 20 };
    const saved = localStorage.getItem('petcat-pos');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return { x: 20, y: 20 };
  });
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [mood, setMood] = useState<Mood>('idle');
  const [bubbles, setBubbles] = useState<{ id: number; text: string }[]>([]);
  const bubbleIdRef = useRef(0);
  const moodTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mood cycling
  useEffect(() => {
    moodTimerRef.current = setInterval(() => {
      const moods: Mood[] = ['idle', 'sleep', 'happy', 'wave'];
      setMood(moods[Math.floor(Math.random() * moods.length)]);
      // Reset back to idle after a bit
      setTimeout(() => setMood('idle'), 2500);
    }, MOOD_TICK);
    return () => {
      if (moodTimerRef.current) clearInterval(moodTimerRef.current);
    };
  }, []);

  // Show activity bubbles
  useEffect(() => {
    if (recentActivity.length === 0) return;
    const latest = recentActivity[0];
    if (!latest) return;
    const id = ++bubbleIdRef.current;
    setBubbles(prev => [...prev.slice(-4), { id, text: latest }]);
    setMood('happy');
    setTimeout(() => setMood('idle'), 2500);
    // Auto-remove bubbles after 6s
    setTimeout(() => {
      setBubbles(prev => prev.filter(b => b.id !== id));
    }, 6000);
  }, [recentActivity]);

  const saveName = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed) {
      setName(trimmed);
      localStorage.setItem('petcat-name', trimmed);
    }
    setIsEditing(false);
  }, [editName]);

  // Mouse handlers for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({ x: e.clientX - rect.left, y: rect.bottom - e.clientY });
    }
    setDragging(true);
    setMood('wave');
  }, []);

  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      // Invert Y: mouse down = decrease bottom (move cat down visually)
      const catHeight = 120 * scale;
      const newX = Math.min(Math.max(0, e.clientX - dragOffset.x), window.innerWidth - 120 * scale);
      const newBottom = Math.min(Math.max(0, window.innerHeight - e.clientY - dragOffset.y), window.innerHeight - catHeight);
      setPos({ x: newX, y: newBottom });
    };
    const handleMouseUp = () => {
      setDragging(false);
      localStorage.setItem('petcat-pos', JSON.stringify(posRef.current));
      setTimeout(() => setMood('idle'), 1000);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, dragOffset]); // Intentionally omit `pos` — posRef handles persistence

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault(); // prevent page scroll while dragging cat
    const touch = e.touches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && touch) {
      setDragOffset({ x: touch.clientX - rect.left, y: rect.bottom - touch.clientY });
    }
    setDragging(true);
    setMood('wave');
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      // Invert Y: touch down = decrease bottom (move cat down visually)
      const catHeight = 120 * scale;
      const newX = Math.min(Math.max(0, touch.clientX - dragOffset.x), window.innerWidth - 120 * scale);
      const newBottom = Math.min(Math.max(0, window.innerHeight - touch.clientY - dragOffset.y), window.innerHeight - catHeight);
      setPos({ x: newX, y: newBottom });
    };
    const handleTouchEnd = () => {
      setDragging(false);
      localStorage.setItem('petcat-pos', JSON.stringify(posRef.current));
      setTimeout(() => setMood('idle'), 1000);
    };
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [dragging, dragOffset]); // Intentionally omit `pos` — posRef handles persistence

  const changeScale = (delta: number) => {
    setScale(prev => {
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta));
      localStorage.setItem('petcat-scale', String(newScale));
      return newScale;
    });
  };

  const currentArt = mood === 'sleep' ? CAT_SLEEP : (mood === 'happy' ? CAT_HAPPY : (mood === 'wave' ? CAT_WAVE : CAT_ASCII));

  const catWidth = 90 * scale;
  const catHeight = 120 * scale;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 select-none"
      style={{
        left: pos.x,
        bottom: pos.y,
        cursor: dragging ? 'grabbing' : 'grab',
        transition: dragging ? 'none' : 'left 0.2s ease, bottom 0.2s ease',
      }}
    >
      {/* Activity Bubbles */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col items-center gap-1 pointer-events-none">
        {bubbles.map(b => (
          <div
            key={b.id}
            className="bg-green-900/80 border border-green-500/40 text-green-300 text-[8px] px-2 py-1 rounded-lg whitespace-nowrap animate-fade-in shadow-lg backdrop-blur-sm"
          >
            {b.text}
          </div>
        ))}
      </div>

      {/* Cat Body */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onWheel={e => { e.preventDefault(); changeScale(e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP); }}
        className="bg-black/70 border border-green-500/30 rounded-lg p-1.5 backdrop-blur-sm hover:border-green-500/60 transition-colors group shadow-lg"
        style={{ transform: `scale(${scale})`, transformOrigin: 'bottom left' }}
      >
        <pre className="text-[8px] leading-tight text-green-400 font-bold tracking-wide select-none">
          {currentArt.join('\n')}
        </pre>

        {/* Name Tag */}
        <div className="text-center mt-0.5">
          {isEditing ? (
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); }}
              className="w-16 bg-black border border-green-500/50 text-green-400 text-[8px] text-center rounded outline-none px-1"
              maxLength={12}
            />
          ) : (
            <button
              onClick={() => { setEditName(name); setIsEditing(true); }}
              className="text-[8px] text-green-500/60 hover:text-green-400 transition-colors uppercase tracking-widest font-bold"
            >
              {name} ▸
            </button>
          )}
        </div>

        {/* Resize Controls */}
        <div className="flex justify-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); changeScale(-SCALE_STEP); }}
            className="text-[9px] text-green-500/50 hover:text-green-400 bg-black/50 px-1.5 py-0.5 rounded border border-green-500/20 hover:border-green-500/50 transition-colors"
            title="Shrink"
          >
            −
          </button>
          <span className="text-[8px] text-green-500/40 self-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={(e) => { e.stopPropagation(); changeScale(SCALE_STEP); }}
            className="text-[9px] text-green-500/50 hover:text-green-400 bg-black/50 px-1.5 py-0.5 rounded border border-green-500/20 hover:border-green-500/50 transition-colors"
            title="Enlarge"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
