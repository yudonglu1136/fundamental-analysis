export function requireAdmin(request, response, next) {
  const emails = String(process.env.ADMIN_EMAILS || "luyudong1136@gmail.com")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!request.user?.id || !emails.includes(String(request.user.email || "").trim().toLowerCase())) {
    response.setHeader("Cache-Control", "no-store");
    response.status(403).json({ error: "admin_forbidden", message: "Admin access is restricted." });
    return;
  }
  next();
}
