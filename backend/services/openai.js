/**
 * Google Gemini service – handles completions and streaming.
 * Uses the official @google/generative-ai SDK.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL = 'gemini-flash-latest';

function prepareGeminiRequest(messages) {
  // Extract system prompt (if any)
  const systemMessage = messages.find(m => m.role === 'system');
  const systemInstruction = systemMessage ? systemMessage.content : undefined;

  // Filter out the system prompt, prepare user/model messages
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  return { systemInstruction, contents };
}

async function getCompletion(messages) {
  const { systemInstruction, contents } = prepareGeminiRequest(messages);
  
  const model = genAI.getGenerativeModel({ 
    model: MODEL,
    systemInstruction
  });

  const result = await model.generateContent({ contents });
  return {
    content: result.response.text(),
    usage: null,
    model: MODEL,
  };
}

async function getStreamingCompletion(messages, onChunk) {
  const { systemInstruction, contents } = prepareGeminiRequest(messages);
  
  const model = genAI.getGenerativeModel({ 
    model: MODEL,
    systemInstruction
  });

  const result = await model.generateContentStream({ contents });
  let fullContent = '';

  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    if (chunkText) {
      fullContent += chunkText;
      onChunk(chunkText);
    }
  }

  return { content: fullContent };
}

module.exports = { getCompletion, getStreamingCompletion };
