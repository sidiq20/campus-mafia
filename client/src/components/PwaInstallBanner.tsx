"use client";

import { useState, useEffect } from 'react';
import { Download, X, Smartphone, Monitor, Apple } from 'lucide-react';

type DeviceType = 'ios' | 'android' | 'desktop';

function detectDevice(): DeviceType {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

const instructions: Record<DeviceType, { icon: React.ReactNode; title: string; steps: string[] }> = {
  ios: {
    icon: <Apple size={20} className="text-zinc-300" />,
    title: 'Install on iOS',
    steps: [
      'Tap the Share button (box with arrow) in Safari',
      'Scroll down and tap "Add to Home Screen"',
      'Tap "Add" to confirm',
    ],
  },
  android: {
    icon: <Smartphone size={20} className="text-green-500" />,
    title: 'Install on Android',
    steps: [
      'Tap the three-dot menu (⋮) in Chrome',
      'Tap "Add to Home screen" or "Install app"',
      'Tap "Install" to confirm',
    ],
  },
  desktop: {
    icon: <Monitor size={20} className="text-green-500" />,
    title: 'Install on Desktop',
    steps: [
      'Click the install icon (⊕) in your browser\'s address bar',
      'Or open browser menu → "Install DepartmentOS..."',
      'Click "Install" to confirm',
    ],
  },
};

export default function PwaInstallBanner() {
  const [dismissed, setDismissed] = useState(true); // start hidden until we check
  const [device, setDevice] = useState<DeviceType>('desktop');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed or if running as installed PWA
    const wasDismissed = localStorage.getItem('pwa-install-dismissed');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (!wasDismissed && !isStandalone) {
      setDismissed(false);
    }
    setDevice(detectDevice());
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  if (dismissed) return null;

  const info = instructions[device];

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-md">
      <div className="border border-green-500/40 bg-black/95 backdrop-blur-md rounded-lg shadow-[0_0_30px_rgba(34,197,94,0.15)] overflow-hidden">
        {/* Collapsed Banner */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center justify-center">
              <Download size={20} className="text-green-500" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-200">Install DepartmentOS</h4>
              <p className="text-xs text-zinc-500">Use as a native app on your device</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="px-3 py-1.5 bg-green-500 text-black text-xs font-bold rounded hover:bg-green-400 transition-colors"
            >
              {expanded ? 'Hide' : 'How?'}
            </button>
            <button onClick={handleDismiss} className="text-zinc-600 hover:text-zinc-400 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Expanded Instructions */}
        {expanded && (
          <div className="px-4 pb-4 border-t border-zinc-800 pt-4">
            <div className="flex items-center gap-2 mb-3">
              {info.icon}
              <h5 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">{info.title}</h5>
            </div>
            <ol className="space-y-2">
              {info.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                  <span className="text-green-500 font-bold min-w-[16px]">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
