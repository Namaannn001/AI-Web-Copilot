require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { handleAIRequest, handleStreamRequest } = require('./routes/ai');
const { getCacheStats, clearCache } = require('./services/cache');

const helmet = require('helmet');

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────
app.use(helmet());
app.use(express.json({ limit: '50kb' }));

// Basic Security Auth: Prevent random bots/scripts from hitting your backend and draining credits
app.use((req, res, next) => {
  const secretKey = process.env.EXTENSION_SECRET_KEY;
  if (!secretKey) return next(); // If no secret is set in .env, allow all for local dev
  
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${secretKey}`) {
    return res.status(401).json({ error: 'Unauthorized: Invalid extension secret key.' });
  }
  next();
});

app.use(cors({
  origin: process.env.CORS_ORIGIN === '*' ? '*' : process.env.CORS_ORIGIN?.split(','),
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please try again later.',
    retryAfter: '15 minutes',
  },
});
app.use('/api/', limiter);

// ── Routes ─────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cache: getCacheStats(),
  });
});

app.post('/api/ai', handleAIRequest);
app.post('/api/ai/stream', handleStreamRequest);

app.post('/api/cache/clear', (_req, res) => {
  clearCache();
  res.json({ status: 'cache_cleared' });
});

// ── Error handling ────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✦ AI Web Copilot Backend`);
  console.log(`  ├─ Port: ${PORT}`);
  console.log(`  ├─ Health: http://localhost:${PORT}/api/health`);
  console.log(`  └─ Ready!\n`);
});
