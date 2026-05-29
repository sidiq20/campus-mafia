"use client";

import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/api';

export type UserProfile = {
  id: string;
  username: string;
  email: string;
  faction_id: string | null;
  faction_name: string | null;
  influence: number;
  reputation: number;
  heat_level: number;
};

type UserContextType = {
  user: UserProfile | null;
  isLoading: boolean;
};

const UserContext = createContext<UserContextType>({
  user: null,
  isLoading: true,
});

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: user, isLoading } = useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        credentials: 'true' === 'true' ? 'include' : 'same-origin',
      });
      if (!res.ok) {
        throw new Error('Not authenticated');
      }
      return res.json();
    },
    retry: false, // Don't retry if unauthenticated
  });

  return (
    <UserContext.Provider value={{ user: user || null, isLoading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
