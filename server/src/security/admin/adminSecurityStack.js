import { rejectAdminBearer } from './rejectAdminBearer.js';
import { adminContextResolver } from './adminContextResolver.js';
import { adminCsrfProtection } from './adminCsrfProtection.js';
import { adminAuditLogger } from './adminAuditLogger.js';

/**
 * Phase 1B: centralized admin ingress composition — delegates only; ordering is contractual.
 *
 * Execution order:
 * 1. rejectAdminBearer → rejectAuthHeaderInProduction
 * 2. adminContextResolver → requireAdmin
 * 3. adminCsrfProtection → requireCsrf (skipped for GET/HEAD/OPTIONS)
 * 4. adminAuditLogger → non-blocking mutation audit
 *
 * @type {import('express').RequestHandler[]}
 */
export const adminSecurityStack = [
  rejectAdminBearer,
  adminContextResolver,
  adminCsrfProtection,
  adminAuditLogger,
];
