// background.js — Service Worker: handles Gemini API calls

'use strict';

importScripts('system-prompt.js');

function parseGeminiError(errorMessage) {
  const msg = String(errorMessage).toUpperCase();
  if (msg.includes('API_KEY_INVALID') || msg.includes('400'))
    return 'Invalid API key. Please go to ⚙️ Settings and re-enter your Gemini key.';
  if (msg.includes('QUOTA_EXCEEDED') || msg.includes('429'))
    return 'Gemini quota exceeded. Please wait a moment and try again.';
  if (msg.includes('SAFETY'))
    return 'Content was blocked by Gemini\'s safety filters. Try on a different conversation.';
  if (msg.includes('TOO_LONG') || msg.includes('413'))
    return 'Page content is too large for Gemini. Try on a shorter conversation.';
  if (msg.includes('RESOURCE_EXHAUSTED'))
    return 'Gemini rate limit hit. Wait 60 seconds and try again.';
  if (msg.includes('FAILED_PRECONDITION'))
    return 'Gemini API is unavailable right now. Check your internet and try again.';
  return `Gemini Error: ${errorMessage}`;
}

async function callGeminiAPI(apiKey, content) {
  const GEMINI_MODEL = 'gemini-2.5-flash-lite';
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [{
          parts: [{ text: content }]
        }],
        generationConfig: {
          temperature:      0.3,
          maxOutputTokens:  8192,
          topP:             0.8
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
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new Error('Received an invalid response from Gemini. Please try again.');
  }

  const candidate = data?.candidates?.[0];
  if (!candidate) {
    throw new Error('Gemini returned no candidates. The content may have been filtered.');
  }

  const finishReason = candidate.finishReason;
  if (finishReason === 'SAFETY') {
    throw new Error('Content blocked by Gemini safety filters. Try on a different conversation.');
  }
  if (finishReason === 'MAX_TOKENS') {
    // Still return what we have, but note truncation
    const text = candidate?.content?.parts?.[0]?.text || '';
    return text + '\n\n---\n*Note: Output was truncated at max tokens. Consider using a shorter conversation.*';
  }

  const markdown = candidate?.content?.parts?.[0]?.text;
  if (!markdown || markdown.trim().length === 0) {
    throw new Error('Gemini returned an empty response. Please try again.');
  }

  return markdown;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CALL_GEMINI') {
    const { apiKey, content } = message;

    if (!apiKey) {
      sendResponse({ error: 'No API key provided. Please set your Gemini API key first.' });
      return true;
    }

    if (!content || content.trim().length === 0) {
      sendResponse({ error: 'No content received to process.' });
      return true;
    }

    callGeminiAPI(apiKey, content)
      .then(markdown => sendResponse({ markdown }))
      .catch(err    => sendResponse({ error: err.message }));

    return true; // Keep async channel open
  }
});
