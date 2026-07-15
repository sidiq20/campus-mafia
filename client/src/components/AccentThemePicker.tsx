"use client";

import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';

const THEMES = [
  { name: 'Hacker Green', color: '#22c55e', css: '160, 200, 80', key: 'green' },
  { name: 'Cyber Red', color: '#ef4444', css: '239, 68, 68', key: 'red' },
  { name: 'Neon Purple', color: '#a855f7', css: '168, 85, 247', key: 'purple' },
  { name: 'Electric Blue', color: '#3b82f6', css: '59, 130, 246', key: 'blue' },
  { name: 'Toxic Cyan', color: '#06b6d4', css: '6, 182, 212', key: 'cyan' },
  { name: 'Amber', color: '#f59e0b', css: '245, 158, 11', key: 'amber' },
];

export default function AccentThemePicker() {
  const [open, setOpen] = useState(false);
  const [accent, setAccent] = useState('green');

  useEffect(() => {
    const saved = localStorage.getItem('accent-theme');
    if (saved && THEMES.some(t => t.key === saved)) {
      setAccent(saved);
    }
  }, []);

  useEffect(() => {
    const theme = THEMES.find(t => t.key === accent);
    if (theme) {
      document.documentElement.style.setProperty('--accent-color', theme.color);
      document.documentElement.style.setProperty('--accent-rgb', theme.css);
      localStorage.setItem('accent-theme', accent);
    }
  }, [accent]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[9px] text-zinc-600 hover:text-zinc-400 uppercase tracking-widest font-bold transition-colors"
        title="Theme"
      >
        <Palette size={12} />
        <span className="hidden sm:inline">Theme</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 bg-zinc-950 border border-zinc-800 rounded-lg p-3 shadow-xl z-50 min-w-[180px]">
          <p className="text-[8px] text-zinc-600 uppercase tracking-widest mb-2 font-bold">Accent Color</p>
          <div className="flex flex-wrap gap-2">
            {THEMES.map(t => (
              <button
                key={t.key}
                onClick={() => { setAccent(t.key); setOpen(false); }}
                className={`w-7 h-7 rounded-lg border-2 transition-all ${
                  accent === t.key ? 'border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-transparent hover:scale-110'
                }`}
                style={{ backgroundColor: t.color }}
                title={t.name}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[8px] text-zinc-600">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: THEMES.find(t => t.key === accent)?.color }} />
            {THEMES.find(t => t.key === accent)?.name}
          </div>
        </div>
      )}
    </div>
  );
}
