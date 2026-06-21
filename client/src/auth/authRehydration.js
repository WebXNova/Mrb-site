/**
 * Cookie-first session rehydration on SPA boot.
 *
 * HttpOnly cookies are the source of truth. localStorage holds display metadata only
 * and is repopulated from `/me` when valid cookies exist but storage was cleared.
 */

import { adminApi } from '../api/adminApi';
import { studentApi } from '../api/studentApi';
import { teacherApi } from '../api/teacherApi';
import { isAdminShellConfigured } from '../config/adminShellConfig';
import { authBootSpan } from '../observability/authBootProfile';
import { isConfirmedAuthTerminationKind } from './refreshFailureKind';
import {
  clearAdminAuth,
  clearStudentAuth,
  clearTeacherAuth,
  getStoredUser,
  setAdminAuth,
  setStudentAuth,
  setTeacherAuth,
} from './session';

/**
 * Only wipe local display state when the server confirmed the session is dead.
 * Transient refresh failures (CSRF, network, rate limit) must not log users out on boot.
 */
function isAuthTerminationError(error) {
  const kind = error?.refreshFailureKind;
  if (kind && isConfirmedAuthTerminationKind(kind)) return true;

  const status = Number(error?.status);
  if (status === 401 || status === 403) {
    if (error?.refreshAlreadyTried) {
      return Boolean(kind && isConfirmedAuthTerminationKind(kind));
    }
    return true;
  }

  return false;
}

function hasRoleStorageHint(role) {
  const key =
    role === 'student' ? 'student_user' : role === 'admin' ? 'admin_user' : 'teacher_user';
  return Boolean(getStoredUser(key)?.id);
}

/**
 * @param {{
 *   spanLabel: string,
 *   fetchMe: () => Promise<{ data?: object }>,
 *   setAuth: (token: string, user: object) => void,
 *   clearAuth: () => void,
 * }} config
 */
async function rehydrateRole({ spanLabel, fetchMe, setAuth, clearAuth }) {
  return authBootSpan(spanLabel, async () => {
    try {
      const response = await fetchMe();
      const user = response?.data;
      if (user && typeof user === 'object' && user.id != null) {
        setAuth('__cookie_session__', user);
        return { ok: true };
      }
      clearAuth();
      return { ok: false, reason: 'empty-profile' };
    } catch (error) {
      if (isAuthTerminationError(error)) {
        clearAuth();
      }
      return {
        ok: false,
        reason: error?.message || 'probe-failed',
        transient: !isAuthTerminationError(error),
      };
    }
  });
}

const ROLE_REHYDRATORS = [
  {
    role: 'student',
    spanLabel: 'rehydrate.studentMe',
    fetchMe: () => studentApi.me(),
    setAuth: setStudentAuth,
    clearAuth: clearStudentAuth,
  },
  {
    role: 'admin',
    spanLabel: 'rehydrate.adminMe',
    fetchMe: () => adminApi.me(),
    setAuth: setAdminAuth,
    clearAuth: clearAdminAuth,
  },
  {
    role: 'teacher',
    spanLabel: 'rehydrate.teacherMe',
    fetchMe: () => teacherApi.me(),
    setAuth: setTeacherAuth,
    clearAuth: clearTeacherAuth,
  },
];

/**
 * Probe role `/me` endpoints to sync localStorage with HttpOnly cookies.
 * When localStorage hints exist, only those roles are probed (avoids cross-role
 * refresh noise during boot). If storage was cleared but cookies remain, all roles
 * are probed so a valid session can still be recovered.
 */
export async function rehydrateSessionFromCookies() {
  const hinted = ROLE_REHYDRATORS.filter((entry) => hasRoleStorageHint(entry.role));
  let targets = hinted.length > 0 ? hinted : ROLE_REHYDRATORS;
  if (!isAdminShellConfigured()) {
    targets = targets.filter((entry) => entry.role !== 'admin');
  }
  return Promise.all(targets.map(rehydrateRole));
}
