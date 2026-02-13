const { getInfo, downloadMedia } = require('../services/downloader.service');
const logger = require('../Logger/logger');

/**
 * POST /api/v1/analyze
 * Analyzes a URL and returns metadata
 */
const analyzeUrl = async (req, res, next) => {
  try {
    const { url } = req.body;

    logger.info(`Analyze request for URL: ${url}`);

    // Call the service layer
    const info = await getInfo(url);

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
        isPlayable: info.isPlayable,
        availableFormats: info.formats || []
      }
    });
  } catch (error) {
    logger.error(`Analyze error: ${error.message}`);
    
    // Return proper error response
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to analyze URL'
    });
  }
};

/**
 * POST /api/v1/download
 * Downloads media and returns a download link
 */
const downloadUrl = async (req, res, next) => {
  try {
    const { url } = req.body;

    logger.info(`Download request for URL: ${url}`);

    // Call the service layer
    const downloadInfo = await downloadMedia(url);

    // Return download link
    return res.status(200).json({
      success: true,
      data: {
        filename: downloadInfo.filename,
        downloadUrl: downloadInfo.downloadUrl,
        filesize: downloadInfo.filesize,
        platform: downloadInfo.platform,
        title: downloadInfo.title,
        message: 'File ready for download'
      }
    });
  } catch (error) {
    logger.error(`Download error: ${error.message}`);
    
    // Return proper error response
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to download media'
    });
  }
};

/**
 * GET /api/v1/status
 * Simple health check endpoint
 */
const getStatus = (req, res) => {
  return res.status(200).json({
    success: true,
    status: 'API is running',
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  analyzeUrl,
  downloadUrl,
  getStatus
};
