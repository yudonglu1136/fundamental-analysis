import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const within = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);

// Storage location is an operator setting, never a request parameter. Preserve
// legacy paths unless explicitly configured; moving a directory is a migration.
export function resolveUserDataPaths(env = process.env) {
  const research = path.resolve(env.SQLITE_DB_PATH || path.join(repository, 'server/data/guru-analysis.sqlite'));
  const legacyPortfolios = path.resolve(env.USER_PORTFOLIO_DATA_DIR || path.join(path.dirname(research), 'user-portfolios'));
  let root = null;
  if (env.USER_DATA_ROOT) {
    if (!path.isAbsolute(env.USER_DATA_ROOT)) throw new Error('USER_DATA_ROOT must be absolute');
    root = path.resolve(env.USER_DATA_ROOT);
    if ([path.parse(root).root, os.homedir(), repository, '/var/app/data'].includes(root)
      || ['/var/app/current', '/var/app/staging', path.join(repository, 'web'), path.join(repository, 'dist')].some(p => within(p, root))) {
      throw new Error('USER_DATA_ROOT must be a dedicated private data directory outside release/static paths');
    }
  }
  const portfolios = path.resolve(env.USER_PORTFOLIO_DATA_DIR || (root ? path.join(root, 'portfolios') : legacyPortfolios));
  const login = path.resolve(env.LOGIN_ACTIVITY_DB_PATH || path.join(portfolios, 'login-activity.sqlite'));
  const investment = env.INVESTMENT_DB_PATH ? path.resolve(env.INVESTMENT_DB_PATH)
    : root ? path.join(root, 'investment.sqlite') : null;
  const registry = path.join(portfolios, 'portfolio-admin.sqlite');
  if ([login, registry, investment].filter(Boolean).some(file => file === research)
    || new Set([login, registry, investment].filter(Boolean)).size !== [login, registry, investment].filter(Boolean).length) {
    throw new Error('User stores must be separate from research data and from one another');
  }
  if (root && portfolios !== legacyPortfolios && fs.existsSync(legacyPortfolios)
    && fs.readdirSync(legacyPortfolios).length > 0) {
    throw new Error('Legacy user data exists; keep USER_PORTFOLIO_DATA_DIR explicit until a verified migration');
  }
  return { root, portfolios, registry, login, investment, research, mode: 'sqlite-single-host' };
}
