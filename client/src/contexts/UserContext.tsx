"use client";

import React, { createContext, useContext } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type RankInfo = {
  level: number;
  tier: string;
  name: string;
  min_influence: number;
  next_min_influence: number | null;
  progress: number;
};

export type UserProfile = {
  id: string;
  display_name: string;
  username: string;
  email: string;
  faction_id: string | null;
  faction_name: string | null;
  influence: number;
  reputation: number;
  heat_level: number;
  rank: RankInfo;
  faction_role: string;
  created_at: string;
};

type UserContextType = {
  user: UserProfile | null;
  isLoading: boolean;
  refetch: UseQueryResult['refetch'];
};

const UserContext = createContext<UserContextType>({
  user: null,
  isLoading: true,
  refetch: async () => ({ data: undefined } as any),
});

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: user, isLoading, refetch } = useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await apiFetch('/api/auth/me');
      if (!res.ok) {
        throw new Error('Not authenticated');
      }
      return res.json();
    },
    retry: false,
  });

  return (
    <UserContext.Provider value={{ user: user || null, isLoading, refetch }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
