const axios = require('axios');
const ytdl = require('@distube/ytdl-core');
const path = require('path');
const fs = require('fs');
const logger = require('../Logger/logger');

// Optional platform-specific packages
let instatouch, TikTokScraper, Playwright;

// Lazy load optional dependencies
try {
  instatouch = require('instatouch');
  logger.info('✅ instatouch loaded for Instagram support');
} catch (e) {
  logger.warn('⚠️  instatouch not installed - Instagram support limited');
  instatouch = null;
}

try {
  TikTokScraper = require('tiktok-downloader');
  logger.info('✅ tiktok-downloader loaded for TikTok support');
} catch (e) {
  logger.warn('⚠️  tiktok-downloader not installed - TikTok support limited');
  TikTokScraper = null;
}

try {
  Playwright = require('playwright');
  logger.info('✅ Playwright loaded for advanced scraping');
} catch (e) {
  logger.warn('⚠️  Playwright not installed - Advanced scraping unavailable');
  Playwright = null;
}

const DOWNLOAD_DIR = path.join(__dirname, '../../downloads');

// Create downloads directory
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  logger.info(`Created downloads directory at ${DOWNLOAD_DIR}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PLATFORM DETECTION & VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const detectPlatform = (url) => {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'youtube';
  if (urlLower.includes('instagram.com')) return 'instagram';
  if (urlLower.includes('tiktok.com') || urlLower.includes('vm.tiktok.com')) return 'tiktok';
  if (urlLower.includes('snapchat.com')) return 'snapchat';
  if (urlLower.includes('facebook.com') || urlLower.includes('fb.watch')) return 'facebook';
  if (urlLower.includes('x.com') || urlLower.includes('twitter.com')) return 'twitter';
  if (urlLower.includes('reddit.com')) return 'reddit';
  if (urlLower.includes('twitch.tv')) return 'twitch';
  
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
// YOUTUBE HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const extractYoutubeVideoId = (url) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

const getYoutubeInfo = async (url) => {
  try {
    const videoId = extractYoutubeVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL - could not extract video ID');
    
    logger.info(`[YOUTUBE] Extracted video ID: ${videoId}`);
    
    // Try @distube/ytdl-core first
    try {
      const info = await ytdl.getInfo(url);
      const formats = info.formats
        .filter(f => f.hasVideo && f.hasAudio && f.mimeType)
        .sort((a, b) => (b.height || 0) - (a.height || 0))
        .slice(0, 10);

      logger.info(`[YOUTUBE] Successfully fetched info: ${info.videoDetails.title}`);

      return {
        success: true,
        platform: 'youtube',
        title: info.videoDetails.title,
        duration: parseInt(info.videoDetails.lengthSeconds),
        durationFormatted: formatDuration(parseInt(info.videoDetails.lengthSeconds)),
        thumbnail: info.videoDetails.thumbnail.thumbnails.pop().url,
        uploader: info.videoDetails.author.name,
        uploadDate: info.videoDetails.uploadDate,
        description: info.videoDetails.description,
        views: info.videoDetails.viewCount,
        isPlayable: !info.videoDetails.isPrivate && !info.videoDetails.isUnlisted,
        videoId: videoId,
        webpage_url: url,
        formats: formats.map(f => ({
          itag: f.itag,
          quality: f.qualityLabel || 'unknown',
          codec: f.mimeType,
          height: f.height,
          width: f.width,
          fps: f.fps
        }))
      };
    } catch (ytdlError) {
      logger.warn(`[YOUTUBE] @distube/ytdl-core failed: ${ytdlError.message}`);
      
      // Fallback to oEmbed API (metadata only)
      const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const response = await axios.get(oEmbedUrl, { timeout: 10000 });
      const data = response.data;

      return {
        success: true,
        platform: 'youtube',
        title: data.title,
        duration: null,
        durationFormatted: null,
        thumbnail: data.thumbnail_url,
        uploader: data.author_name,
        uploadDate: null,
        description: null,
        views: null,
        isPlayable: true,
        videoId: videoId,
        webpage_url: url,
        formats: []
      };
    }
  } catch (error) {
    logger.error(`[YOUTUBE] Failed to fetch info: ${error.message}`);
    throw new Error(`YouTube: ${error.message}`);
  }
};

const downloadYoutube = async (url, quality = '360p') => {
  try {
    const metadata = await getYoutubeInfo(url);
    const title = metadata.title || 'video';
    const safeTitle = sanitizeFilename(title).slice(0, 80);
    const filename = `${safeTitle}_${Date.now()}.mp4`;
    const filePath = path.join(DOWNLOAD_DIR, filename);

    logger.info(`[YOUTUBE] Downloading to: ${filePath}`);

    const videoStream = ytdl(url, {
      quality: 'highest',
      filter: 'audioandvideo'
    });

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      
      videoStream.pipe(writeStream);

      videoStream.on('error', (err) => {
        logger.error(`[YOUTUBE] Stream error: ${err.message}`);
        fs.unlink(filePath, () => {});
        reject(new Error('Failed to download video stream'));
      });

      writeStream.on('finish', () => {
        const fileSize = fs.statSync(filePath).size;
        logger.info(`[YOUTUBE] Download complete: ${filename} (${fileSize} bytes)`);
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

      writeStream.on('error', (err) => {
        logger.error(`[YOUTUBE] Write error: ${err.message}`);
        fs.unlink(filePath, () => {});
        reject(new Error('Failed to write video file'));
      });
    });
  } catch (error) {
    logger.error(`[YOUTUBE] Download failed: ${error.message}`);
    throw error;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INSTAGRAM HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const getInstagramInfo = async (url) => {
  try {
    logger.info(`[INSTAGRAM] Fetching info for: ${url}`);

    // Method 1: Using instatouch if available
    if (instatouch) {
      try {
        const scraper = new instatouch.Instatouch();
        const reelId = url.match(/\/reel\/([^/?]+)/)?.[1] || 
                       url.match(/\/p\/([^/?]+)/)?.[1];
        
        if (!reelId) throw new Error('Could not extract Instagram post ID');

        const post = await scraper.getPostInfo({ id: reelId });
        
        return {
          success: true,
          platform: 'instagram',
          title: post.caption?.substring(0, 100) || 'Instagram Video',
          description: post.caption || null,
          thumbnail: post.thumbnail || null,
          uploader: post.author?.username || 'Unknown',
          uploadDate: post.timestamp || null,
          duration: post.duration || null,
          views: post.statistics?.plays || null,
          likes: post.statistics?.diggCount || null,
          downloadUrl: post.video || post.image,
          webpage_url: url,
          type: url.includes('/reel/') ? 'reel' : 'post'
        };
      } catch (instatouchError) {
        logger.warn(`[INSTAGRAM] instatouch failed: ${instatouchError.message}`);
      }
    }

    // Method 2: Custom API endpoint (Instagram doesn't provide official API for downloads)
    // This uses an alternative service
    const instagramApiUrl = `https://api.instazoo.com/api/v1/post?url=${encodeURIComponent(url)}`;
    const response = await axios.get(instagramApiUrl, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.data.success) {
      const data = response.data.data;
      return {
        success: true,
        platform: 'instagram',
        title: data.caption?.substring(0, 100) || 'Instagram Video',
        description: data.caption || null,
        thumbnail: data.thumbnail_url || null,
        uploader: data.author || 'Unknown',
        uploadDate: data.timestamp || null,
        duration: data.duration || null,
        views: data.views || null,
        downloadUrl: data.video_url || data.image_url,
        webpage_url: url
      };
    }

    throw new Error('Unable to fetch Instagram data');
  } catch (error) {
    logger.error(`[INSTAGRAM] Failed to fetch info: ${error.message}`);
    throw new Error(`Instagram: ${error.message}`);
  }
};

