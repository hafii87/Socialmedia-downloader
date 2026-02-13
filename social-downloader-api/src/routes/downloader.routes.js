const express = require('express');
const router = express.Router();
const { analyzeUrl, downloadUrl, getStatus } = require('../controllers/downloader.controller');
const { validateUrl } = require('../utils/validator');

/**
 * GET /api/v1/status
 * Health check
 */
router.get('/status', getStatus);

/**
 * POST /api/v1/analyze
 * Analyzes a media URL and returns metadata
 * Body: { "url": "https://..." }
 */
router.post('/analyze', validateUrl, analyzeUrl);

/**
 * POST /api/v1/download
 * Downloads media and returns a download link
 * Body: { "url": "https://..." }
 */
router.post('/download', validateUrl, downloadUrl);

module.exports = router;