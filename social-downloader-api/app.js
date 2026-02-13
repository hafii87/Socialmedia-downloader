require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const logger = require('./src/Logger/logger');
const errorHandler = require('./src/middlewares/error.middleware');

// Import routes
const downloaderRoutes = require('./src/routes/downloader.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────────────────────────────────
// MIDDLEWARE SETUP
// ──────────────────────────────────────────────────────────────────────

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: false, // Allow cross-origin resource sharing for downloads
}));

// CORS middleware - CRITICAL FIX
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    process.env.CORS_ORIGIN || '*'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ──────────────────────────────────────────────────────────────────────
// STATIC FILES & FRONTEND
// ──────────────────────────────────────────────────────────────────────

// Serve frontend from public directory
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // Set proper cache headers for HTML/JS/CSS
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Serve downloaded files with proper headers
app.use('/downloads', express.static(path.join(__dirname, 'downloads'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Disposition', 'attachment'); // Force download
  }
}));

// ──────────────────────────────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────────────────────────────

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/v1', downloaderRoutes);

// Serve index.html for root path (SPA)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ──────────────────────────────────────────────────────────────────────
// 404 HANDLER
// ──────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `${req.method} ${req.originalUrl} does not exist`
  });
});

// ──────────────────────────────────────────────────────────────────────
// ERROR HANDLING MIDDLEWARE (Must be last)
// ──────────────────────────────────────────────────────────────────────

app.use(errorHandler);

// ──────────────────────────────────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  logger.info(`📝 Logs stored in ./logs directory`);
  logger.info(`⬇️  Downloads stored in ./downloads directory`);
  logger.info(`🌐 Open http://localhost:${PORT} in your browser`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;