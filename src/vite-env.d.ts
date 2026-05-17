/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_PROVIDER?: "supabase";
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_AUTH_DEV_BYPASS?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_MA_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
