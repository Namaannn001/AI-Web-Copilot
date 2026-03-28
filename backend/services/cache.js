/**
 * Simple in-memory cache with TTL to reduce redundant API calls.
 */

const crypto = require('crypto');

const cache = new Map();
const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 200;

function generateKey(mode, context, question) {
  const raw = `${mode}::${context?.slice(0, 500)}::${question}`;
  return crypto.createHash('md5').update(raw).digest('hex');
}

function get(mode, context, question) {
  const key = generateKey(mode, context, question);
  const entry = cache.get(key);

  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  entry.hits++;
  return entry.value;
}

function set(mode, context, question, value, ttl = DEFAULT_TTL) {
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }

  const key = generateKey(mode, context, question);
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
    hits: 0,
    createdAt: Date.now(),
  });
}

function getCacheStats() {
  return {
    entries: cache.size,
    maxEntries: MAX_ENTRIES,
  };
}

function clearCache() {
  cache.clear();
}

module.exports = { get, set, getCacheStats, clearCache };
