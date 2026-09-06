// Inputs must come from the verified Auth user response or verified JWT claims,
// never user_metadata, browser timestamps, or iat (token refresh changes iat).
export function verifiedLoginTime({ lastSignInAt, amr } = {}, now = Date.now()) {
  const valid = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) && time > 0 && time <= now + 60_000 ? new Date(time).toISOString() : null;
  };
  const reported = valid(lastSignInAt);
  if (reported) return reported;
  const loginMethods = new Set(["password", "otp", "oauth", "magiclink", "sso/saml", "sso", "email/signup"]);
  // Ignore MFA and refresh events; the earliest primary method belongs to the
  // session's sign-in, not a later assurance upgrade or refreshed access token.
  const times = (Array.isArray(amr) ? amr : [])
    .filter((entry) => loginMethods.has(entry?.method))
    .map((entry) => typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp) && entry.timestamp > 0 && entry.timestamp * 1000 <= now + 60_000
      ? new Date(entry.timestamp * 1000).toISOString() : null)
    .filter(Boolean).sort();
  return times[0] || null;
}
