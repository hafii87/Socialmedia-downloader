const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const logger = require('../Logger/logger');
const play = require('play-dl');

const execAsync = promisify(exec);
const DOWNLOAD_DIR = path.join(__dirname, '../../downloads');

// Create downloads directory if it doesn't exist
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  logger.info(` Created downloads directory at ${DOWNLOAD_DIR}`);
}

// Check if yt-dlp is installed
let ytDlpAvailable = false;
(async () => {
  try {
    await execAsync('yt-dlp --version');
    ytDlpAvailable = true;
    logger.info(' yt-dlp is available');
  } catch (e) {
    logger.warn('⚠️  yt-dlp not found. Install with: pip install yt-dlp');
  }
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PLATFORM DETECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const detectPlatform = (url) => {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'youtube';
  if (urlLower.includes('instagram.com')) return 'instagram';
  if (urlLower.includes('tiktok.com') || urlLower.includes('vm.tiktok.com')) return 'tiktok';
  if (urlLower.includes('snapchat.com')) return 'snapchat';
  
  return 'unknown';
};

const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITY FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-zA-Z0-9_\-\s]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 100);
};

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

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// YT-DLP UNIVERSAL DOWNLOADER (Works for YouTube, Instagram, TikTok)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const getInfoWithYtDlp = async (url) => {
  try {
    logger.info(`Fetching info with yt-dlp for: ${url}`);
    
    const command = `yt-dlp --dump-json --no-warnings "${url}"`;
    const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 });
    
    const info = JSON.parse(stdout);
    
    return {
      success: true,
      platform: info.extractor_key?.toLowerCase() || detectPlatform(url),
      title: info.title || 'Unknown',
      description: info.description || null,
      thumbnail: info.thumbnail || null,
      uploader: info.uploader || info.channel || 'Unknown',
      uploadDate: info.upload_date || null,
      duration: info.duration || null,
      durationFormatted: formatDuration(info.duration),
      views: info.view_count || null,
      likes: info.like_count || null,
      comments: info.comment_count || null,
      webpage_url: url,
      isPlayable: true
    };
  } catch (error) {
    logger.error(`yt-dlp info error: ${error.message}`);
    throw error;
  }
};

