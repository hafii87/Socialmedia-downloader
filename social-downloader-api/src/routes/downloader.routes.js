const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { analyzeUrl, downloadUrl, getStatus, getApiInfo } = require('../controllers/downloader.controller');
const { validateUrl } = require('../utils/validator');

/**
 * Rate limiting middleware
 * Limit to 100 requests per 15 seconds per IP
 * Configurable via environment variables
 */
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Don't rate limit health checks
    return req.path === '/status';
  }
});

// ──────────────────────────────────────────────────────────────────────
// PUBLIC ENDPOINTS (No rate limit)
// ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/status
 * Health check - No rate limit
 */
router.get('/status', getStatus);

/**
 * GET /api/v1/info
 * API information and capabilities
 */
router.get('/info', getApiInfo);

// ──────────────────────────────────────────────────────────────────────
// RATE LIMITED ENDPOINTS
// ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/analyze
 * Analyzes a media URL and returns metadata
 * 
 * Supported Platforms:
 * - YouTube: Full support
 * - Instagram: Posts and Reels
 * - TikTok: Full support
 * - Snapchat: Metadata only
 * 
 * Request Body:
 * {
 *   "url": "https://..." (required)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "platform": "youtube",
 *     "title": "Video Title",
 *     "duration": 212,
 *     "durationFormatted": "3:32",
 *     "thumbnail": "https://...",
 *     "uploader": "Channel Name",
 *     ...
 *   }
 * }
 */
router.post('/analyze', limiter, validateUrl, analyzeUrl);

/**
 * POST /api/v1/download
 * Downloads media and returns a download link
 * 
 * Supported Platforms:
 * - YouTube: Full support with quality options
 * - Instagram: Posts and Reels
 * - TikTok: Full support
 * - Snapchat: NOT supported
 * 
 * Request Body:
 * {
 *   "url": "https://..." (required),
 *   "quality": "360p" (optional, YouTube only)
 * }
 * 
 * Quality Options (YouTube):
 * - "360p", "480p", "720p", "1080p", "2160p"
 * - "highest" (default), "lowest"
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "filename": "Video_Title_1234567890.mp4",
 *     "downloadUrl": "/downloads/Video_Title_1234567890.mp4",
 *     "filesize": 15728640,
 *     "platform": "youtube",
 *     "title": "Video Title",
 *     ...
 *   }
 * }
 */
router.post('/download', limiter, validateUrl, downloadUrl);

module.exports = router;