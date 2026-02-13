const ytdl = require('ytdl-core');
const path = require('path');
const fs = require('fs');
const logger = require('../Logger/logger');

const DOWNLOAD_DIR = path.join(__dirname, '../../downloads');

// Create downloads directory if it doesn't exist
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  logger.info(`Created downloads directory at ${DOWNLOAD_DIR}`);
}

/**
 * Detect the platform from URL
 */
const detectPlatform = (url) => {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'youtube';
  if (urlLower.includes('instagram.com')) return 'instagram';
  if (urlLower.includes('tiktok.com')) return 'tiktok';
  if (urlLower.includes('facebook.com')) return 'facebook';
  if (urlLower.includes('x.com') || urlLower.includes('twitter.com')) return 'twitter';
  if (urlLower.includes('reddit.com')) return 'reddit';
  if (urlLower.includes('twitch.tv')) return 'twitch';
  
  return 'unknown';
};

/**
 * Fetch metadata about the media
 */
const getInfo = async (url) => {
  try {
    logger.info(`Fetching metadata for URL: ${url}`);
    
    const platform = detectPlatform(url);
    
    // Currently only YouTube is fully supported
    if (platform !== 'youtube') {
      throw new Error(`Platform '${platform}' is not yet fully supported. Currently only YouTube is supported.`);
    }

    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
      throw new Error('Invalid or unsupported YouTube URL');
    }

    const info = await ytdl.getInfo(url);
    
    logger.info(`Successfully fetched metadata for ${platform}: ${info.videoDetails.title}`);

    // Extract format information
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio')
      .concat(ytdl.filterFormats(info.formats, 'video'))
      .slice(0, 5); // Get top 5 formats

    return {
      success: true,
      platform,
      title: info.videoDetails.title || 'Untitled',
      duration: info.videoDetails.lengthSeconds || null,
      durationFormatted: formatDuration(parseInt(info.videoDetails.lengthSeconds)),
      thumbnail: info.videoDetails.thumbnail?.thumbnails?.[0]?.url || null,
      uploader: info.videoDetails.author?.name || 'Unknown',
      uploadDate: info.videoDetails.publishDate || null,
      description: info.videoDetails.description || null,
      webpage_url: url,
      formats: formats.map(f => ({
        quality: f.qualityLabel || `${f.height}p` || 'unknown',
        ext: f.container || 'unknown',
        filesize: f.contentLength || null,
        fps: f.fps || null,
        vcodec: f.videoCodec || null,
        acodec: f.audioCodec || null
      })),
      isPlayable: true
    };
  } catch (error) {
    logger.error(`Failed to fetch info for ${url}:`, error);
    throw new Error(error.message || 'Failed to fetch video information');
  }
};

/**
 * Download media file
 */
const downloadMedia = async (url) => {
  try {
    logger.info(`Starting download for URL: ${url}`);
    
    const platform = detectPlatform(url);
    
    if (platform !== 'youtube') {
      throw new Error(`Platform '${platform}' is not yet fully supported. Currently only YouTube is supported.`);
    }

    if (!ytdl.validateURL(url)) {
      throw new Error('Invalid or unsupported YouTube URL');
    }

    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    
    // Sanitize filename
    const safeTitle = (title || 'video')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80);
    
    const filename = `${safeTitle}_${Date.now()}.mp4`;
    const filePath = path.join(DOWNLOAD_DIR, filename);
    
    logger.info(`Downloading to: ${filePath}`);

    // Get the best format
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'highest',
      filter: 'videoandaudio'
    });

    // Download the video
    return new Promise((resolve, reject) => {
      const stream = ytdl.downloadFromInfo(info, { format });
      const writeStream = fs.createWriteStream(filePath);

      stream.on('error', (err) => {
        logger.error(`Stream error: ${err.message}`);
        fs.unlink(filePath, () => {}); // Clean up partial file
        reject(new Error(`Download failed: ${err.message}`));
      });

      writeStream.on('error', (err) => {
        logger.error(`Write stream error: ${err.message}`);
        fs.unlink(filePath, () => {}); // Clean up partial file
        reject(new Error(`File write failed: ${err.message}`));
      });

      writeStream.on('finish', () => {
        const fileSize = fs.statSync(filePath).size;
        logger.info(`Download complete: ${filename} (${fileSize} bytes)`);

        resolve({
          success: true,
          filename,
          filepath: filePath,
          downloadUrl: `/downloads/${filename}`,
          filesize: fileSize,
          platform,
          title
        });
      });

      stream.pipe(writeStream);
    });
  } catch (error) {
    logger.error(`Download failed for ${url}:`, error);
    throw new Error(error.message || 'Download failed');
  }
};

/**
 * Format duration (seconds to HH:MM:SS)
 */
const formatDuration = (seconds) => {
  if (!seconds) return null;
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

module.exports = {
  getInfo,
  downloadMedia,
  detectPlatform,
  DOWNLOAD_DIR
};