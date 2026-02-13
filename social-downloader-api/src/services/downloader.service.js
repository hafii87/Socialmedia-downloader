const axios = require('axios');
const ytdl = require('@distube/ytdl-core');
let igdl, TikTokScraper;
try {
  igdl = require('instagram-url-direct');
} catch (e) { igdl = null; }
try {
  TikTokScraper = require('tiktok-scraper');
} catch (e) { TikTokScraper = null; }
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
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
 * Extract video ID from YouTube URL
 */
const extractVideoId = (url) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

/**
 * Fetch metadata using YouTube oEmbed endpoint
 */
const getInfo = async (url) => {
  try {
    logger.info(`Fetching metadata for URL: ${url}`);
    const platform = detectPlatform(url);

    if (platform === 'youtube') {
      const videoId = extractVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL - could not extract video ID');
      }
      logger.info(`Extracted video ID: ${videoId}`);
      // Use YouTube oEmbed API
      const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      let oembedData;
      try {
        const oembedResponse = await axios.get(oEmbedUrl, { 
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        oembedData = oembedResponse.data;
      } catch (oembedError) {
        logger.warn(`oEmbed API failed: ${oembedError.message}`);
        throw new Error('Could not fetch video metadata');
      }
      logger.info(`Successfully fetched metadata for ${platform}: ${oembedData.title}`);
      return {
        success: true,
        platform,
        title: oembedData.title || 'Untitled',
        duration: null,
        durationFormatted: null,
        thumbnail: oembedData.thumbnail_url || null,
        uploader: oembedData.author_name || 'Unknown',
        uploadDate: null,
        description: null,
        webpage_url: url,
        formats: [],
        isPlayable: true,
        videoId: videoId
      };
    }

    if (platform === 'instagram') {
      if (!igdl) throw new Error('Instagram support not installed');
      const results = await igdl.getInfo(url);
      if (!results || !results.url_list || !results.url_list.length) throw new Error('No downloadable video found');
      return {
        success: true,
        platform,
        title: results.title || 'Instagram Video',
        duration: null,
        durationFormatted: null,
        thumbnail: results.thumbnail || null,
        uploader: results.author || 'Unknown',
        uploadDate: null,
        description: results.caption || null,
        webpage_url: url,
        formats: results.url_list,
        isPlayable: true
      };
    }

    if (platform === 'tiktok') {
      if (!TikTokScraper) throw new Error('TikTok support not installed');
      const videoMeta = await TikTokScraper.getVideoMeta(url);
      if (!videoMeta || !videoMeta.collector || !videoMeta.collector.length) throw new Error('No downloadable video found');
      const info = videoMeta.collector[0];
      return {
        success: true,
        platform,
        title: info.text || 'TikTok Video',
        duration: null,
        durationFormatted: null,
        thumbnail: info.videoUrl || null,
        uploader: info.authorMeta.name || 'Unknown',
        uploadDate: info.createTime || null,
        description: info.text || null,
        webpage_url: url,
        formats: [info.videoUrl],
        isPlayable: true
      };
    }

    throw new Error(`Platform '${platform}' is not supported.`);
  } catch (error) {
    logger.error(`Failed to fetch info for ${url}:`, error.message);
    throw new Error(error.message || 'Failed to fetch video information');
  }
};

/**
 * Download media file - Using a reliable method
 * This version handles the download more efficiently
 */
const downloadMedia = async (url) => {
  try {
    logger.info(`Starting download for URL: ${url}`);
    const platform = detectPlatform(url);
    if (platform === 'youtube') {
      // Get metadata
      const metadata = await getInfo(url);
      const title = metadata.title || 'video';
      // Sanitize filename
      const safeTitle = (title || 'video')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 80);
      const filename = `${safeTitle}_${Date.now()}.mp4`;
      const filePath = path.join(DOWNLOAD_DIR, filename);
      logger.info(`Downloading video to: ${filePath}`);
      // Download video using ytdl-core
      const videoStream = ytdl(url, { quality: 'highest', filter: 'audioandvideo' });
      await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(filePath);
        videoStream.pipe(writeStream);
        videoStream.on('error', (err) => {
          logger.error(`ytdl stream error: ${err.message}`);
          fs.unlink(filePath, () => {});
          reject(new Error('Failed to download video stream'));
        });
        writeStream.on('finish', resolve);
        writeStream.on('error', (err) => {
          logger.error(`File write error: ${err.message}`);
          fs.unlink(filePath, () => {});
          reject(new Error('Failed to write video file'));
        });
      });
      const fileSize = fs.statSync(filePath).size;
      logger.info(`Download complete: ${filename} (${fileSize} bytes)`);
      return {
        success: true,
        filename,
        filepath: filePath,
        downloadUrl: `/downloads/${filename}`,
        filesize: fileSize,
        platform,
        title,
        videoId: metadata.videoId,
        thumbnail: metadata.thumbnail,
        uploader: metadata.uploader
      };
    }

    // For Instagram and TikTok
    const info = await getInfo(url);
    const videoUrl = info.formats[0];
    const title = info.title || 'video';
    const safeTitle = title.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').slice(0, 80);
    const filename = `${safeTitle}_${Date.now()}.mp4`;
    const filePath = path.join(DOWNLOAD_DIR, filename);
    // Download the video file
    const response = await axios.get(videoUrl, { responseType: 'stream' });
    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      response.data.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    const fileSize = fs.statSync(filePath).size;
    return {
      success: true,
      filename,
      filepath: filePath,
      downloadUrl: `/downloads/${filename}`,
      filesize: fileSize,
      platform,
      title
    };
  } catch (error) {
    logger.error(`Download failed for ${url}:`, error.message);
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