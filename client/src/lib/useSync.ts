"use client";

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';

type SyncResponse = {
  notifications: Array<{
    id: string;
    content: string;
    is_read: boolean;
    created_at: string;
  }>;
  unread_dms: number;
  unread_chats: number;
  server_time: string;
};

/**
 * Multi-device sync hook.
 * Polls GET /api/sync?since=<timestamp> every 30 seconds and automatically
 * updates React Query caches with the latest data across all devices.
 */
export function useSync(enabled: boolean = true) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const lastSyncRef = useRef<string>(new Date().toISOString());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || !user) return;

    const sync = async () => {
      try {
        const since = lastSyncRef.current;
        const res = await apiFetch(`/api/sync?since=${encodeURIComponent(since)}`);
        if (!res.ok) return;

        const data: SyncResponse = await res.json();
        lastSyncRef.current = data.server_time;

        // Update notifications cache if new ones arrived
        if (data.notifications.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['notifications-latest'] });
        }

        // Update DM unread count
        if (data.unread_dms > 0) {
          queryClient.setQueryData(['dm-unread'], { unread: data.unread_dms });
        }
      } catch {
        // Silently ignore sync errors — will retry on next interval
      }
    };

    // Sync immediately on mount
    sync();

    // Then sync every 30 seconds
    intervalRef.current = setInterval(sync, 30_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, user?.id, queryClient]);
}
