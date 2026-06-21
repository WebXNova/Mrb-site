/**
 * IPv4 CIDR + exact-match allowlist for internal observability clients.
 */

function normalizeIp(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.startsWith('::ffff:')) return value.slice(7);
  return value;
}

function ipv4ToLong(ip) {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * @param {string} ip
 * @param {string} cidrOrIp
 */
export function isIpAllowlisted(ip, cidrOrIp) {
  const normalized = normalizeIp(ip);
  const rule = String(cidrOrIp || '').trim();
  if (!normalized || !rule) return false;

  if (!rule.includes('/')) {
    return normalized === rule;
  }

  const [network, prefixRaw] = rule.split('/');
  const prefix = Number(prefixRaw);
  const ipLong = ipv4ToLong(normalized);
  const networkLong = ipv4ToLong(network);
  if (ipLong == null || networkLong == null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return (ipLong & mask) === (networkLong & mask);
}

/**
 * @param {string} ip
 * @param {string[]} rules
 */
export function isIpAllowlistedAny(ip, rules = []) {
  return rules.some((rule) => isIpAllowlisted(ip, rule));
}
