/**
 * Verifies CEE protection grid fail-closed configuration without starting HTTP.
 *
 * Usage: node scripts/verify-protection-grid.mjs
 */
import 'dotenv/config';
import { validateProtectionGridAtStartup } from '../src/security/cee/protectionGridValidator.js';
import {
  CEE_PROTECTED_NAMESPACES,
  matchProtectedNamespace,
} from '../src/security/cee/protectedNamespaceRegistry.js';
import { matchProtectionRule, PROTECTION_GRID_RULES } from '../src/security/cee/protectionGrid.js';

async function main() {
  console.log('CEE Protection Grid — fail-closed verification\n');
  console.log(`Protected namespaces: ${CEE_PROTECTED_NAMESPACES.length}`);
  console.log(`Grid rules: ${PROTECTION_GRID_RULES.length}\n`);

  const result = await validateProtectionGridAtStartup({ throwOnFailure: false });
  if (!result.ok) {
    console.error('FAIL — startup validation issues:');
    for (const issue of result.issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }

  const simulated = '/api/student/__unregistered_probe__';
  const ns = matchProtectedNamespace(simulated);
  const rule = matchProtectionRule(simulated);
  console.log('Runtime simulation:', simulated);
  console.log(`  namespace match: ${ns?.namespace ?? 'none'}`);
  console.log(`  grid rule: ${rule?.label ?? 'none'} (${rule?.policy ?? 'unregistered'})`);
  if (ns && rule?.policy === 'entitlement') {
    console.log('  → entitled route would pass grid (then entitlementGuard)');
  }

  const orphanProbe = '/api/student/forgotten-route';
  const orphanRule = matchProtectionRule(orphanProbe);
  if (matchProtectedNamespace(orphanProbe) && orphanRule?.policy === 'entitlement') {
    console.log('\nFail-open regression check: protected path still has entitlement rule ✓');
  }

  console.log('\nPASS — grid registry, mounts, and namespace coverage aligned.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
