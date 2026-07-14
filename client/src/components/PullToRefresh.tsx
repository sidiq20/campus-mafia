'use client';

import { useState, useRef, useCallback, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown> | void;
  children: ReactNode;
  className?: string;
  pullThreshold?: number;
}

export const PullToRefresh = forwardRef<HTMLDivElement, PullToRefreshProps>(function PullToRefresh(
  { onRefresh, children, className = '', pullThreshold = 80 },
  ref,
) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  // Expose containerRef to parent via forwardRef
  useImperativeHandle(ref, () => containerRef.current!);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop <= 0) {
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pullingRef.current || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    if (diff <= 0) {
      setPullDistance(0);
      return;
    }

    const damped = Math.min(diff * 0.5, 150);
    setPullDistance(damped);
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;

    if (pullDistance >= pullThreshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(pullThreshold);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, pullThreshold, isRefreshing, onRefresh]);

  const showIndicator = pullDistance > 0 || isRefreshing;
  const progress = Math.min(pullDistance / pullThreshold, 1);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-y-auto overflow-x-hidden ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center transition-all duration-200 z-10 pointer-events-none"
        style={{
          top: showIndicator ? 0 : -60,
          height: showIndicator ? Math.max(pullDistance, 0) : 0,
          opacity: showIndicator ? Math.min(progress * 1.5, 1) : 0,
        }}
      >
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-green-400">
          {isRefreshing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Decrypting fresh intel...</span>
            </>
          ) : pullDistance >= pullThreshold ? (
            <span className="text-green-400">Release to refresh</span>
          ) : (
            <span className="text-zinc-500" style={{ opacity: progress }}>
              Pull to refresh
            </span>
          )}
        </div>
      </div>

      {/* Content with pull transform */}
      <div
        style={{
          transform: `translateY(${isRefreshing ? 40 : pullDistance}px)`,
          transition: pullingRef.current ? 'none' : 'transform 0.3s ease',
        }}
      >
        {children}
      </div>
    </div>
  );
});
