import { loginActivityStore } from "./loginActivityStore.js";
import { requireAdmin } from "./auth/requireAdmin.js";

export function createLoginActivityRecorder({ getStore = loginActivityStore, warn = console.warn, now = Date.now } = {}) {
  let retryAfter = 0;
  return (request, _response, next) => {
    try {
      if (now() >= retryAfter && request.user?.id && request.user.provider !== "local-dev" && request.user.isAnonymous !== true) getStore().record(request.user);
    } catch {
      // Analytics must not prevent sign-in or leak identities/database paths.
      // Back off a failed database so every API request does not repeat IO/logs.
      retryAfter = now() + 60_000;
      warn("Login activity could not be recorded.");
    }
    next();
  };
}
export const recordLoginActivity = createLoginActivityRecorder();

export function registerLoginActivityRoutes(app, { getStore = loginActivityStore } = {}) {
  // A signed-in visitor can return directly to Ontology without loading a Guru
  // API. The auth shell sends this empty acknowledgement before that redirect.
  // Authentication/recording is the same preceding middleware; no client user
  // ID, login time, or other body field is accepted as evidence.
  app.post("/api/auth/activity", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json({ authenticated: true });
  });
  // The application mounts requireAuth before these routes. This extra owner
  // guard is also enforced server-side; hiding the tab is not authorization.
  app.get("/api/admin/login-activity", requireAdmin, (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      response.json(getStore().list(request.query));
    } catch {
      response.status(503).json({ error: "login_activity_unavailable", message: "Login activity is temporarily unavailable." });
    }
  });
}
