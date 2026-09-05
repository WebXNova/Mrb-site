import { raceWithTimeout } from './mysqlTimeout.util.js';
import { REDIS_COMMAND_TIMEOUT_MS } from './reliabilityTimeouts.js';
import { RedisCommandTimeoutError } from '../errors/redis/RedisCommandTimeoutError.js';
import { RedisUnavailableError } from '../errors/redis/RedisUnavailableError.js';

const TIMEOUT_WRAP = Symbol('redisCommandTimeoutInstalled');

const TIMED_COMMANDS = Object.freeze([
  'get',
  'set',
  'incr',
  'decr',
  'del',
  'exists',
  'expire',
  'pExpire',
  'ttl',
  'pTTL',
  'sAdd',
  'sCard',
  'hGet',
  'hSet',
  'ping',
]);

/**
 * Wrap node-redis command methods with a wall-clock deadline so HTTP requests
 * cannot wait indefinitely when Redis is slow or black-holed.
 *
 * @param {import('redis').RedisClientType} client
 * @param {number} [timeoutMs]
 */
export function installRedisCommandTimeouts(client, timeoutMs = REDIS_COMMAND_TIMEOUT_MS) {
  if (!client || client[TIMEOUT_WRAP]) {
    return client;
  }

  for (const command of TIMED_COMMANDS) {
    const original = client[command];
    if (typeof original !== 'function') {
      continue;
    }
    const bound = original.bind(client);
    client[command] = async (...args) => {
      try {
        return await raceWithTimeout(
          Promise.resolve(bound(...args)),
          timeoutMs,
          () => new RedisCommandTimeoutError({ timeoutMs, command })
        );
      } catch (error) {
        if (error instanceof RedisCommandTimeoutError || error instanceof RedisUnavailableError) {
          throw error;
        }
        const code = error && typeof error === 'object' ? String(error.code || '') : '';
        const message = error instanceof Error ? error.message : String(error);
        const connectionFailure =
          /ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|The client is closed|Stream isn't writeable|Connection in subscriber mode/i.test(
            `${code} ${message}`
          );
        if (connectionFailure) {
          throw new RedisUnavailableError({
            cause: error instanceof Error ? error : null,
            reason: command,
          });
        }
        throw error;
      }
    };
  }

  client[TIMEOUT_WRAP] = true;
  return client;
}
