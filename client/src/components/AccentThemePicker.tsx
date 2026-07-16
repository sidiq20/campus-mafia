"use client";

import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';

interface Theme {
  name: string;
  color: string;
  key: string;
  // Overrides for Tailwind v4's --color-green-* palette variables
  vars: Record<string, string>;
}

const THEMES: Theme[] = [
  {
    name: 'Hacker Green',
    color: '#22c55e',
    key: 'green',
    vars: {
      '--color-green-50': '#f0fdf4',
      '--color-green-100': '#dcfce7',
      '--color-green-200': '#bbf7d0',
      '--color-green-300': '#86efac',
      '--color-green-400': '#4ade80',
      '--color-green-500': '#22c55e',
      '--color-green-600': '#16a34a',
      '--color-green-700': '#15803d',
      '--color-green-800': '#166534',
      '--color-green-900': '#14532d',
      '--color-green-950': '#052e16',
    },
  },
  {
    name: 'Cyber Red',
    color: '#ef4444',
    key: 'red',
    vars: {
      '--color-green-50': '#fef2f2',
      '--color-green-100': '#fee2e2',
      '--color-green-200': '#fecaca',
      '--color-green-300': '#fca5a5',
      '--color-green-400': '#f87171',
      '--color-green-500': '#ef4444',
      '--color-green-600': '#dc2626',
      '--color-green-700': '#b91c1c',
      '--color-green-800': '#991b1b',
      '--color-green-900': '#7f1d1d',
      '--color-green-950': '#450a0a',
    },
  },
  {
    name: 'Neon Purple',
    color: '#a855f7',
    key: 'purple',
    vars: {
      '--color-green-50': '#faf5ff',
      '--color-green-100': '#f3e8ff',
      '--color-green-200': '#e9d5ff',
      '--color-green-300': '#d8b4fe',
      '--color-green-400': '#c084fc',
      '--color-green-500': '#a855f7',
      '--color-green-600': '#9333ea',
      '--color-green-700': '#7e22ce',
      '--color-green-800': '#6b21a8',
      '--color-green-900': '#581c87',
      '--color-green-950': '#3b0764',
    },
  },
  {
    name: 'Electric Blue',
    color: '#3b82f6',
    key: 'blue',
    vars: {
      '--color-green-50': '#eff6ff',
      '--color-green-100': '#dbeafe',
      '--color-green-200': '#bfdbfe',
      '--color-green-300': '#93c5fd',
      '--color-green-400': '#60a5fa',
      '--color-green-500': '#3b82f6',
      '--color-green-600': '#2563eb',
      '--color-green-700': '#1d4ed8',
      '--color-green-800': '#1e40af',
      '--color-green-900': '#1e3a8a',
      '--color-green-950': '#172554',
    },
  },
  {
    name: 'Toxic Cyan',
    color: '#06b6d4',
    key: 'cyan',
    vars: {
      '--color-green-50': '#ecfeff',
      '--color-green-100': '#cffafe',
      '--color-green-200': '#a5f3fc',
      '--color-green-300': '#67e8f9',
      '--color-green-400': '#22d3ee',
      '--color-green-500': '#06b6d4',
      '--color-green-600': '#0891b2',
      '--color-green-700': '#0e7490',
      '--color-green-800': '#155e75',
      '--color-green-900': '#164e63',
      '--color-green-950': '#083344',
    },
  },
  {
    name: 'Amber',
    color: '#f59e0b',
    key: 'amber',
    vars: {
      '--color-green-50': '#fffbeb',
      '--color-green-100': '#fef3c7',
      '--color-green-200': '#fde68a',
      '--color-green-300': '#fcd34d',
      '--color-green-400': '#fbbf24',
      '--color-green-500': '#f59e0b',
      '--color-green-600': '#d97706',
      '--color-green-700': '#b45309',
      '--color-green-800': '#92400e',
      '--color-green-900': '#78350f',
      '--color-green-950': '#451a03',
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
