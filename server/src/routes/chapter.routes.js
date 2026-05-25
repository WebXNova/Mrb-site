import { Router } from 'express';
import { adminSecurityStack } from '../security/admin/adminSecurityStack.js';
import {
  deleteChapter,
  getChapter,
  getChapters,
  postChapter,
  putChapter,
} from '../controllers/chapter.controller.js';

/**
 * Phase 3C — Admin chapter API (`/api/admin/chapters`).
 *
 * Security: centralized `adminSecurityStack` (bearer rejection, session admin context,
 * CSRF on mutations, non-blocking ingress audit). Parent `admin.routes.js` applies the
 * same stack globally; this module keeps hierarchy routes self-contained and auditable.
 *
 * Mutations archive-only on DELETE (controller → service.archiveChapter).
 */
const router = Router();

router.use(adminSecurityStack);

router.get('/', getChapters);
router.get('/:id', getChapter);
router.post('/', postChapter);
router.put('/:id', putChapter);
router.delete('/:id', deleteChapter);

export default router;
