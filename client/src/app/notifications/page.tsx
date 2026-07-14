"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { Bell, Check, Clock } from 'lucide-react';
import { useEffect } from 'react';

type Notification = {
  id: string;
  content: string;
  is_read: boolean;
  created_at: string;
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiFetch('/api/notifications');
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
    staleTime: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      await apiFetch('/api/notifications', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  useEffect(() => {
    if (notifications && notifications.some(n => !n.is_read)) {
      markReadMutation.mutate();
    }
  }, [notifications, markReadMutation]);

  return (
    <DashboardLayout>
      <header className="h-14 border-b border-green-500/20 flex items-center px-6 bg-black/40 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-green-500 uppercase tracking-widest flex items-center gap-2">
          <Bell size={16} /> System Alerts
        </h2>
      </header>
      
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="mb-6 border-b border-zinc-800 pb-4">
            <h1 className="text-2xl font-bold text-zinc-100">Notifications</h1>
            <p className="text-sm text-zinc-500 mt-1">Intercepted mentions and system alerts.</p>
          </div>

          {isLoading ? (
            <div className="text-center text-zinc-500 text-sm py-10 animate-pulse">Decrypting alerts...</div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="text-center text-zinc-500 text-sm py-10">No alerts in your queue.</div>
          ) : (
            <div className="space-y-3">
              {notifications.map(n => (
                <div 
                  key={n.id} 
                  className={`p-4 border rounded flex items-start gap-4 transition-colors ${
                    n.is_read 
                      ? 'border-zinc-800 bg-black/40 text-zinc-400' 
                      : 'border-green-500/30 bg-green-500/5 text-zinc-100'
                  }`}
                >
                  <div className="mt-0.5">
                    {n.is_read ? <Check size={16} className="text-zinc-600" /> : <Bell size={16} className="text-green-500" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">{n.content}</p>
                    <div className="flex items-center gap-1 mt-2 text-xs text-zinc-500">
                      <Clock size={12} />
                      <span>{n.created_at ? new Date(n.created_at).toLocaleString() : 'Unknown Time'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
