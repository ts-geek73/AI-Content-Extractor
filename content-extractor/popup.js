// popup.js — Popup state machine & extraction orchestrator

'use strict';

// ─── State Machine ────────────────────────────────────────────────────────────
const STATES = {
  NO_KEY:     'no_key',
  READY:      'ready',
  READING:    'reading',
  PROCESSING: 'processing',
  SUCCESS:    'success',
  ERROR:      'error'
};

let currentState = STATES.NO_KEY;

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const views = {
  apiKey:   document.getElementById('viewApiKey'),
  main:     document.getElementById('viewMain'),
  progress: document.getElementById('viewProgress'),
  result:   document.getElementById('viewResult')
};

const els = {
  apiKeyInput:      document.getElementById('apiKeyInput'),
  toggleVisibility: document.getElementById('toggleVisibility'),
  btnSaveKey:       document.getElementById('btnSaveKey'),
  btnExtract:       document.getElementById('btnExtract'),
  btnSettings:      document.getElementById('btnSettings'),
  btnAgain:         document.getElementById('btnAgain'),
  btnChangeKey:     document.getElementById('btnChangeKey'),
  platformDot:      document.getElementById('platformDot'),
  platformName:     document.getElementById('platformName'),
  platformStatus:   document.getElementById('platformStatus'),
  platformEmoji:    document.getElementById('platformEmoji'),
  progressIcon:     document.getElementById('progressIcon'),
  progressTitle:    document.getElementById('progressTitle'),
  progressSub:      document.getElementById('progressSub'),
  progressBar:      document.getElementById('progressBar'),
  progressPct:      document.getElementById('progressPct'),
  resultIcon:       document.getElementById('resultIcon'),
  resultTitle:      document.getElementById('resultTitle'),
  resultMsg:        document.getElementById('resultMsg'),
  resultBox:        document.getElementById('resultBox')
};

// ─── View Switching ───────────────────────────────────────────────────────────
function showView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName].classList.add('active');
}

// ─── State Management ─────────────────────────────────────────────────────────
function setState(state, payload = {}) {
  currentState = state;

  switch (state) {
    case STATES.NO_KEY:
      showView('apiKey');
      els.btnSettings.style.display = 'none';
      break;

    case STATES.READY:
      showView('main');
      els.btnSettings.style.display = 'flex';
      detectPlatform();
      break;

    case STATES.READING:
      showView('progress');
      setProgress('⏳', 'Reading page content…', 'Scanning the conversation DOM…', 20);
      break;

    case STATES.PROCESSING:
      showView('progress');
      setProgress('🤖', 'Processing with Gemini AI…', 'Converting content to clean Markdown…', 65);
      break;

    case STATES.SUCCESS:
      showView('result');
      els.resultIcon.textContent = '✅';
      els.resultTitle.textContent = 'Done!';
      els.resultTitle.className = 'result-title success';
      els.resultMsg.textContent = 'Your Markdown file has been downloaded successfully.';
      els.resultBox.className = 'result-box success-box';
      els.resultBox.textContent = `📄 ${payload.filename || 'content.md'} — ready to open in any Markdown viewer.`;
      break;

    case STATES.ERROR:
      showView('result');
      els.resultIcon.textContent = '❌';
      els.resultTitle.textContent = 'Something went wrong';
      els.resultTitle.className = 'result-title error';
      els.resultMsg.textContent = 'Here\'s what happened:';
      els.resultBox.className = 'result-box error-box';
      els.resultBox.textContent = payload.message || 'An unknown error occurred.';
      break;
  }
}

function setProgress(icon, title, sub, pct) {
  els.progressIcon.textContent = icon;
  els.progressTitle.textContent = title;
  els.progressSub.textContent = sub;
  els.progressBar.style.width = pct + '%';
  els.progressPct.textContent = pct + '%';
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────
async function saveApiKey(key) {
  await chrome.storage.local.set({ geminiApiKey: key });
}

async function loadApiKey() {
  const result = await chrome.storage.local.get('geminiApiKey');
  return result.geminiApiKey || null;
}

async function clearApiKey() {
  await chrome.storage.local.remove('geminiApiKey');
}

// ─── Platform Detection ───────────────────────────────────────────────────────
async function detectPlatform() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';

    if (url.includes('claude.ai')) {
      els.platformDot.className = 'platform-dot';
      els.platformName.textContent = 'Claude.ai';
      els.platformStatus.textContent = 'Supported · Ready to extract';
      els.platformEmoji.textContent = '🟣';
      els.btnExtract.disabled = false;
    } else if (url.includes('chatgpt.com')) {
      els.platformDot.className = 'platform-dot';
      els.platformName.textContent = 'ChatGPT';
      els.platformStatus.textContent = 'Supported · Ready to extract';
      els.platformEmoji.textContent = '🟢';
      els.btnExtract.disabled = false;
    } else {
      els.platformDot.className = 'platform-dot unsupported';
      els.platformName.textContent = 'Unsupported Page';
      els.platformStatus.textContent = 'Open Claude.ai or ChatGPT first';
      els.platformEmoji.textContent = '🔴';
      els.btnExtract.disabled = true;
    }
  } catch (e) {
    els.platformDot.className = 'platform-dot unknown';
    els.platformName.textContent = 'Cannot detect page';
    els.platformStatus.textContent = 'Check extension permissions';
    els.platformEmoji.textContent = '🟡';
    els.btnExtract.disabled = true;
  }
}

