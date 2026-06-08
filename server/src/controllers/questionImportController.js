import { asyncHandler } from '../utils/asyncHandler.js';
import { importAikenQuestions } from '../services/questionImportService.js';

export const importAiken = asyncHandler(async (req, res) => {
  await importAikenQuestions(req.body?.content);

  res.status(200).json({
    success: true,
    message: 'Aiken import endpoint initialized',
  });
});
