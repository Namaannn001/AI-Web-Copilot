/**
 * AI route handlers – standard and streaming endpoints.
 */

const { buildMessages, detectMode } = require('../services/prompts');
const { getCompletion, getStreamingCompletion } = require('../services/openai');
const cache = require('../services/cache');

const MAX_CONTEXT_LENGTH = 3000;

/**
 * POST /api/ai
 * Body: { mode?, context?, question? }
 */
async function handleAIRequest(req, res) {
  try {
    let { mode, context, question } = req.body;

    // Auto-detect mode if not specified
    if (!mode || mode === 'auto') {
      mode = detectMode(question);
    }

    // Truncate context
    if (context && context.length > MAX_CONTEXT_LENGTH) {
      context = context.slice(0, MAX_CONTEXT_LENGTH) + '\n\n[... content truncated for length]';
    }

    // Check cache
    const cached = cache.get(mode, context, question);
    if (cached) {
      return res.json({
        response: cached,
        mode,
        cached: true,
      });
    }

    const messages = buildMessages(mode, context, question);
    const result = await getCompletion(messages);

    // Store in cache
    cache.set(mode, context, question, result.content);

    res.json({
      response: result.content,
      mode,
      cached: false,
      usage: result.usage,
    });
  } catch (err) {
    console.error('[AI Error]', err.message);

    if (err.status === 401) {
      return res.status(401).json({ error: 'Invalid API key. Check your XAI_API_KEY in .env' });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: 'Grok API rate limit reached. Please try again later.' });
    }

    res.status(500).json({ error: 'Failed to get AI response. Please try again.' });
  }
}

/**
 * POST /api/ai/stream
 * Body: { mode?, context?, question? }
 * Returns Server-Sent Events
 */
async function handleStreamRequest(req, res) {
  try {
    let { mode, context, question } = req.body;

    if (!mode || mode === 'auto') {
      mode = detectMode(question);
    }

    if (context && context.length > MAX_CONTEXT_LENGTH) {
      context = context.slice(0, MAX_CONTEXT_LENGTH) + '\n\n[... content truncated for length]';
    }

    // Check cache first
    const cached = cache.get(mode, context, question);
    if (cached) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ chunk: cached, done: true, cached: true })}\n\n`);
      return res.end();
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send mode info
    res.write(`data: ${JSON.stringify({ mode, started: true })}\n\n`);

    const messages = buildMessages(mode, context, question);
    let fullResponse = '';

    await getStreamingCompletion(messages, (chunk) => {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });

    // Cache the full response
    cache.set(mode, context, question, fullResponse);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[Stream Error]', err.message);

    if (!res.headersSent) {
      res.status(500).json({ error: 'Streaming failed.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
}

module.exports = { handleAIRequest, handleStreamRequest };
