/**

 * Frozen scope context for CEE database access — prevents post-hoc bypass mutation.

 */



import { CeeInvalidBypassError } from '../../../errors/cee/ScopedQueryErrors.js';

import { assertCourseScope } from '../scopedQueryGuard.js';

import { validateBypassRequest } from '../bypass/bypassPolicy.js';



/**

 * @typedef {import('../bypass/bypassPolicy.js').CeeBypassCategory} CeeBypassCategory

 */



/**

 * @typedef {object} ScopedQueryScopeInput

 * @property {number|null|undefined} [courseId]

 * @property {string} [context]

 * @property {boolean} [allowUnscoped]

 * @property {string} [reason] — required when allowUnscoped; format `{category}:{descriptor}`

 * @property {string} [bypassReason] — alias for reason

 * @property {CeeBypassCategory} [bypassCategory]

 * @property {number|null} [userId]

 * @property {string|null} [requestId]

 * @property {string} [route]

 * @property {boolean} [skipAudit]

 */



/**

 * @typedef {Readonly<{

 *   courseId: number|null,

 *   context: string,

 *   allowUnscoped: boolean,

 *   bypassReason: string|null,

 *   bypassCategory: CeeBypassCategory|null,

 *   userId: number|null,

 *   requestId: string|null,

 *   route: string|null,

 *   skipAudit: boolean,

 * }>} FrozenScopeContext

 */



/**

 * @param {ScopedQueryScopeInput} input

 * @returns {FrozenScopeContext}

 */

export function createFrozenScopeContext(input) {

  if (!input || typeof input !== 'object') {

    throw new CeeInvalidBypassError({ reason: 'scope_context_required' });

  }



  const context = String(input.context || '').trim();

  if (!context) {

    throw new CeeInvalidBypassError({

      reason: 'context_required',

      hint: 'Every scopedQuery() call must include a stable context label for audit trails',

    });

  }



  const allowUnscoped = input.allowUnscoped === true;

  const route = input.route != null ? String(input.route) : null;



  let bypassReason = null;

  let bypassCategory = null;



  if (allowUnscoped) {

    const validated = validateBypassRequest({

      allowUnscoped: true,

      reason: input.reason,

      bypassReason: input.bypassReason,

      bypassCategory: input.bypassCategory,

      context,

      route,

    });

    bypassReason = validated.reason;

    bypassCategory = validated.category;

  }



  let courseId = null;



  if (!allowUnscoped) {

    courseId = assertCourseScope(input.courseId, {

      context,

      route,

      userId: input.userId,

      requestId: input.requestId,

      skipAudit: input.skipAudit,

    });

  } else if (input.courseId != null) {

    courseId = assertCourseScope(input.courseId, {

      context,

      route,

      userId: input.userId,

      requestId: input.requestId,

      skipAudit: input.skipAudit,

    });

  }



  return Object.freeze({

    courseId,

    context,

    allowUnscoped,

    bypassReason,

    bypassCategory,

    userId: input.userId != null ? Number(input.userId) : null,

    requestId: input.requestId != null ? String(input.requestId) : null,

    route,

    skipAudit: input.skipAudit === true,

  });

}



/**

 * Build guard options from frozen scope + SQL.

 * @param {FrozenScopeContext} scope

 * @param {string} sql

 */

export function toGuardOptions(scope, sql) {

  return {

    sql,

    courseId: scope.courseId,

    context: scope.context,

    allowUnscoped: scope.allowUnscoped,

    bypassReason: scope.bypassReason ?? undefined,

    bypassCategory: scope.bypassCategory ?? undefined,

    userId: scope.userId,

    requestId: scope.requestId,

    route: scope.route,

    skipAudit: scope.skipAudit,

  };

}


