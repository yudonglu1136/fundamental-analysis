import { verifySupabaseAccessToken } from "./verifyAuth.js";

const localDevToken = "local-dev-token";

function isDevBypassEnabled() {
  return process.env.API_AUTH_DEV_BYPASS === "true" && process.env.NODE_ENV !== "production";
}

export async function requireAuth(request, response, next) {
  const header = request.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    response.status(401).json({ error: "unauthorized", message: "Missing bearer token" });
    return;
  }

  if (isDevBypassEnabled() && match[1] === localDevToken) {
    request.user = {
      id: "local-dev-user",
      email: "local-dev@guru-analysis.test",
      name: "Local Development",
      provider: "local-dev"
    };
    request.auth = { user: request.user, claims: { sub: request.user.id, email: request.user.email }, token: match[1] };
    next();
    return;
  }

  const result = await verifySupabaseAccessToken(match[1]);
  if (!result.ok) {
    response.status(result.status).json({ error: result.error, message: result.message });
    return;
  }

  request.user = result.user;
  request.auth = { user: result.user, claims: result.claims, token: match[1] };
  next();
}