const downloadWithYtDlp = async (url, platform) => {
  try {
    logger.info(`Downloading with yt-dlp: ${url}`);
    
    const timestamp = Date.now();
    const outputTemplate = path.join(DOWNLOAD_DIR, `${platform}_%(title).50s_${timestamp}.%(ext)s`);
    
    // Build command based on platform
    let command = `yt-dlp -f best --no-warnings -o "${outputTemplate}" "${url}"`;
    
    if (platform === 'instagram') {
      command = `yt-dlp --no-warnings -o "${outputTemplate}" "${url}"`;
    } else if (platform === 'tiktok') {
      command = `yt-dlp --no-warnings -o "${outputTemplate}" "${url}"`;
    }
    
    logger.info(`Executing: ${command}`);
    const { stdout, stderr } = await execAsync(command, { 
      maxBuffer: 1024 * 1024 * 50,
      timeout: 120000 // 2 minutes timeout
    });
    
    logger.info(`yt-dlp output: ${stdout}`);
    if (stderr) logger.warn(`yt-dlp stderr: ${stderr}`);
    
    // Find the downloaded file
    const files = fs.readdirSync(DOWNLOAD_DIR)
      .filter(f => f.startsWith(platform) && f.includes(timestamp.toString()))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(DOWNLOAD_DIR, a));
        const statB = fs.statSync(path.join(DOWNLOAD_DIR, b));
        return statB.mtimeMs - statA.mtimeMs;
      });
    
    if (files.length === 0) {
      throw new Error('Download completed but file not found');
    }
    
    const filename = files[0];
    const filePath = path.join(DOWNLOAD_DIR, filename);
    const fileSize = fs.statSync(filePath).size;
    
    logger.info(`Downloaded: ${filename} (${formatFileSize(fileSize)})`);
    
    return {
      success: true,
      filename,
      downloadUrl: `/downloads/${filename}`,
      filesize: fileSize,
      platform
    };
  } catch (error) {
    logger.error(`yt-dlp download error: ${error.message}`);
    throw error;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// YOUTUBE HANDLER (play-dl as primary, yt-dlp as fallback)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const extractYoutubeVideoId = (url) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

const getYoutubeInfo = async (url) => {
  try {
    logger.info(`Fetching YouTube metadata for: ${url}`);
    
    try {
      const videoId = extractYoutubeVideoId(url);
      if (!videoId) throw new Error('Invalid YouTube URL');
      
      const info = await play.video_info(url);
      const videoDetails = info.video_details;
      
      return {
        success: true,
        platform: 'youtube',
        title: videoDetails.title,
        duration: videoDetails.durationInSec,
        durationFormatted: videoDetails.durationRaw,
        thumbnail: videoDetails.thumbnails?.[0]?.url || null,
        uploader: videoDetails.channel?.name || 'Unknown',
        uploadDate: videoDetails.uploadedAt || null,
        description: videoDetails.description || null,
        views: videoDetails.views || 0,
        isPlayable: true,
        videoId: videoId,
        webpage_url: url
      };
    } catch (playDlError) {
      logger.warn(`play-dl failed, trying yt-dlp: ${playDlError.message}`);
      if (ytDlpAvailable) {
        return await getInfoWithYtDlp(url);
      }
      throw playDlError;
    }
  } catch (error) {
    logger.error(`YouTube info error: ${error.message}`);
    throw new Error(`YouTube: ${error.message}`);
  }
};

const downloadYoutube = async (url, quality = '360p') => {
  try {
    logger.info(`Starting YouTube download: ${url}`);
    
    try {
      const metadata = await getYoutubeInfo(url);
      const safeTitle = sanitizeFilename(metadata.title);
      const filename = `${safeTitle}_${Date.now()}.mp4`;
      const filePath = path.join(DOWNLOAD_DIR, filename);

      const stream = await play.stream(url, {
        quality: 2,
        discordPlayerCompatibility: false
      });

      const writeStream = fs.createWriteStream(filePath);
      
      return new Promise((resolve, reject) => {
        stream.stream.pipe(writeStream);

        stream.stream.on('error', (err) => {
          logger.error(`Stream error: ${err.message}`);
          fs.unlink(filePath, () => {});
          reject(err);
        });

        writeStream.on('finish', () => {
          const fileSize = fs.statSync(filePath).size;
          logger.info(` YouTube download complete: ${filename}`);
          
          resolve({
            success: true,
            filename,
            downloadUrl: `/downloads/${filename}`,
            filesize: fileSize,
            platform: 'youtube',
            title: metadata.title,
            uploader: metadata.uploader,
            thumbnail: metadata.thumbnail
          });
        });

        writeStream.on('error', reject);
      });
    } catch (playDlError) {
      logger.warn(`play-dl failed, trying yt-dlp: ${playDlError.message}`);
      if (ytDlpAvailable) {
        return await downloadWithYtDlp(url, 'youtube');
      }
      throw playDlError;
    }
  } catch (error) {
    logger.error(`YouTube download error: ${error.message}`);
    throw error;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INSTAGRAM HANDLER (yt-dlp only - most reliable)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const getInstagramInfo = async (url) => {
  try {
    logger.info(`Fetching Instagram info for: ${url}`);
    
    if (ytDlpAvailable) {
      return await getInfoWithYtDlp(url);
    }
    
    // Fallback basic info
    const shortcode = url.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/)?.[1];
    return {
      success: true,
      platform: 'instagram',
      title: 'Instagram Content',
      description: 'Instagram post or reel',
      thumbnail: null,
      uploader: 'Instagram User',
      webpage_url: url,
      type: url.includes('/reel/') ? 'reel' : 'post',
      shortcode,
      note: 'Install yt-dlp for full functionality: pip install yt-dlp'
    };
  } catch (error) {
    logger.error(`Instagram info error: ${error.message}`);
    throw new Error(`Instagram: ${error.message}`);
  }
};

const downloadInstagram = async (url) => {
  try {
    logger.info(`Starting Instagram download: ${url}`);
    
    if (!ytDlpAvailable) {
      throw new Error('yt-dlp is required for Instagram downloads. Install with: pip install yt-dlp');
    }
    
    return await downloadWithYtDlp(url, 'instagram');
  } catch (error) {
    logger.error(`Instagram download error: ${error.message}`);
    throw new Error(`Instagram download failed: ${error.message}`);
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIKTOK HANDLER (yt-dlp only - most reliable)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const getTiktokInfo = async (url) => {
  try {
    logger.info(`Fetching TikTok info for: ${url}`);
    
    if (ytDlpAvailable) {
      return await getInfoWithYtDlp(url);
    }
    
    // Fallback basic info
    return {
      success: true,
      platform: 'tiktok',
      title: 'TikTok Video',
      description: 'TikTok video content',
      thumbnail: null,
      uploader: 'TikTok User',
      webpage_url: url,
      note: 'Install yt-dlp for full functionality: pip install yt-dlp'
    };
  } catch (error) {
    logger.error(`TikTok info error: ${error.message}`);
    throw new Error(`TikTok: ${error.message}`);
  }
};

const downloadTiktok = async (url, watermark = false) => {
  try {
    logger.info(`Starting TikTok download: ${url}`);
    
    if (!ytDlpAvailable) {
      throw new Error('yt-dlp is required for TikTok downloads. Install with: pip install yt-dlp');
    }
    
    return await downloadWithYtDlp(url, 'tiktok');
  } catch (error) {
    logger.error(`TikTok download error: ${error.message}`);
    throw new Error(`TikTok download failed: ${error.message}`);
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SNAPCHAT HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const getSnapchatInfo = async (url) => {
  if (ytDlpAvailable) {
    try {
      return await getInfoWithYtDlp(url);
    } catch (e) {
      logger.warn(`Snapchat yt-dlp failed: ${e.message}`);
    }
  }
  
  return {
    success: true,
    platform: 'snapchat',
    title: 'Snapchat Content',
    description: 'Snapchat Spotlight or Story',
    thumbnail: null,
    uploader: 'Snapchat User',
    webpage_url: url,
    note: 'Snapchat content may have restrictions'
  };
};

const downloadSnapchat = async (url) => {
  if (ytDlpAvailable) {
    try {
      return await downloadWithYtDlp(url, 'snapchat');
    } catch (e) {
      logger.error(`Snapchat download failed: ${e.message}`);
    }
  }
  
  throw new Error('Snapchat downloads require yt-dlp. Install with: pip install yt-dlp');
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN PUBLIC FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const getInfo = async (url) => {
  if (!isValidUrl(url)) {
    throw new Error('Invalid URL provided');
  }

  logger.info(`Analyze request for URL: ${url}`);
  const platform = detectPlatform(url);

  switch (platform) {
    case 'youtube':
      return await getYoutubeInfo(url);
    case 'instagram':
      return await getInstagramInfo(url);
    case 'tiktok':
      return await getTiktokInfo(url);
    case 'snapchat':
      return await getSnapchatInfo(url);
    default:
      throw new Error(`Platform '${platform}' is not currently supported`);
  }
};

const downloadMedia = async (url, options = {}) => {
  if (!isValidUrl(url)) {
    throw new Error('Invalid URL provided');
  }

  logger.info(`Download request for URL: ${url}`);
  const platform = detectPlatform(url);

  switch (platform) {
    case 'youtube':
      return await downloadYoutube(url, options.quality);
    case 'instagram':
      return await downloadInstagram(url);
    case 'tiktok':
      return await downloadTiktok(url, options.watermark);
    case 'snapchat':
      return await downloadSnapchat(url);
    default:
      throw new Error(`Platform '${platform}' is not currently supported for downloads`);
  }
};

module.exports = {
  getInfo,
  downloadMedia,
  detectPlatform,
  DOWNLOAD_DIR,
  sanitizeFilename,
  formatDuration,
  ytDlpAvailable
};