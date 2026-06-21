/**
 * @typedef {Object} EmailWebhookEnvConfig
 * @property {boolean} enabled
 * @property {string} emailQueueName
 * @property {string} sharedSecret
 * @property {string} signatureSecret
 * @property {number} toleranceSeconds
 * @property {number} maxPayloadBytes
 * @property {number} replayTtlSeconds
 * @property {boolean} requireRedisReplay
 */

/**
 * @typedef {EmailWebhookEnvConfig & {
 *   operational: boolean,
 *   disabledReason: string | null,
 * }} EmailWebhookRuntimeConfig
 */

export {};
