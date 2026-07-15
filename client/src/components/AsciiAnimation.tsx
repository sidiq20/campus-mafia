"use client";

import { useEffect, useState } from 'react';

// ─── ASCII art frames for the scanning radar ───

const ROWS = 9;
const COLS = 21;

// Generate a scanning radar animation using arrays
// Frame 0: scan line at top
// Frame 1: scan line slightly down
// ...etc cycling through

function generateScanFrame(scanPos: number): string[] {
  const grid: string[][] = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = ' ';
    }
  }

  // Border
  const borderChars = ['┌', '─', '┐', '│', '└', '┘'];
  grid[0][0] = borderChars[0];
  grid[0][COLS - 1] = borderChars[2];
  grid[ROWS - 1][0] = borderChars[4];
  grid[ROWS - 1][COLS - 1] = borderChars[5];
  for (let c = 1; c < COLS - 1; c++) {
    grid[0][c] = borderChars[1];
    grid[ROWS - 1][c] = borderChars[1];
  }
  for (let r = 1; r < ROWS - 1; r++) {
    grid[r][0] = borderChars[3];
    grid[r][COLS - 1] = borderChars[3];
  }

  // Radar crosshair center
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);

  // Crosshair
  grid[cy][cx] = '⊕';
  for (let r = 1; r < ROWS - 1; r++) {
    if (r !== cy) grid[r][cx] = '│';
  }
  for (let c = 1; c < COLS - 1; c++) {
    if (c !== cx) grid[cy][c] = '─';
  }

  // Scanning line (sweeps top to bottom, wraps)
  const lineRow = 1 + (scanPos % (ROWS - 2));
  if (lineRow >= 1 && lineRow < ROWS - 1) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[lineRow][c] === ' ') {
        grid[lineRow][c] = '▒';
      }
    }
    // Scan arrow
    grid[lineRow][COLS - 2] = '>';
  }

  // Blips (random dots that appear on the radar)
  const blips = [
    { r: 2, c: 3 }, { r: 3, c: 15 }, { r: 5, c: 5 }, 
    { r: 6, c: 12 }, { r: 4, c: 8 }, { r: 7, c: 17 },
  ];
  // Only show blips that are near the scan line
  blips.forEach((blip, i) => {
    const dist = Math.abs(blip.r - lineRow);
    if (dist <= 2 && blip.r >= 1 && blip.r < ROWS - 1 && blip.c >= 1 && blip.c < COLS - 1) {
      if (grid[blip.r][blip.c] === ' ' || grid[blip.r][blip.c] === '▒') {
        grid[blip.r][blip.c] = '●';
      }
    }
  });

  return grid.map(row => row.join(''));
}

// ─── ASCII Skull frames (for fun) ───
const SKULL_FRAMES = [
  [
    '   ╱╲      ',
    '  │OO│     ',
    '  │  │     ',
    '  │██│     ',
    '  ⎝  ⎠     ',
    '  ╱  ╲     ',
  ],
  [
    '   ╱╲      ',
    '  │◉◉│     ',
    '  │  │     ',
    '  │██│     ',
    '  ⎝  ⎠     ',
    '  ╱  ╲     ',
  ],
  [
    '   ╱╲      ',
    '  │××│     ',
    '  │  │     ',
    '  │  │     ',
    '  ⎝  ⎠     ',
    '  ╱  ╲     ',
  ],
  [
    '   ╱╲      ',
    '  │◉◉│     ',
    '  │  │     ',
    '  │  │     ',
    '  ⎝  ⎠     ',
    '  ╱  ╲     ',
  ],
];

// ─── Nuke explosion frames ───
const NUKE_FRAMES = [
  [
    '         ',
    '    •    ',
    '   •••   ',
    '    •    ',
    '         ',
  ],
  [
    '         ',
    '   ╱╲   ',
    '  ╱██╲  ',
    '   ╲╱   ',
    '         ',
  ],
  [
    '         ',
    '  ╱═══╲ ',
    ' ╱█████╲',
    '  ╲═══╱ ',
    '         ',
  ],
  [
    '    ╱╲    ',
    '  ╱████╲  ',
    ' ╱██████╲ ',
    '  ╲████╱  ',
    '    ╲╱    ',
  ],
  [
    '   ╱══╲   ',
    '  ╱████╲  ',
    ' ╱██████╲ ',
    '  ╲████╱  ',
    '   ╲══╱   ',
  ],
  [
    '  ╱════╲  ',
    ' ╱██████╲ ',
    '╱████████╲',
    ' ╲██████╱ ',
    '  ╲════╱  ',
  ],
  [
    ' ╱══════╲ ',
    '╱████████╲',
    '██████████',
    '╲████████╱',
    ' ╲══════╱ ',
  ],
  [
    '╱════════╲',
    '██████████',
    '██████████',
    '██████████',
    '╲════════╱',
  ],
  [
    '          ',
    '  ╱══╲   ',
    ' ╱████╲  ',
    '  ╲══╱   ',
    '    ●    ',
  ],
  [
    '          ',
    '   ╱╲    ',
    '  ╱██╲   ',
    '   ╲╱    ',
    '    ●    ',
  ],
  [
    '          ',
    '    •     ',
    '   •••    ',
    '    •     ',
    '          ',
  ],
];

// ─── Component ───

type AsciiVariant = 'radar' | 'skull' | 'nuke';

interface AsciiAnimationProps {
  variant?: AsciiVariant;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function AsciiAnimation({ 
  variant = 'radar', 
  className = '',
  size = 'md'
}: AsciiAnimationProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(prev => prev + 1);
    }, 180);
    return () => clearInterval(interval);
  }, []);

  const sizeClasses = {
    sm: 'scale-[0.6] origin-center',
    md: 'scale-100 origin-center',
    lg: 'scale-[1.3] origin-center',
  };

  if (variant === 'skull') {
    const idx = frame % SKULL_FRAMES.length;
    return (
      <pre className={`font-mono leading-tight text-green-500/60 select-none ${sizeClasses[size]} ${className}`}>
        {SKULL_FRAMES[idx].map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </pre>
    );
  }

  if (variant === 'nuke') {
    const idx = frame % NUKE_FRAMES.length;
    const colors = ['text-yellow-500/60', 'text-orange-400/70', 'text-red-500/80', 'text-orange-500/90', 'text-yellow-500/80', 'text-orange-400/70', 'text-red-500/80', 'text-orange-500/90', 'text-yellow-500/70', 'text-orange-400/60', 'text-yellow-500/50'];
    return (
      <pre className={`font-mono leading-tight ${colors[idx] || 'text-orange-500/70'} select-none ${sizeClasses[size]} ${className}`}>
        {NUKE_FRAMES[idx].map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </pre>
    );
  }

  // Radar variant
  const scanPos = frame % 20; // 20 frames then repeat
  const lines = generateScanFrame(scanPos);

  return (
    <div className={`inline-block ${sizeClasses[size]} ${className}`}>
      <pre className="font-mono leading-[1.15] text-green-500/70 select-none">
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre">{line}</div>
        ))}
      </pre>
    </div>
  );
}
