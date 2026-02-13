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
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
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
// ROUTES
// ──────────────────────────────────────────────────────────────────────

// Welcome endpoint
/*
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Social Downloader API is running',
    version: '1.0.0',
    endpoints: {
      analyze: 'POST /api/v1/analyze',
      download: 'POST /api/v1/download',
      status: 'GET /api/v1/status'
    }
  });
});
*/

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));


// API routes
app.use('/api/v1', downloaderRoutes);

// Serve downloaded files
app.use('/downloads', express.static(path.join(__dirname, 'downloads'), {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));


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
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;