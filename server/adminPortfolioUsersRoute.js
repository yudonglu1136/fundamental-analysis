import { requireAdmin } from "./auth/requireAdmin.js";
import { listAdminPortfolioUsers } from "./userPortfolioStore.js";

// Mounted only after requireAuth. Identity fields and portfolio data never cache.
export function registerAdminPortfolioUsersRoute(app, { listUsers = listAdminPortfolioUsers } = {}) {
  app.get("/api/admin/portfolio-users", requireAdmin, (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      response.json(listUsers());
    } catch {
      response.status(503).json({
        error: "admin_portfolio_list_failed",
        message: "The user directory is temporarily unavailable."
      });
    }
  });
}
