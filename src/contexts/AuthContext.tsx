import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "teacher" | "student";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: { full_name: string; avatar_url: string | null } | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);
  const initialFetchDone = useRef(false);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const [roleRes, profileRes] = await Promise.all([
        supabase.rpc("get_user_role", { _user_id: userId }),
        supabase.from("profiles").select("full_name, avatar_url").eq("user_id", userId).single(),
      ]);
      if (!isMounted.current) return;
      if (roleRes.data) setRole(roleRes.data as AppRole);
      if (profileRes.data) setProfile(profileRes.data);
    } catch (err) {
      console.error("Failed to fetch user data:", err);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;

    // First: get the initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted.current) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      if (isMounted.current) {
        initialFetchDone.current = true;
        setLoading(false);
      }
    });

    // Then: listen for auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted.current) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Use setTimeout to avoid deadlock with Supabase auth
          setTimeout(async () => {
            if (!isMounted.current) return;
            await fetchUserData(session.user.id);
            if (isMounted.current) setLoading(false);
          }, 0);
        } else {
          setRole(null);
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
