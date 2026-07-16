"use client";

"use client";

import { useState, useRef } from 'react';
import { ChevronRight } from 'lucide-react';

const FAQS = [
  {
    q: 'What is Dept.OS?',
    a: 'Dept.OS (Campus Mafia) is a real-time cyberpunk social and gaming platform. Join factions, earn Influence (INF), capture territories, raid enemies, and climb the ranks — all through an immersive encrypted interface.',
  },
  {
    q: 'How do I earn Influence (INF)?',
    a: 'You earn INF by broadcasting intel (+10 per post), commenting on posts (+2 to post owner), boosting posts (+1 per boost), capturing territories, winning raid battles, collecting bounties, and using Black Market items like Propaganda Boosts (doubles INF per broadcast).',
  },
  {
    q: 'How do factions work?',
    a: 'There are 5 pre-built factions: The Ravens, The Cartel, Ghost Protocol, The Syndicate, and 404. You can join one immediately after signing up, or create your own for 500 INF. Factions have a role hierarchy (Head → Vice Head → Executive → Member) and private encrypted comms channels.',
  },
  {
    q: 'What are territories and how do I capture them?',
    a: 'The campus is divided into 12 territories (Library Mainframe, Science Lab, The Quad, etc.). Each has a defense score. Attack by spending INF — reduce defense to 0 to capture it for your faction. Use Firewall Upgrades to boost defense, or Cyber Nukes to deal instant damage.',
  },
  {
    q: 'How do raids work?',
    a: 'Plan a raid on any enemy territory. There\'s a 30-minute planning window where faction members can commit INF to the raid pool. When the timer expires, all committed INF strikes as one massive attack. If it reduces defense to 0, the territory is captured.',
  },
  {
    q: 'What is the Black Market?',
    a: 'The Black Market sells tactical assets: Cyber Nukes (500 INF — deals 50 instant damage), DDoS attacks (300 INF — locks a faction for 1 hour), Firewall Upgrades (400 INF — +50 defense), Propaganda Boosts (250 INF — double INF earnings), and INF Cap Bypasses (200 INF — remove daily earning limits).',
  },
  {
    q: 'Is there a leaderboard?',
    a: 'Yes! There are three leaderboards: Top Players by total INF, Top Factions by combined INF and territory count, and Top Raiders by INF committed to raids. Rankings update in real-time.',
  },
  {
    q: 'Can I chat with other players?',
    a: 'Absolutely. There are multiple communication channels: Global chat (all operatives), Faction chat (private to your syndicate), Direct Messages (encrypted 1-on-1 with reactions and reply threading), and P2P Local Chat (WebRTC-based peer-to-peer for nearby operatives).',
  },
  {
    q: 'Is there a mobile app?',
    a: 'Dept.OS is a Progressive Web App (PWA). Visit the site on your phone, add it to your home screen, and it works like a native app — including push notifications and offline support.',
  },
  {
    q: 'Is it free?',
    a: 'Yes, Dept.OS is completely free to play. There are no microtransactions, no pay-to-win mechanics. Everything is earned through gameplay.',
  },
];

export default function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);

  const toggle = (idx: number) => {
    setOpenIdx(prev => prev === idx ? null : idx);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-sm font-bold text-green-500 uppercase tracking-widest mb-2">// Common Queries</h2>
        <p className="text-xs text-zinc-600">Everything you need to know about the Campus Underground</p>
      </div>

      <div className="space-y-2">
        {FAQS.map((faq, i) => {
          const isOpen = openIdx === i;
          return (
            <div
              key={i}
              className={`border ${isOpen ? 'border-green-500/30 bg-green-500/5' : 'border-zinc-800 bg-black/30'} rounded-lg overflow-hidden transition-all duration-300`}
            >
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left gap-3"
              >
                <span className={`text-xs sm:text-sm font-bold transition-colors ${isOpen ? 'text-green-400' : 'text-zinc-300 hover:text-zinc-100'}`}>
                  {faq.q}
                </span>
                <ChevronRight
                  size={16}
                  className={`shrink-0 transition-transform duration-300 ${
                    isOpen ? 'rotate-90 text-green-500' : 'text-zinc-600'
                  }`}
                />
              </button>
              <div
                ref={el => { contentRefs.current[i] = el; }}
                className="overflow-hidden transition-all duration-300"
                style={{
                  maxHeight: isOpen ? contentRefs.current[i]?.scrollHeight ?? 200 : 0,
                  opacity: isOpen ? 1 : 0,
                }}
              >
                <div className="px-5 pb-4">
                  <p className="text-xs text-zinc-500 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
