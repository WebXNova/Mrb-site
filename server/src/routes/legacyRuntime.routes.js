/**
 * Legacy student runtime catch-all — returns 410 with canonical migration map.
 * Mounted at /api/attempt and /api/attempts when LEGACY_RUNTIME_ALLOW is not true.
 */

import { Router } from 'express';
import { rejectLegacyStudentRuntimeRequest } from '../runtime/legacyRuntimeDeprecation.js';

const router = Router();

router.all(/.*/, rejectLegacyStudentRuntimeRequest);

export default router;
