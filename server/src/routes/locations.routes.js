import { Router } from 'express';
import { getBoards, getCities, getDistricts, getProvinces } from '../controllers/locations.controller.js';

const router = Router();

router.get('/provinces', getProvinces);
router.get('/districts', getDistricts);
router.get('/cities', getCities);
router.get('/boards', getBoards);

export default router;
