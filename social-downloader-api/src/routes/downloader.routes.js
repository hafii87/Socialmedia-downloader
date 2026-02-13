const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { analyzeUrl, downloadUrl, getStatus } = require('../controllers/downloader.controller');
const { validateUrl } = require('../utils/validator');

/**
 * Rate limiting middleware
 * Limit to 100 requests per 15 seconds per IP
 */
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * GET /api/v1/status
 * Health check - No rate limit
 */
router.get('/status', getStatus);

/**
 * POST /api/v1/analyze
 * Analyzes a media URL and returns metadata
 * Body: { "url": "https://..." }
 */
router.post('/analyze', limiter, validateUrl, analyzeUrl);

/**
 * POST /api/v1/download
 * Downloads media and returns a download link
 * Body: { "url": "https://..." }
 */
router.post('/download', limiter, validateUrl, downloadUrl);

module.exports = router;