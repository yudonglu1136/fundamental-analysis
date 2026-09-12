// This is a product-owner policy, not an environment-configurable role list.
// Legacy ADMIN_EMAILS values must never grant another account access.
export const ADMIN_OWNER_EMAIL = "luyudong1136@gmail.com";

export function isAdminOwner(user) {
  return typeof user?.id === "string" && user.id.trim().length > 0
    && user.isAnonymous !== true && user.provider !== "local-dev"
    && typeof user.email === "string"
    && user.email.trim().toLowerCase() === ADMIN_OWNER_EMAIL;
}

export function adminResponsePrivacy(_request, response, next) {
  response.setHeader("Cache-Control", "no-store");
  next();
}

export function requireAdmin(request, response, next) {
  response.setHeader("Cache-Control", "no-store");
  // requireAuth supplies this identity only after server-side token validation.
  // Do not authorize from request/body metadata or a preview-only request.user.
  const verifiedUser = request.auth?.user;
  if (!isAdminOwner(verifiedUser) || !isAdminOwner(request.user)
      || request.user.id !== verifiedUser.id) {
    response.status(403).json({ error: "admin_forbidden", message: "Admin access is restricted." });
    return;
  }
  next();
}
