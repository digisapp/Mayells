'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { User } from '@/db/schema/users';

interface AuthState {
  supabaseUser: SupabaseUser | null;
  profile: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    supabaseUser: null,
    profile: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const supabase = createClient();

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        return data.user as User;
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
    return null;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (state.supabaseUser) {
      const profile = await fetchProfile(state.supabaseUser.id);
      setState((prev) => ({ ...prev, profile }));
    }
  }, [state.supabaseUser, fetchProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const profile = await fetchProfile(session.user.id);
          setState({
            supabaseUser: session.user,
            profile,
            isLoading: false,
            isAuthenticated: true,
          });
        } else {
          setState({
            supabaseUser: null,
            profile: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({
      supabaseUser: null,
      profile: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ ...state, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
