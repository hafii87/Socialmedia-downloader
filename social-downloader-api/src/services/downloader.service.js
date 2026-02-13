const { spawn } = require('child_process');
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
 * Execute yt-dlp command
 */
const executeYtDlp = (args) => {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || 'yt-dlp command failed'));
      } else {
        resolve(stdout);
      }
    });

    ytdlp.on('error', (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}. Make sure yt-dlp is installed system-wide.`));
    });
  });
};

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
    
    const args = [
      '--dump-json',
      '--no-warnings',
      '--skip-download',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      url
    ];

    const output = await executeYtDlp(args);
    const info = JSON.parse(output);
    const platform = detectPlatform(url);
    
    logger.info(`Successfully fetched metadata for ${platform}: ${info.title}`);

    return {
      success: true,
      platform,
      title: info.title || 'Untitled',
      duration: info.duration || null,
      durationFormatted: formatDuration(info.duration),
      thumbnail: info.thumbnail || null,
      uploader: info.uploader || info.channel || 'Unknown',
      uploadDate: info.upload_date || null,
      description: info.description || null,
      webpage_url: info.webpage_url || url,
      formats: (info.formats || []).map(f => ({
        quality: f.format_note || (f.height ? `${f.height}p` : 'unknown'),
        ext: f.ext || 'unknown',
        filesize: f.filesize || null,
        fps: f.fps || null,
        vcodec: f.vcodec || null,
        acodec: f.acodec || null
      })).filter(f => f.ext !== 'mhtml'),
      isPlayable: true
    };
  } catch (error) {
    logger.error(`Failed to fetch info for ${url}:`, error);
    
    let errorMessage = error.message;
    
    if (errorMessage.includes('Failed to start yt-dlp')) {
      errorMessage = 'yt-dlp is not installed. Install it with: pip install yt-dlp';
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * Download media file
 */
const downloadMedia = async (url) => {
  try {
    logger.info(`Starting download for URL: ${url}`);
    
    const info = await getInfo(url);
    
    if (!info.success) {
      throw new Error('Could not retrieve media information');
    }

    const safeTitle = (info.title || 'video')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80);
    
    const outputTemplate = path.join(DOWNLOAD_DIR, `${safeTitle}-%(id)s.%(ext)s`);
    logger.info(`Downloading to: ${outputTemplate}`);

    const args = [
      '-o', outputTemplate,
      '--no-playlist',
      '--restrict-filenames',
      '--quiet',
      '--no-warnings',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      url
    ];

    await executeYtDlp(args);

    const allFiles = fs.readdirSync(DOWNLOAD_DIR);
    const downloadedFile = allFiles.find(f => f.includes(safeTitle));

    if (!downloadedFile) {
      throw new Error('File not found after download');
    }

    const filePath = path.join(DOWNLOAD_DIR, downloadedFile);
    const fileSize = fs.statSync(filePath).size;

    logger.info(`Download complete: ${downloadedFile} (${fileSize} bytes)`);

    return {
      success: true,
      filename: downloadedFile,
      filepath: filePath,
      downloadUrl: `/downloads/${downloadedFile}`,
      filesize: fileSize,
      platform: info.platform,
      title: info.title
    };
  } catch (error) {
    logger.error(`Download failed for ${url}:`, error);
    throw new Error(error.message);
  }
};

/**
 * Format duration
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