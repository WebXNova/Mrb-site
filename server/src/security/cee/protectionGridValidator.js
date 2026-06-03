/**
 * CEE Protection Grid — startup integrity validation (fail-closed).
 *
 * Ensures protected namespaces, application mounts, and grid rules stay aligned.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { CeeProtectionGridMisconfiguredError } from '../../errors/cee/ProtectionGridErrors.js';
import { APPLICATION_API_MOUNTS } from './applicationMountManifest.js';
import { logStartupGridFailures } from './protectionGridDiagnostics.js';
import { PROTECTION_GRID_RULES, matchProtectionRule } from './protectionGrid.js';
import {
  CEE_PROTECTED_NAMESPACES,
  matchProtectedNamespace,
} from './protectedNamespaceRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '../../..');

const ROUTE_HANDLER_RE =
  /router\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]/gi;

/**
 * @returns {boolean}
 */
export function shouldRunProtectionGridStartupValidation() {
  if (String(process.env.CEE_SKIP_GRID_STARTUP_VALIDATION || '').toLowerCase() === 'true') {
    return false;
  }
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  return true;
}

/**
 * @param {string} mountPath
 * @param {string} routePath
 */
function joinMountRoute(mountPath, routePath) {
  const mount = mountPath.replace(/\/+$/, '');
  const route = routePath.startsWith('/') ? routePath : `/${routePath}`;
  if (route === '/') return mount;
  return `${mount}${route}`.replace(/\/+/g, '/');
}

/**
 * @param {string} fullPath
 * @returns {string}
 */
function policyStatusForPath(fullPath) {
  const rule = matchProtectionRule(fullPath);
  if (!rule) return 'unregistered';
  return rule.policy;
}

/**
 * @param {string} relativeModulePath — e.g. src/routes/student.routes.js
 * @returns {Promise<ReadonlyArray<string>>}
 */
async function extractRouterPathsFromModule(relativeModulePath) {
  const abs = path.join(SERVER_ROOT, relativeModulePath);
  let source;
  try {
    source = await fs.readFile(abs, 'utf8');
  } catch {
    return Object.freeze([]);
  }
  const paths = [];
  for (const match of source.matchAll(ROUTE_HANDLER_RE)) {
    paths.push(match[2]);
  }
  return Object.freeze(paths);
}

/**
 * @returns {string[]}
 */
function validateGridRuleIntegrity() {
  /** @type {string[]} */
  const issues = [];
  const labelCounts = new Map();

  for (const rule of PROTECTION_GRID_RULES) {
    labelCounts.set(rule.label, (labelCounts.get(rule.label) ?? 0) + 1);
  }

  for (const [label, count] of labelCounts) {
    if (count > 1) {
      issues.push(`duplicate_grid_label:${label} (count=${count})`);
    }
  }

  const namespaceLabels = new Set(CEE_PROTECTED_NAMESPACES.map((d) => d.label));

  for (const rule of PROTECTION_GRID_RULES) {
    if (rule.policy !== 'entitlement') continue;
    if (!namespaceLabels.has(rule.label)) {
      issues.push(
        `orphan_entitlement_rule:${rule.label} (no matching protected namespace label)`
      );
    }
  }

  return issues;
}

/**
 * @returns {string[]}
 */
function validateProtectedNamespaceCoverage() {
  /** @type {string[]} */
  const issues = [];

  for (const def of CEE_PROTECTED_NAMESPACES) {
    const probe = `${def.namespace}/__cee_startup_probe__`;
    const rule = matchProtectionRule(probe);
    const ns = matchProtectedNamespace(probe);

    if (!ns || ns.namespace !== def.namespace) {
      issues.push(`registry_mismatch:${def.namespace}`);
      continue;
    }

    if (!rule) {
      issues.push(
        `namespace_uncovered:${def.namespace} (no grid rule — requests would be denied at runtime)`
      );
      continue;
    }

    if (rule.policy !== def.requiredPolicy) {
      issues.push(
        `namespace_wrong_policy:${def.namespace} (required=${def.requiredPolicy}, grid=${rule.policy}, label=${rule.label})`
      );
    }

    const byLabel = PROTECTION_GRID_RULES.find((r) => r.label === def.label);
    if (!byLabel) {
      issues.push(`namespace_missing_label_rule:${def.namespace} (expected label=${def.label})`);
    } else if (byLabel.policy !== def.requiredPolicy) {
      issues.push(`namespace_label_policy_mismatch:${def.label}`);
    }
  }

  return issues;
}

/**
 * @returns {string[]}
 */
function validateApplicationMountsAgainstGrid() {
  /** @type {string[]} */
  const issues = [];

  for (const mount of APPLICATION_API_MOUNTS) {
    if (!mount.isProtectedNamespace || !mount.namespace) continue;

    const probe = `${mount.mountPath}/__cee_mount_probe__`;
    const rule = matchProtectionRule(probe);
    if (!rule || rule.policy === 'public') {
      issues.push(
        `mounted_without_grid:${mount.mountPath} (policy=${rule?.policy ?? 'unregistered'})`
      );
    } else if (rule.policy !== 'entitlement') {
      issues.push(
        `mounted_weak_policy:${mount.mountPath} (policy=${rule.policy}, label=${rule.label})`
      );
    }
  }

  return issues;
}

/**
 * @returns {Promise<string[]>}
 */
async function validateRouteModulesAgainstGrid() {
  /** @type {string[]} */
  const issues = [];

  for (const def of CEE_PROTECTED_NAMESPACES) {
    if (!def.routeModules.length) continue;

    for (const modulePath of def.routeModules) {
      const routePaths = await extractRouterPathsFromModule(modulePath);
      const mount = def.mountPaths[0] ?? def.namespace;

      for (const routePath of routePaths) {
        const fullPath = joinMountRoute(mount, routePath);
        const policy = policyStatusForPath(fullPath);
        if (policy === 'unregistered' || policy === 'public') {
          issues.push(
            `route_not_in_grid:${fullPath} (module=${modulePath}, policy=${policy})`
          );
        }
      }
    }
  }

  return issues;
}

/**
 * @param {object} [options]
 * @param {boolean} [options.throwOnFailure=true]
 * @returns {Promise<{ ok: boolean, issues: string[] }>}
 */
export async function validateProtectionGridAtStartup(options = {}) {
  const throwOnFailure = options.throwOnFailure !== false;
  /** @type {string[]} */
  const issues = [
    ...validateGridRuleIntegrity(),
    ...validateProtectedNamespaceCoverage(),
    ...validateApplicationMountsAgainstGrid(),
    ...(await validateRouteModulesAgainstGrid()),
  ];

  if (issues.length) {
    logStartupGridFailures(issues);
    if (throwOnFailure) {
      throw new CeeProtectionGridMisconfiguredError({
        issueCount: issues.length,
        issues,
        timestamp: new Date().toISOString(),
      });
    }
    return { ok: false, issues };
  }

  return { ok: true, issues: [] };
}
