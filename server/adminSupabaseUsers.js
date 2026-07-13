function cleanString(value) {
  return String(value || "").trim();
}

function cleanSupabaseUrl(value) {
  return cleanString(value).replace(/\/+$/, "");
}

function firstProvider(value) {
  if (Array.isArray(value)) return cleanString(value[0]);
  return cleanString(value);
}

function normalizeAuthUser(row = {}) {
  const id = cleanString(row.id || row.user_id || row.userId);
  if (!id) return null;
  return {
    id,
    email: cleanString(row.email).toLowerCase(),
    name: cleanString(row.name || row.full_name || row.fullName),
    avatar: cleanString(row.avatar || row.avatar_url || row.picture),
    provider: firstProvider(row.provider || row.providers),
    createdAt: cleanString(row.created_at || row.createdAt),
    lastSignInAt: cleanString(row.last_sign_in_at || row.lastSignInAt)
  };
}

export async function listSupabaseAuthUsersForAdmin(accessToken) {
  const supabaseUrl = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const anonKey = cleanString(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
  const token = cleanString(accessToken);
  if (!supabaseUrl || !anonKey || !token || token === "local-dev-token") {
    return {
      users: [],
      source: "disabled",
      status: 0,
      error: ""
    };
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_list_auth_users`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: "{}"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const message = body.slice(0, 500);
    console.warn(`Admin Supabase Auth directory unavailable: ${response.status} ${message}`);
    return {
      users: [],
      source: "supabase_auth",
      status: response.status,
      error: message || response.statusText
    };
  }

  const rows = await response.json().catch(() => []);
  return {
    users: Array.isArray(rows) ? rows.map(normalizeAuthUser).filter(Boolean) : [],
    source: "supabase_auth",
    status: response.status,
    error: ""
  };
}
