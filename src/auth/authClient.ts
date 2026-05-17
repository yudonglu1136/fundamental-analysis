import { createClient, type Session, type User } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const authProvider = import.meta.env.VITE_AUTH_PROVIDER ?? "supabase";
export const isAuthConfigured = authProvider === "supabase" && Boolean(supabaseUrl && supabaseAnonKey);
export const isDevAuthBypassEnabled =
  import.meta.env.DEV &&
  !isAuthConfigured &&
  import.meta.env.VITE_AUTH_DEV_BYPASS === "true";
export const devAuthAccessToken = "local-dev-token";

export const supabase = isAuthConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true,
      },
    })
  : null;

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  provider: "google" | string;
};

export const devAuthUser: AuthUser = {
  id: "local-dev-user",
  email: null,
  name: "Private Workspace",
  avatarUrl: null,
  provider: "local-dev",
};

export type Entitlements = {
  plan: "unknown";
  roles: string[];
  features: string[];
};

export function mapSupabaseUser(user: User | null): AuthUser | null {
  if (!user) return null;
  const metadata = user.user_metadata ?? {};
  const appMetadata = user.app_metadata ?? {};
  const providers = Array.isArray(appMetadata.providers) ? appMetadata.providers : [];
  return {
    id: user.id,
    email: user.email ?? null,
    name: typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : null,
    avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : typeof metadata.picture === "string" ? metadata.picture : null,
    provider: typeof appMetadata.provider === "string" ? appMetadata.provider : providers[0] ?? "google",
  };
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithGoogle(redirectTo: string) {
  if (!supabase) throw new Error("Authentication is not configured for this deployment.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
