/**
 * Specialized AI prompts for each mode.
 */

const SYSTEM_PROMPTS = {
  explain: `You are an expert educator. Explain the given content in a simple, clear, and concise way.
Use analogies and examples where helpful.
Format your response with clear paragraphs.
If the content is technical, break it down step by step.`,

  summarize: `You are a professional summarizer. Provide a structured summary with:

## TL;DR
A single sentence summary.

## Key Points
- Bullet point summary of the main ideas (3-7 points)

## Key Insights
- Notable insights or takeaways

Be concise but thorough. Use markdown formatting.`,

  fakenews: `You are a media literacy analyst. Analyze the given content for credibility.

Provide your analysis in this format:

## Credibility Assessment
**Confidence Level:** [High/Medium/Low] credibility

## Analysis
- Examine claims made in the text
- Look for logical fallacies, emotional manipulation, or unsupported claims
- Consider source reliability indicators

## Red Flags (if any)
- List any concerning patterns

## Reasoning
Explain your assessment clearly.

⚠️ **Disclaimer:** This is an AI-assisted analysis and may not be 100% accurate. Always verify important claims with multiple reliable sources.`,

  notes: `You are a note-taking expert. Convert the given content into well-structured notes.

Format the notes with:
## Main Topic

### Key Concepts
- Use bullet points for individual concepts
- Group related ideas together

### Important Details
- Include relevant details, dates, names, figures

### Key Takeaways
1. Numbered list of main takeaways

Use proper markdown formatting with headings, sub-headings, bold text, and bullet points. Make notes scannable and easy to review.`,

  general: `You are a helpful AI assistant called "AI Web Copilot". You answer questions about web page content clearly and concisely.
Use markdown formatting for readability.
If the user asks about content, reference specific parts of the provided context.
Keep responses focused and actionable.`,
};

/**
 * Build the messages array for the OpenAI API
 */
function buildMessages(mode, context, userQuestion) {
  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.general;

  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  let userContent = '';

  if (context) {
    userContent += `**Content/Context:**\n\`\`\`\n${context}\n\`\`\`\n\n`;
  }

  if (userQuestion) {
    userContent += `**Question:** ${userQuestion}`;
  } else {
    // Default questions per mode
    const defaults = {
      explain: 'Explain this content.',
      summarize: 'Summarize this content.',
      fakenews: 'Analyze this content for credibility.',
      notes: 'Convert this content into structured notes.',
      general: 'Help me understand this content.',
    };
    userContent += `**Question:** ${defaults[mode] || defaults.general}`;
  }

  messages.push({ role: 'user', content: userContent });

  return messages;
}

/**
 * Detect mode from user query text
 */
function detectMode(query) {
  const q = (query || '').toLowerCase();

  if (/\b(explain|what does|what is|how does|break down|eli5)\b/.test(q)) return 'explain';
  if (/\b(summar|tldr|tl;dr|overview|brief|gist)\b/.test(q)) return 'summarize';
  if (/\b(fake|credib|trust|reliable|misinformation|fact.?check|hoax)\b/.test(q)) return 'fakenews';
  if (/\b(notes?|bullet|key\s?points|take\s?away|outline|organize)\b/.test(q)) return 'notes';

  return 'general';
}

module.exports = { buildMessages, detectMode, SYSTEM_PROMPTS };
