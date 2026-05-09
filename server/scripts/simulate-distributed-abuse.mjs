import crypto from 'crypto';

function fakeIp(seed) {
  const hash = crypto.createHash('sha256').update(String(seed)).digest();
  return `10.${hash[0]}.${hash[1]}.${hash[2]}`;
}

function run() {
  const targets = new Map();
  for (let i = 0; i < 5000; i += 1) {
    const victim = i % 25;
    const key = `victim-${victim}`;
    const current = targets.get(key) || { attempts: 0, uniqueIps: new Set() };
    current.attempts += 1;
    current.uniqueIps.add(fakeIp(i));
    targets.set(key, current);
  }
  const worst = [...targets.entries()]
    .map(([key, value]) => ({ key, attempts: value.attempts, uniqueIps: value.uniqueIps.size }))
    .sort((a, b) => b.attempts - a.attempts)[0];
  console.log(JSON.stringify({ scenarios: targets.size, worstTarget: worst }, null, 2));
}

run();

