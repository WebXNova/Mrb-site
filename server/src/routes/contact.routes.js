import { Router } from 'express';
import { postContactRemark } from '../controllers/contactRemarks.controller.js';

const router = Router();

router.post('/remarks', postContactRemark);

export default router;