const downloadInstagram = async (url) => {
  try {
    const metadata = await getInstagramInfo(url);
    const title = metadata.title || 'instagram_video';
    const safeTitle = sanitizeFilename(title).slice(0, 80);
    const filename = `${safeTitle}_${Date.now()}.mp4`;
    const filePath = path.join(DOWNLOAD_DIR, filename);

    logger.info(`[INSTAGRAM] Downloading to: ${filePath}`);

    if (!metadata.downloadUrl) {
      throw new Error('No downloadable content found');
    }

    const response = await axios.get(metadata.downloadUrl, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      response.data.pipe(writeStream);

      writeStream.on('finish', () => {
        const fileSize = fs.statSync(filePath).size;
        logger.info(`[INSTAGRAM] Download complete: ${filename}`);
        resolve({
          success: true,
          filename,
          downloadUrl: `/downloads/${filename}`,
          filesize: fileSize,
          platform: 'instagram',
          title: metadata.title,
          uploader: metadata.uploader
        });
      });

      writeStream.on('error', (err) => {
        logger.error(`[INSTAGRAM] Write error: ${err.message}`);
        fs.unlink(filePath, () => {});
        reject(new Error('Failed to download content'));
      });
    });
  } catch (error) {
    logger.error(`[INSTAGRAM] Download failed: ${error.message}`);
    throw error;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIKTOK HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const getTiktokInfo = async (url) => {
  try {
    logger.info(`[TIKTOK] Fetching info for: ${url}`);

    // Extract video ID from TikTok URL
    const videoId = url.match(/\/video\/(\d+)/) || url.match(/v\/(\d+)/) || url.match(/\.(\d+)/);
    if (!videoId) throw new Error('Could not extract TikTok video ID');

    // Method 1: Using tiktok-downloader if available
    if (TikTokScraper) {
      try {
        const data = await TikTokScraper.getVideo({ url });
        
        return {
          success: true,
          platform: 'tiktok',
          title: data.description || 'TikTok Video',
          description: data.description || null,
          thumbnail: data.cover,
          uploader: data.author?.name || 'Unknown',
          uploadDate: data.created_time ? new Date(data.created_time * 1000).toISOString() : null,
          duration: data.duration || null,
          views: data.statistics?.play_count || null,
          likes: data.statistics?.digg_count || null,
          comments: data.statistics?.comment_count || null,
          shares: data.statistics?.share_count || null,
          downloadUrl: data.video?.downloadAddr || data.video?.playAddr,
          downloadUrlNoWatermark: data.video?.dynamicCover,
          webpage_url: url
        };
      } catch (tikTokError) {
        logger.warn(`[TIKTOK] tiktok-downloader failed: ${tikTokError.message}`);
      }
    }

    // Method 2: Using TikTok's oEmbed endpoint
    const oEmbedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await axios.get(oEmbedUrl, { timeout: 10000 });
    const data = response.data;

    // Method 3: Fallback to alternative API
    const apiResponse = await axios.get(`https://api.tiktok.com/v1/post?url=${encodeURIComponent(url)}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }).catch(() => ({ data: null }));

    return {
      success: true,
      platform: 'tiktok',
      title: apiResponse.data?.title || data.title || 'TikTok Video',
      description: apiResponse.data?.description || data.title || null,
      thumbnail: data.thumbnail_url,
      uploader: data.author_name || 'Unknown',
      uploadDate: null,
      duration: null,
      downloadUrl: apiResponse.data?.video_url || null,
      webpage_url: url
    };
  } catch (error) {
    logger.error(`[TIKTOK] Failed to fetch info: ${error.message}`);
    throw new Error(`TikTok: ${error.message}`);
  }
};

const downloadTiktok = async (url) => {
  try {
    const metadata = await getTiktokInfo(url);
    const title = metadata.title || 'tiktok_video';
    const safeTitle = sanitizeFilename(title).slice(0, 80);
    const filename = `${safeTitle}_${Date.now()}.mp4`;
    const filePath = path.join(DOWNLOAD_DIR, filename);

    logger.info(`[TIKTOK] Downloading to: ${filePath}`);

    if (!metadata.downloadUrl) {
      throw new Error('No downloadable content found');
    }

    const response = await axios.get(metadata.downloadUrl, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      response.data.pipe(writeStream);

      writeStream.on('finish', () => {
        const fileSize = fs.statSync(filePath).size;
        logger.info(`[TIKTOK] Download complete: ${filename}`);
        resolve({
          success: true,
          filename,
          downloadUrl: `/downloads/${filename}`,
          filesize: fileSize,
          platform: 'tiktok',
          title: metadata.title,
          uploader: metadata.uploader
        });
      });

      writeStream.on('error', (err) => {
        logger.error(`[TIKTOK] Write error: ${err.message}`);
        fs.unlink(filePath, () => {});
        reject(new Error('Failed to download content'));
      });
    });
  } catch (error) {
    logger.error(`[TIKTOK] Download failed: ${error.message}`);
    throw error;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SNAPCHAT HANDLER (Limited support - requires browser automation)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const getSnapchatInfo = async (url) => {
  try {
    logger.info(`[SNAPCHAT] Fetching info for: ${url}`);

    // Snapchat doesn't provide official download capabilities
    // The following is informational only
    const username = url.match(/(?:add|username)=([^&]+)/) || url.match(/\/([^/?]+)$/);
    
    if (!username) {
      throw new Error('Could not extract Snapchat username or story ID');
    }

    return {
      success: true,
      platform: 'snapchat',
      title: 'Snapchat Story/Content',
      description: 'Snapchat content cannot be downloaded directly due to platform restrictions',
      thumbnail: null,
      uploader: username[1],
      uploadDate: null,
      duration: null,
      views: null,
      downloadUrl: null,
      webpage_url: url,
      note: 'Snapchat actively restricts content downloading. Consider using screen recording instead.'
    };
  } catch (error) {
    logger.error(`[SNAPCHAT] Failed to fetch info: ${error.message}`);
    throw new Error(`Snapchat: ${error.message}`);
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITY FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN PUBLIC FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const getInfo = async (url) => {
  if (!isValidUrl(url)) {
    throw new Error('Invalid URL provided');
  }

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

const downloadMedia = async (url, quality = 'best') => {
  if (!isValidUrl(url)) {
    throw new Error('Invalid URL provided');
  }

  const platform = detectPlatform(url);

  switch (platform) {
    case 'youtube':
      return await downloadYoutube(url, quality);
    case 'instagram':
      return await downloadInstagram(url);
    case 'tiktok':
      return await downloadTiktok(url);
    case 'snapchat':
      throw new Error('Snapchat content cannot be downloaded directly due to platform restrictions');
    default:
      throw new Error(`Platform '${platform}' is not currently supported`);
  }
};

module.exports = {
  getInfo,
  downloadMedia,
  detectPlatform,
  DOWNLOAD_DIR,
  sanitizeFilename,
  formatDuration,
  // Expose individual platform handlers for advanced usage
  getYoutubeInfo,
  downloadYoutube,
  getInstagramInfo,
  downloadInstagram,
  getTiktokInfo,
  downloadTiktok,
  getSnapchatInfo
};