import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const authProvider = import.meta.env.VITE_AUTH_PROVIDER || "supabase";
export const isAuthConfigured = authProvider === "supabase" && Boolean(supabaseUrl && supabaseAnonKey);
export const isDevAuthBypassEnabled =
  import.meta.env.DEV && !isAuthConfigured && import.meta.env.VITE_AUTH_DEV_BYPASS === "true";
export const devAuthAccessToken = "local-dev-token";

export const supabase = isAuthConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true
      }
    })
  : null;

export const devAuthUser = {
  id: "local-dev-user",
  email: null,
  name: "Private Workspace",
  avatarUrl: null,
  provider: "local-dev"
};

export function mapSupabaseUser(user) {
  if (!user) return null;
  const metadata = user.user_metadata || {};
  const appMetadata = user.app_metadata || {};
  const providers = Array.isArray(appMetadata.providers) ? appMetadata.providers : [];
  return {
    id: user.id,
    email: user.email || null,
    name: metadata.full_name || metadata.name || null,
    avatarUrl: metadata.avatar_url || metadata.picture || null,
    provider: appMetadata.provider || providers[0] || "google"
  };
}

export async function getCurrentSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function exchangeAuthCodeForSession(code) {
  if (!supabase) throw new Error("Authentication is not configured for this deployment.");
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data.session;
}

export async function signInWithGoogle(redirectTo) {
  if (!supabase) throw new Error("Authentication is not configured for this deployment.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo }
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