// ─── File Download ────────────────────────────────────────────────────────────
function downloadMarkdown(markdownContent) {
  const now = new Date();
  const datetime = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `content-${datetime}.md`;

  const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

// ─── Main Extraction Flow ─────────────────────────────────────────────────────
async function startExtraction() {
  const apiKey = await loadApiKey();
  if (!apiKey) {
    setState(STATES.NO_KEY);
    return;
  }

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {
    setState(STATES.ERROR, { message: 'Cannot access current tab. Check permissions.' });
    return;
  }

  const url = tab?.url || '';
  if (!url.includes('claude.ai') && !url.includes('chatgpt.com')) {
    setState(STATES.ERROR, { message: 'Please open Claude.ai or ChatGPT first, then click Extract.' });
    return;
  }

  // — STEP 1: Inject content.js and read DOM —
  setState(STATES.READING);

  try {
    // Guard against re-injection by trying the injection — content.js uses its own guard
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  } catch (e) {
    // Script may already be injected — that's fine, proceed to message
  }

  // Give the script a moment to register its listener
  await sleep(150);

  let extractResult;
  try {
    extractResult = await sendMessageWithTimeout(tab.id, { action: 'EXTRACT' }, 30000);
  } catch (e) {
    setState(STATES.ERROR, { message: `Extraction timed out: ${e.message}` });
    return;
  }

  if (extractResult?.error) {
    setState(STATES.ERROR, { message: extractResult.error });
    return;
  }

  const { cleanedText, imageUrls } = extractResult;

  if (!cleanedText || cleanedText.trim().length < 50) {
    setState(STATES.ERROR, { message: 'No conversation content found on this page. Make sure a conversation is open.' });
    return;
  }

  // Enforce 30,000 char limit to avoid Gemini token overflow
  const truncated = cleanedText.length > 30000
    ? cleanedText.slice(0, 30000) + '\n\n[... content truncated for length ...]'
    : cleanedText;

  const contentPayload = buildContentPayload(truncated, imageUrls);

  // — STEP 2: Call Gemini via background.js —
  setState(STATES.PROCESSING);
  setProgress('🤖', 'Processing with Gemini AI…', 'Analyzing and structuring your conversation…', 65);

  let geminiResult;
  try {
    geminiResult = await sendMessageWithTimeout(
      null, // background.js — use chrome.runtime.sendMessage
      { action: 'CALL_GEMINI', apiKey, content: contentPayload },
      60000
    );
  } catch (e) {
    setState(STATES.ERROR, { message: `Gemini call failed: ${e.message}` });
    return;
  }

  if (geminiResult?.error) {
    setState(STATES.ERROR, { message: geminiResult.error });
    return;
  }

  setProgress('📝', 'Finalizing download…', 'Creating your Markdown file…', 95);
  await sleep(400);

  // — STEP 3: Download —
  const filename = downloadMarkdown(geminiResult.markdown);

  setState(STATES.SUCCESS, { filename });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Send message to tab or background, with a timeout promise */
function sendMessageWithTimeout(tabId, message, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), timeoutMs);

    const callback = (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    };

    if (tabId !== null) {
      chrome.tabs.sendMessage(tabId, message, callback);
    } else {
      chrome.runtime.sendMessage(message, callback);
    }
  });
}

/** Combine cleaned text and image URLs into one prompt payload */
function buildContentPayload(cleanedText, imageUrls = []) {
  let payload = cleanedText;
  if (imageUrls && imageUrls.length > 0) {
    payload += '\n\n---\n## EXTRACTED IMAGE URLS\n';
    imageUrls.forEach((url, i) => {
      payload += `${i + 1}. ${url}\n`;
    });
  }
  return payload;
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

// Toggle API key visibility
els.toggleVisibility.addEventListener('click', () => {
  const input = els.apiKeyInput;
  if (input.type === 'password') {
    input.type = 'text';
    els.toggleVisibility.textContent = '🙈';
  } else {
    input.type = 'password';
    els.toggleVisibility.textContent = '👁️';
  }
});

// Save API key
els.btnSaveKey.addEventListener('click', async () => {
  const key = els.apiKeyInput.value.trim();
  if (!key || key.length < 10) {
    els.apiKeyInput.style.borderColor = '#f87171';
    els.apiKeyInput.placeholder = 'Please enter a valid API key…';
    setTimeout(() => { els.apiKeyInput.style.borderColor = ''; }, 2000);
    return;
  }
  els.btnSaveKey.disabled = true;
  els.btnSaveKey.innerHTML = '<span>⏳</span> Saving…';
  await saveApiKey(key);
  els.apiKeyInput.value = '';
  setState(STATES.READY);
  els.btnSaveKey.disabled = false;
  els.btnSaveKey.innerHTML = '<span>💾</span> Save Key &amp; Continue';
});

// Allow Enter key in API key input
els.apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') els.btnSaveKey.click();
});

// Settings button — go back to key setup
els.btnSettings.addEventListener('click', () => {
  setState(STATES.NO_KEY);
});

// Extract button
els.btnExtract.addEventListener('click', startExtraction);

// Try again after result
els.btnAgain.addEventListener('click', () => setState(STATES.READY));

// Change key from result screen
els.btnChangeKey.addEventListener('click', async () => {
  await clearApiKey();
  setState(STATES.NO_KEY);
});

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  const key = await loadApiKey();
  if (key) {
    setState(STATES.READY);
  } else {
    setState(STATES.NO_KEY);
  }
})();
