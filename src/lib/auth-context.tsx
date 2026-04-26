import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "client" | null;

interface AuthState {
  session: Session | null;
  user: User | null;
  role: Role;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (uid: string | undefined) => {
    if (!uid) {
      setRole(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw error;
      setRole((data?.role as Role) ?? "client");
    } catch (error) {
      console.error("Failed to fetch role", error);
      setRole("client");
    }
  };

  useEffect(() => {
    let cancelled = false;
    let finished = false;

    const finishLoading = () => {
      if (!cancelled && !finished) {
        finished = true;
        setLoading(false);
      }
    };

    const timeout = window.setTimeout(() => {
      finishLoading();
    }, 2500);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => {
          void fetchRole(s.user.id).finally(finishLoading);
        }, 0);
      } else {
        setRole(null);
        finishLoading();
      }
    });

    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        if (cancelled) return;
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          return fetchRole(s.user.id);
        }
        setRole(null);
      })
      .catch((error) => {
        console.error("Failed to restore session", error);
        if (!cancelled) {
          setSession(null);
          setUser(null);
          setRole(null);
        }
      })
      .finally(finishLoading);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshRole = async () => {
    await fetchRole(user?.id);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signOut, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
