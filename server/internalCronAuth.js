import crypto from "node:crypto";

function secureCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function internalCronAuthorized(request, {
  secret = process.env.INTERNAL_CRON_SECRET || process.env.CRON_SECRET || ""
} = {}) {
  if (!secret) return false;
  const authorization = String(request?.headers?.authorization || "");
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const provided = String(request?.headers?.["x-cron-secret"] || "") || bearer;
  return secureCompare(provided, secret);
}

export function requireInternalCron(request, response, next) {
  if (!internalCronAuthorized(request)) {
    response.status(403).json({
      error: "cron_forbidden",
      message: "Internal refresh endpoint requires a configured cron secret."
    });
    return;
  }
  next();
}
