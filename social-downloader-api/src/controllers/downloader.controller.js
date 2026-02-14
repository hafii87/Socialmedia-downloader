const { getInfo, downloadMedia } = require('../services/downloader.service');
const logger = require('../Logger/logger');

/**
 * POST /api/v1/analyze
 * Analyzes a media URL and returns metadata
 * Supports: YouTube, Instagram, TikTok, Snapchat
 */
const analyzeUrl = async (req, res, next) => {
  try {
    const { url } = req.body;

    logger.info(`📊 Analyze request received for: ${url}`);

    // Call the service layer
    const info = await getInfo(url);

    // Log successful analysis
    logger.info(`✅ Successfully analyzed ${info.platform}: ${info.title}`);

    // Return metadata
    return res.status(200).json({
      success: true,
      data: {
        platform: info.platform,
        title: info.title,
        duration: info.duration,
        durationFormatted: info.durationFormatted,
        thumbnail: info.thumbnail,
        uploader: info.uploader,
        uploadDate: info.uploadDate,
        description: info.description,
        views: info.views || null,
        likes: info.likes || null,
        comments: info.comments || null,
        shares: info.shares || null,
        isPlayable: info.isPlayable,
        availableFormats: info.formats || [],
        type: info.type || null,
        note: info.note || null
      }
    });
  } catch (error) {
    logger.error(`❌ Analyze error: ${error.message}`);
    
    // Return proper error response
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to analyze URL',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * POST /api/v1/download
 * Downloads media and returns a download link
 * Supports: YouTube, Instagram, TikTok
 * Note: Snapchat not supported for direct downloads
 */
const downloadUrl = async (req, res, next) => {
  try {
    const { url, quality } = req.body; // quality parameter optional

    logger.info(`⬇️  Download request received for: ${url}`);

    // Call the service layer
    const downloadInfo = await downloadMedia(url, quality);

    // Log successful download
    logger.info(`✅ Download prepared: ${downloadInfo.filename} (${downloadInfo.filesize} bytes)`);

    // Return download link
    return res.status(200).json({
      success: true,
      data: {
        filename: downloadInfo.filename,
        downloadUrl: downloadInfo.downloadUrl,
        filesize: downloadInfo.filesize,
        platform: downloadInfo.platform,
        title: downloadInfo.title,
        uploader: downloadInfo.uploader || null,
        thumbnail: downloadInfo.thumbnail || null,
        message: 'File ready for download',
        expiresIn: '7 days'
      }
    });
  } catch (error) {
    logger.error(`❌ Download error: ${error.message}`);
    
    // Return proper error response
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to download media',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * GET /api/v1/status
 * Health check endpoint
 */
const getStatus = (req, res) => {
  return res.status(200).json({
    success: true,
    status: 'API is running',
    timestamp: new Date().toISOString(),
    supportedPlatforms: ['youtube', 'instagram', 'tiktok'],
    limitedPlatforms: ['snapchat'],
    apiVersion: '2.0.0'
  });
};

/**
 * GET /api/v1/info
 * Returns API information and capabilities
 */
const getApiInfo = (req, res) => {
  return res.status(200).json({
    success: true,
    api: {
      name: 'Social Media Downloader API',
      version: '2.0.0',
      description: 'Multi-platform media downloader',
      author: 'Your Name'
    },
    endpoints: {
      analyze: {
        method: 'POST',
        path: '/api/v1/analyze',
        description: 'Analyze media URL and return metadata',
        body: {
          url: 'string (required)'
        }
      },
      download: {
        method: 'POST',
        path: '/api/v1/download',
        description: 'Download media file',
        body: {
          url: 'string (required)',
          quality: 'string (optional, YouTube only)'
        }
      },
      status: {
        method: 'GET',
        path: '/api/v1/status',
        description: 'Health check'
      },
      info: {
        method: 'GET',
        path: '/api/v1/info',
        description: 'API information'
      }
    },
    supportedPlatforms: {
      youtube: {
        status: 'fully_supported',
        features: ['download', 'metadata', 'multiple_qualities', 'channel_info'],
        exampleUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      },
      instagram: {
        status: 'fully_supported',
        features: ['download_reels', 'download_posts', 'metadata'],
        limitations: ['no_private_accounts', 'stories_limited'],
        exampleUrl: 'https://www.instagram.com/reel/DUbE_v2EiFA/'
      },
      tiktok: {
        status: 'fully_supported',
        features: ['download', 'metadata', 'statistics'],
        limitations: ['watermark_present', 'no_private_videos'],
        exampleUrl: 'https://www.tiktok.com/@username/video/1234567890123456789'
      },
      snapchat: {
        status: 'limited_support',
        features: ['metadata_only'],
        limitations: ['no_direct_download', 'use_screen_recording'],
        exampleUrl: 'https://www.snapchat.com/add/username'
      }
    },
    rateLimit: {
      enabled: true,
      requests: 100,
      window: '15 seconds'
    }
  });
};

module.exports = {
  analyzeUrl,
  downloadUrl,
  getStatus,
  getApiInfo
};