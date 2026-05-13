// background.js — Service Worker: handles Gemini & NVIDIA API calls

'use strict';

importScripts('system-prompt.js');

// ─── Error Parsers ────────────────────────────────────────────────────────────
function parseGeminiError(errorMessage) {
  const msg = String(errorMessage).toUpperCase();
  if (msg.includes('API_KEY_INVALID') || msg.includes('400'))
    return 'Invalid Gemini API key. Go to ⚙️ Settings and re-enter your key.';
  if (msg.includes('QUOTA_EXCEEDED') || msg.includes('429'))
    return 'Gemini quota exceeded. Please wait a moment and try again.';
  if (msg.includes('SAFETY'))
    return 'Content blocked by Gemini safety filters. Try a different conversation.';
  if (msg.includes('TOO_LONG') || msg.includes('413'))
    return 'Page content is too large for Gemini. Try a shorter conversation.';
  if (msg.includes('RESOURCE_EXHAUSTED'))
    return 'Gemini rate limit hit. Wait 60 seconds and try again.';
  if (msg.includes('FAILED_PRECONDITION'))
    return 'Gemini API unavailable. Check your internet and try again.';
  return `Gemini Error: ${errorMessage}`;
}

function parseNvidiaError(status, body) {
  if (status === 401) return 'Invalid NVIDIA API key. Go to ⚙️ Settings and re-enter your key.';
  if (status === 402) return 'NVIDIA credits exhausted. Check your usage at build.nvidia.com.';
  if (status === 429) return 'NVIDIA rate limit hit. Wait a moment and try again.';
  if (status === 400) return `NVIDIA bad request: ${body?.detail || body?.error?.message || 'check your model name.'}`;
  return `NVIDIA Error ${status}: ${body?.detail || body?.error?.message || 'Unknown error'}`;
}

// ─── Gemini API ───────────────────────────────────────────────────────────────
async function callGeminiAPI(apiKey, model, content, templateId) {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: buildSystemPrompt(templateId) }]
        },
        contents: [{
          parts: [{ text: content }]
        }],
        generationConfig: {
          temperature:     0.3,
          maxOutputTokens: 8192,
          topP:            0.8
        }
      })
    });
  } catch (networkErr) {
    throw new Error(`Network error: ${networkErr.message}. Check your internet connection.`);
  }

  if (!response.ok) {
    let errBody = {};
    try { errBody = await response.json(); } catch (_) {}
    const rawMsg = errBody?.error?.message || `HTTP ${response.status}`;
    throw new Error(parseGeminiError(rawMsg));
  }

  let data;
  try { data = await response.json(); }
  catch (_) { throw new Error('Invalid response from Gemini. Please try again.'); }

  const candidate = data?.candidates?.[0];
  if (!candidate) throw new Error('Gemini returned no candidates. Content may have been filtered.');

  if (candidate.finishReason === 'SAFETY')
    throw new Error('Content blocked by Gemini safety filters. Try a different conversation.');

  const text = candidate?.content?.parts?.[0]?.text || '';
  if (!text.trim()) throw new Error('Gemini returned an empty response. Please try again.');

  if (candidate.finishReason === 'MAX_TOKENS')
    return text + '\n\n---\n*Note: Output was truncated at max tokens.*';

  return text;
}

// ─── NVIDIA NIM API ───────────────────────────────────────────────────────────
async function callNvidiaAPI(apiKey, model, content, templateId) {
  let response;
  try {
    response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt(templateId) },
          { role: 'user',   content }
        ],
        temperature: 0.3,
        max_tokens:  8192
      })
    });
  } catch (networkErr) {
    throw new Error(`Network error: ${networkErr.message}. Check your internet connection.`);
  }

  let body = {};
  try { body = await response.json(); } catch (_) {}

  if (!response.ok) throw new Error(parseNvidiaError(response.status, body));

  const text = body?.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('NVIDIA returned an empty response. Please try again.');

  return text;
}

// ─── Message Listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CALL_AI') {
    const { provider, apiKey, model, content, templateId } = message;

    if (!apiKey) {
      sendResponse({ error: 'No API key provided. Please set your API key in Settings.' });
      return true;
    }
    if (!content || content.trim().length === 0) {
      sendResponse({ error: 'No content received to process.' });
      return true;
    }
    if (!model) {
      sendResponse({ error: 'No model specified.' });
      return true;
    }

    const call = provider === 'nvidia'
      ? callNvidiaAPI(apiKey, model, content, templateId)
      : callGeminiAPI(apiKey, model, content, templateId);

    call
      .then(markdown => sendResponse({ markdown }))
      .catch(err     => sendResponse({ error: err.message }));

    return true; // Keep async channel open
  }
});
