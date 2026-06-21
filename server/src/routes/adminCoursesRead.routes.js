import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { adminSecurityStack } from '../security/admin/adminSecurityStack.js';
import { getCoursesAdminRead } from '../controllers/coursesRead.controller.js';

const router = Router();

router.get(
  '/',
  ...adminSecurityStack,
  enforcePolicy({ auth: 'admin', maxRisk: 'elevated' }),
  getCoursesAdminRead
);

export default router;
