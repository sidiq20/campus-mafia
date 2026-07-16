"use client";

import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';

type ThemeVars = Record<string, string>;

interface Theme {
  name: string;
  color: string;
  key: string;
  vars: ThemeVars;
}

const THEMES: Theme[] = [
  {
    name: 'Hacker Green',
    color: '#22c55e',
    key: 'green',
    vars: {
      '--primary': '#22c55e',
      '--ring': '#22c55e',
      '--border': 'rgba(34, 197, 94, 0.2)',
      '--foreground': '#22c55e',
      '--card-foreground': '#22c55e',
      '--secondary-foreground': '#22c55e',
      '--muted-foreground': '#15803d',
      '--primary-foreground': '#000000',
    },
  },
  {
    name: 'Cyber Red',
    color: '#ef4444',
    key: 'red',
    vars: {
      '--primary': '#ef4444',
      '--ring': '#ef4444',
      '--border': 'rgba(239, 68, 68, 0.2)',
      '--foreground': '#ef4444',
      '--card-foreground': '#ef4444',
      '--secondary-foreground': '#ef4444',
      '--muted-foreground': '#991b1b',
      '--primary-foreground': '#000000',
    },
  },
  {
    name: 'Neon Purple',
    color: '#a855f7',
    key: 'purple',
    vars: {
      '--primary': '#a855f7',
      '--ring': '#a855f7',
      '--border': 'rgba(168, 85, 247, 0.2)',
      '--foreground': '#a855f7',
      '--card-foreground': '#a855f7',
      '--secondary-foreground': '#a855f7',
      '--muted-foreground': '#7e22ce',
      '--primary-foreground': '#000000',
    },
  },
  {
    name: 'Electric Blue',
    color: '#3b82f6',
    key: 'blue',
    vars: {
      '--primary': '#3b82f6',
      '--ring': '#3b82f6',
      '--border': 'rgba(59, 130, 246, 0.2)',
      '--foreground': '#3b82f6',
      '--card-foreground': '#3b82f6',
      '--secondary-foreground': '#3b82f6',
      '--muted-foreground': '#1d4ed8',
      '--primary-foreground': '#000000',
    },
  },
  {
    name: 'Toxic Cyan',
    color: '#06b6d4',
    key: 'cyan',
    vars: {
      '--primary': '#06b6d4',
      '--ring': '#06b6d4',
      '--border': 'rgba(6, 182, 212, 0.2)',
      '--foreground': '#06b6d4',
      '--card-foreground': '#06b6d4',
      '--secondary-foreground': '#06b6d4',
      '--muted-foreground': '#0e7490',
      '--primary-foreground': '#000000',
    },
  },
  {
    name: 'Amber',
    color: '#f59e0b',
    key: 'amber',
    vars: {
      '--primary': '#f59e0b',
      '--ring': '#f59e0b',
      '--border': 'rgba(245, 158, 11, 0.2)',
      '--foreground': '#f59e0b',
      '--card-foreground': '#f59e0b',
      '--secondary-foreground': '#f59e0b',
      '--muted-foreground': '#b45309',
      '--primary-foreground': '#000000',
    },
  },
];

function applyTheme(themeKey: string) {
  const theme = THEMES.find(t => t.key === themeKey);
  if (!theme) return;

  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value);
  }
  localStorage.setItem('accent-theme', themeKey);
}

export default function AccentThemePicker() {
  const [open, setOpen] = useState(false);
  const [accent, setAccent] = useState('green');

  // Load saved theme on mount and apply immediately
  useEffect(() => {
    const saved = localStorage.getItem('accent-theme');
    const initial = saved && THEMES.some(t => t.key === saved) ? saved : 'green';
    setAccent(initial);
    applyTheme(initial);
  }, []);

  // Apply theme whenever accent changes
  useEffect(() => {
    applyTheme(accent);
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
