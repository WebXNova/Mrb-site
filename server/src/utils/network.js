function normalizeIp(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'unknown';
  if (value.includes(',')) return value.split(',')[0].trim() || 'unknown';
  if (value.startsWith('::ffff:')) return value.slice(7);
  return value;
}

export function getClientIp(req) {
  return normalizeIp(req.ip || req.socket?.remoteAddress || 'unknown');
}

export function getClientAsn(req) {
  const raw = String(req.get?.('cf-asn') || req.get?.('x-client-asn') || req.headers?.['cf-asn'] || '').trim();
  if (!raw) return 'unknown';
  const normalized = raw.replace(/[^0-9]/g, '');
  return normalized ? `AS${normalized}` : 'unknown';
}

export function getIpSubnet(ipAddress) {
  const ip = normalizeIp(ipAddress);
  if (ip === 'unknown') return 'unknown';
  if (ip.includes(':')) {
    const chunks = ip.split(':').slice(0, 4);
    return `${chunks.join(':')}::/64`;
  }
  const chunks = ip.split('.');
  if (chunks.length !== 4) return ip;
  return `${chunks.slice(0, 3).join('.')}.0/24`;
}

