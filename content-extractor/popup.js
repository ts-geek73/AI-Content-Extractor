'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_NVIDIA_MODEL = 'meta/llama-3.3-70b-instruct';

const BUILTIN_TEMPLATE_IDS = ['summary', 'methodology', 'plan', 'page_summary'];
const CHAT_TEMPLATE_IDS    = ['summary', 'methodology', 'plan'];
const PAGE_TEMPLATE_IDS    = ['page_summary'];
const EMOJI_OPTIONS = ['💬','🔁','🗺️','📰','🐛','📋','🔍','💡','📝','⚙️','🚀','🎯','📊','🔒','🧪','📦','🌐','✅'];

// ─── State ────────────────────────────────────────────────────────────────────
let provider          = 'gemini';
let selectedTemplate  = 'summary';
let currentStep       = 1;
let isPageMode        = false;
let allTemplates      = [];
let editingTemplateId = null;
let selectedEmoji     = '💡';

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = {
  stepDot1: $('stepDot1'), stepDot2: $('stepDot2'), stepDot3: $('stepDot3'),
  stepLine1: $('stepLine1'), stepLine2: $('stepLine2'),
  stepLabel1: $('stepLabel1'), stepLabel2: $('stepLabel2'), stepLabel3: $('stepLabel3'),
  step1: $('step1'), step2: $('step2'), step3: $('step3'),
  providerTabs: $('providerTabs'),
  paneGemini: $('paneGemini'), paneNvidia: $('paneNvidia'),
  geminiKey: $('geminiKey'), eyeGemini: $('eyeGemini'),
  nvidiaKey: $('nvidiaKey'), eyeNvidia: $('eyeNvidia'),
  btnSave: $('btnSave'), saveStatus: $('saveStatus'), btnNext: $('btnNext'),
  platformDot: $('platformDot'), platformName: $('platformName'),
  platformStatus: $('platformStatus'), modeIndicator: $('modeIndicator'),
  modelCardTitle: $('modelCardTitle'),
  modelGemini: $('modelGemini'), modelNvidia: $('modelNvidia'),
  geminiModel: $('geminiModel'), nvidiaModel: $('nvidiaModel'),
  templateList: $('templateList'), btnAddTemplate: $('btnAddTemplate'),
  statusBar: $('statusBar'), statusIcon: $('statusIcon'),
  statusText: $('statusText'), statusSub: $('statusSub'),
  progressFill: $('progressFill'), progressTrack: $('progressTrack'),
  btnExtract: $('btnExtract'), btnBack: $('btnBack'),
  editorTitle: $('editorTitle'), emojiPicker: $('emojiPicker'),
  tmplName: $('tmplName'), tmplDesc: $('tmplDesc'), tmplPrompt: $('tmplPrompt'),
  btnSaveTemplate: $('btnSaveTemplate'), btnDeleteTemplate: $('btnDeleteTemplate'),
  btnBackToRun: $('btnBackToRun'),
};

// ─── Step navigation ──────────────────────────────────────────────────────────
function goToStep(n) {
  currentStep = n;
  el.step1.classList.toggle('active', n === 1);
  el.step2.classList.toggle('active', n === 2);
  el.step3.classList.toggle('active', n === 3);

  el.stepDot1.className   = 'step-dot' + (n === 1 ? ' active' : ' done');
  el.stepLabel1.className = 'step-label' + (n === 1 ? ' active' : ' done');
  el.stepDot1.textContent = n > 1 ? '✓' : '1';
  el.stepLine1.className  = 'step-line' + (n > 1 ? ' done' : '');

  el.stepDot2.className   = 'step-dot' + (n === 2 ? ' active' : n > 2 ? ' done' : '');
  el.stepLabel2.className = 'step-label' + (n === 2 ? ' active' : n > 2 ? ' done' : '');
  el.stepDot2.textContent = n > 2 ? '✓' : '2';
  el.stepLine2.className  = 'step-line' + (n > 2 ? ' done' : '');

  el.stepDot3.className   = 'step-dot' + (n === 3 ? ' active' : '');
  el.stepLabel3.className = 'step-label' + (n === 3 ? ' active' : '');

  if (n === 2) { detectPlatform(); syncModelUI(); }
}

el.btnNext.addEventListener('click', () => goToStep(2));
el.btnBack.addEventListener('click', () => goToStep(1));
el.btnBackToRun.addEventListener('click', () => goToStep(2));

// ─── Provider tabs ────────────────────────────────────────────────────────────
function setProvider(p) {
  provider = p;
  el.paneGemini.style.display = p === 'gemini' ? 'block' : 'none';
  el.paneNvidia.style.display = p === 'nvidia' ? 'block' : 'none';
  el.providerTabs.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.p === p)
  );
  syncModelUI();
}
el.providerTabs.addEventListener('click', e => {
  const t = e.target.closest('.tab');
  if (t) setProvider(t.dataset.p);
});
function syncModelUI() {
  el.modelGemini.style.display  = provider === 'gemini' ? 'block' : 'none';
  el.modelNvidia.style.display  = provider === 'nvidia' ? 'block' : 'none';
  el.modelCardTitle.textContent = provider === 'gemini' ? '🤖 Gemini Model' : '🤖 NVIDIA Model';
}

// ─── Eye toggles ─────────────────────────────────────────────────────────────
function wireEye(btn, input) {
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? '🙈' : '👁️';
  });
}
wireEye(el.eyeGemini, el.geminiKey);
wireEye(el.eyeNvidia, el.nvidiaKey);

// ─── Storage ──────────────────────────────────────────────────────────────────
function load() {
  return chrome.storage.local.get([
    'provider','geminiKey','nvidiaKey','geminiModel','nvidiaModel',
    'selectedTemplate','customTemplates'
  ]);
}

// ─── Save key ─────────────────────────────────────────────────────────────────
el.btnSave.addEventListener('click', async () => {
  const inp = provider === 'gemini' ? el.geminiKey : el.nvidiaKey;
  const key = inp.value.trim();
  if (!key || key.length < 10) {
    inp.style.borderColor = '#f87171';
    setTimeout(() => { inp.style.borderColor = ''; }, 2000);
    return;
  }
  const data = { provider };
  if (provider === 'gemini') data.geminiKey = key;
  else                        data.nvidiaKey = key;
  await chrome.storage.local.set(data);
  inp.value = '';
  el.saveStatus.textContent = '✓ Saved';
  setTimeout(() => { el.saveStatus.textContent = ''; }, 2000);
  checkNextEnabled();
});
[el.geminiKey, el.nvidiaKey].forEach(inp =>
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') el.btnSave.click(); })
);
async function checkNextEnabled() {
  const s = await load();
  el.btnNext.disabled = !(provider === 'gemini' ? s.geminiKey : s.nvidiaKey);
}

// ─── Template storage helpers ─────────────────────────────────────────────────
async function loadTemplates() {
  const s = await load();
  if (s.customTemplates && s.customTemplates.length) {
    allTemplates = s.customTemplates;
  } else {
    // First run — seed built-ins with prompts from system-prompt.js
    allTemplates = [
      { id: 'summary',      emoji: '💬', label: 'Chat Session Summary',         desc: "What was discussed, decided, and what's still pending",          prompt: (typeof TEMPLATE_PROMPTS !== 'undefined' ? TEMPLATE_PROMPTS.summary      : '') || '' },
      { id: 'methodology',  emoji: '🔁', label: 'Extract Reusable Methodology', desc: 'Turn what worked into a repeatable step-by-step process',        prompt: (typeof TEMPLATE_PROMPTS !== 'undefined' ? TEMPLATE_PROMPTS.methodology  : '') || '' },
      { id: 'plan',         emoji: '🗺️', label: 'Plan Extraction',              desc: 'Pull out goals, features, priorities & tasks',                   prompt: (typeof TEMPLATE_PROMPTS !== 'undefined' ? TEMPLATE_PROMPTS.plan         : '') || '' },
      { id: 'page_summary', emoji: '📰', label: 'Page Summary',                 desc: 'Title, overview, key points & conclusion from any webpage',      prompt: (typeof TEMPLATE_PROMPTS !== 'undefined' ? TEMPLATE_PROMPTS.page_summary : '') || '' },
    ];
    await chrome.storage.local.set({ customTemplates: allTemplates });
  }
}
function saveTemplates() {
  return chrome.storage.local.set({ customTemplates: allTemplates });
}
function getPrompt(templateId) {
  const t = allTemplates.find(x => x.id === templateId);
  if (t && t.prompt) return t.prompt;
  if (typeof TEMPLATE_PROMPTS !== 'undefined' && TEMPLATE_PROMPTS[templateId]) return TEMPLATE_PROMPTS[templateId];
  return '';
}

// ─── Template rendering ───────────────────────────────────────────────────────
function renderTemplates() {
  const builtinIds = BUILTIN_TEMPLATE_IDS;
  const customOnly = allTemplates.filter(t => !builtinIds.includes(t.id));
  const visible = isPageMode
    ? allTemplates.filter(t => PAGE_TEMPLATE_IDS.includes(t.id))
    : [...allTemplates.filter(t => CHAT_TEMPLATE_IDS.includes(t.id)), ...customOnly];

  if (isPageMode) {
    selectedTemplate = 'page_summary';
  } else if (!visible.find(t => t.id === selectedTemplate)) {
    selectedTemplate = visible[0]?.id || 'summary';
  }

  el.templateList.innerHTML = '';
  visible.forEach(t => {
    const div = document.createElement('div');
    div.className = 'tmpl' + (t.id === selectedTemplate ? ' sel' : '');
    div.innerHTML =
      '<span class="tmpl-icon">' + t.emoji + '</span>' +
      '<div class="tmpl-info">' +
        '<div class="tmpl-name">' + escHtml(t.label) + '</div>' +
        '<div class="tmpl-desc">' + escHtml(t.desc)  + '</div>' +
      '</div>' +
      '<span class="tmpl-check">✓</span>' +
      '<button class="tmpl-edit" title="Edit template" data-id="' + t.id + '">✏️</button>';

    div.addEventListener('click', e => {
      if (e.target.closest('.tmpl-edit')) return;
      selectedTemplate = t.id;
      chrome.storage.local.set({ selectedTemplate: t.id });
      el.templateList.querySelectorAll('.tmpl').forEach(d => d.classList.remove('sel'));
      div.classList.add('sel');
    });
    div.querySelector('.tmpl-edit').addEventListener('click', e => {
      e.stopPropagation();
      openEditor(t.id);
    });
    el.templateList.appendChild(div);
  });
}

// ─── Template editor ──────────────────────────────────────────────────────────
function buildEmojiPicker() {
  el.emojiPicker.innerHTML = '';
  EMOJI_OPTIONS.forEach(em => {
    const span = document.createElement('span');
    span.className = 'emoji-opt' + (em === selectedEmoji ? ' sel-em' : '');
    span.textContent = em;
    span.addEventListener('click', () => {
      selectedEmoji = em;
      el.emojiPicker.querySelectorAll('.emoji-opt').forEach(s => s.classList.remove('sel-em'));
      span.classList.add('sel-em');
    });
    el.emojiPicker.appendChild(span);
  });
}

function openEditor(templateId) {
  editingTemplateId = templateId || null;
  if (templateId) {
    const t = allTemplates.find(x => x.id === templateId);
    if (!t) return;
    el.editorTitle.textContent = '✏️ Edit Template';
    selectedEmoji = t.emoji || '💡';
    el.tmplName.value   = t.label;
    el.tmplDesc.value   = t.desc;
    el.tmplPrompt.value = t.prompt || getPrompt(templateId);
    el.btnDeleteTemplate.style.display = 'flex';
  } else {
    el.editorTitle.textContent = '✏️ New Template';
    selectedEmoji = '💡';
    el.tmplName.value   = '';
    el.tmplDesc.value   = '';
    el.tmplPrompt.value = '';
    el.btnDeleteTemplate.style.display = 'none';
  }
  buildEmojiPicker();
  goToStep(3);
}

el.btnAddTemplate.addEventListener('click', () => openEditor(null));

el.btnSaveTemplate.addEventListener('click', async () => {
  const label  = el.tmplName.value.trim();
  const desc   = el.tmplDesc.value.trim();
  const prompt = el.tmplPrompt.value.trim();
  if (!label) {
    el.tmplName.style.borderColor = '#f87171';
    setTimeout(() => { el.tmplName.style.borderColor = ''; }, 2000);
    return;
  }
  if (editingTemplateId) {
    const idx = allTemplates.findIndex(t => t.id === editingTemplateId);
    if (idx !== -1) allTemplates[idx] = { ...allTemplates[idx], emoji: selectedEmoji, label, desc, prompt };
  } else {
    allTemplates.push({ id: 'custom_' + Date.now(), emoji: selectedEmoji, label, desc, prompt });
  }
  await saveTemplates();
  renderTemplates();
  goToStep(2);
});

el.btnDeleteTemplate.addEventListener('click', async () => {
  if (!editingTemplateId) return;
  allTemplates = allTemplates.filter(t => t.id !== editingTemplateId);
  if (selectedTemplate === editingTemplateId) {
    selectedTemplate = isPageMode ? 'page_summary' : 'summary';
    await chrome.storage.local.set({ selectedTemplate });
  }
  await saveTemplates();
  renderTemplates();
  goToStep(2);
});

// ─── Platform detection ───────────────────────────────────────────────────────
async function detectPlatform() {
  const s = await load();
  const hasKey = provider === 'nvidia' ? !!s.nvidiaKey : !!s.geminiKey;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url   = tab?.url || '';
    const onClaude  = url.includes('claude.ai');
    const onChatGPT = url.includes('chatgpt.com');
    isPageMode = !onClaude && !onChatGPT;

    if (isPageMode) {
      let hostname = '';
      const pageTitle = tab?.title || '';
      try { hostname = new URL(url).hostname; } catch (_) { hostname = url; }
      const displayTitle  = pageTitle.length > 30 ? pageTitle.slice(0, 30) + '…' : pageTitle;
      const displayDomain = hostname.length  > 30 ? hostname.slice(0, 30)  + '…' : hostname;
      const statusText = hasKey ? 'Ready to summarize' : 'Save your API key first';
      setDot(hasKey ? 'ok' : 'err', displayTitle || displayDomain, statusText);
      if (displayTitle && displayDomain) el.platformStatus.textContent = displayDomain;
      if (el.modeIndicator) { el.modeIndicator.textContent = 'Page Summarizer'; el.modeIndicator.className = 'mode-badge page'; }
      el.btnExtract.innerHTML = '<span>📄</span> Summarize Page';
      el.btnExtract.disabled  = !hasKey;
      if (!hasKey) showStatus('🔑', 'No API key saved', 'Go back and save your key', 0, 'error');
      else el.statusBar.className = 'status-bar';
    } else {
      setDot('ok', onClaude ? 'Claude.ai' : 'ChatGPT', hasKey ? 'Ready to extract' : 'Save your API key first');
      if (el.modeIndicator) { el.modeIndicator.textContent = 'Chat Extraction'; el.modeIndicator.className = 'mode-badge chat'; }
      el.btnExtract.innerHTML = '<span>⚡</span> Extract &amp; Convert';
      el.btnExtract.disabled  = !hasKey;
      if (!hasKey) showStatus('🔑', 'No API key saved', 'Go back and save your key', 0, 'error');
      else el.statusBar.className = 'status-bar';
    }
    renderTemplates();
  } catch (_) {
    setDot('', 'Cannot detect tab', 'Check permissions');
    el.btnExtract.disabled = true;
  }
}
function setDot(cls, name, status) {
  el.platformDot.className      = 'dot' + (cls ? ' ' + cls : '');
  el.platformName.textContent   = name;
  el.platformStatus.textContent = status;
}

// ─── Status bar ───────────────────────────────────────────────────────────────
function showStatus(icon, text, sub, pct, type) {
  type = type || '';
  el.statusBar.className         = 'status-bar show' + (type ? ' ' + type : '');
  el.statusIcon.textContent      = icon;
  el.statusText.textContent      = text;
  el.statusSub.textContent       = sub;
  el.progressFill.style.width    = pct + '%';
  el.progressTrack.style.display = type ? 'none' : 'block';
}

// ─── Extract ──────────────────────────────────────────────────────────────────
el.btnExtract.addEventListener('click', async () => {
  const s      = await load();
  const apiKey = provider === 'gemini' ? s.geminiKey : s.nvidiaKey;
  let model;
  if (provider === 'gemini') model = el.geminiModel.value || s.geminiModel || 'gemini-2.5-flash';
  else                        model = el.nvidiaModel.value.trim() || s.nvidiaModel || DEFAULT_NVIDIA_MODEL;
  if (provider === 'gemini') chrome.storage.local.set({ geminiModel: model });
  else                        chrome.storage.local.set({ nvidiaModel: model });

  if (!apiKey) { showStatus('🔑', 'No API key saved', 'Go back and save your key', 0, 'error'); return; }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // ── Page_Mode ──────────────────────────────────────────────────────────────
  if (isPageMode) {
    el.btnExtract.disabled = true; el.btnBack.disabled = true;
    showStatus('⏳', 'Reading page…', 'Scanning content', 20);
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); } catch (_) {}
    await sleep(150);

    let extracted;
    try { extracted = await msgTimeout(tab.id, { action: 'EXTRACT_PAGE' }, 30000); }
    catch (e) { showStatus('❌', 'Extraction failed', e.message, 0, 'error'); el.btnExtract.disabled = false; el.btnBack.disabled = false; return; }
    if (extracted && extracted.error) { showStatus('❌', 'Extraction failed', extracted.error, 0, 'error'); el.btnExtract.disabled = false; el.btnBack.disabled = false; return; }

    const cleanedText = extracted.cleanedText;
    const title       = extracted.title;
    showStatus('🤖', 'Processing with AI…', 'Using ' + model, 60);
    const payload = cleanedText.length > 30000 ? cleanedText.slice(0, 30000) + '\n\n[… truncated …]' : cleanedText;

    let aiResult;
    try { aiResult = await msgTimeout(null, { action: 'CALL_AI', provider, apiKey, model, content: payload, templateId: 'page_summary', customPrompt: getPrompt('page_summary') }, 60000); }
    catch (e) { showStatus('❌', 'AI call failed', e.message, 0, 'error'); el.btnExtract.disabled = false; el.btnBack.disabled = false; return; }
    if (aiResult && aiResult.error) { showStatus('❌', 'AI error', aiResult.error, 0, 'error'); el.btnExtract.disabled = false; el.btnBack.disabled = false; return; }

    showStatus('📝', 'Preparing download…', '', 95); await sleep(300);
    const mdTitle  = extractMarkdownTitle(aiResult.markdown);
    const filename = titleToFilename(mdTitle || title || '') + '.md';
    downloadMd(aiResult.markdown);
    showStatus('✅', 'Done!', 'Saved as ' + filename, 100, 'success');
    el.btnExtract.disabled = false; el.btnBack.disabled = false;
    return;
  }

  // ── Chat_Mode ──────────────────────────────────────────────────────────────
  const url = tab ? tab.url || '' : '';
  if (!url.includes('claude.ai') && !url.includes('chatgpt.com')) {
    showStatus('🔴', 'Wrong page', 'Open Claude.ai or ChatGPT first', 0, 'error'); return;
  }

  // Validate tab ID and URL
  if (!tab || !tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('devtools://')) {
    showStatus('🔴', 'Invalid tab', 'Cannot capture screenshots from this page', 0, 'error');
    el.btnExtract.disabled = false; el.btnBack.disabled = false;
    return;
  }

  el.btnExtract.disabled = true; el.btnBack.disabled = true;
  showStatus('⏳', 'Reading conversation…', 'Scanning the page', 20);
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); } catch (_) {}
  await sleep(150);

  let extracted;
  try { extracted = await msgTimeout(tab.id, { action: 'EXTRACT' }, 30000); }
  catch (e) { showStatus('❌', 'Extraction failed', e.message, 0, 'error'); el.btnExtract.disabled = false; el.btnBack.disabled = false; return; }
  if (extracted && extracted.error) { showStatus('❌', 'Extraction failed', extracted.error, 0, 'error'); el.btnExtract.disabled = false; el.btnBack.disabled = false; return; }

  const cleanedText = extracted.cleanedText;
  const imageUrls   = extracted.imageUrls;
  if (!cleanedText || cleanedText.trim().length < 50) {
    showStatus('❌', 'No content found', 'Make sure a conversation is open', 0, 'error');
    el.btnExtract.disabled = false; el.btnBack.disabled = false; return;
  }

  // NEW: Screenshot iframes if present
  showStatus('📸', 'Capturing diagrams…', 'Checking for iframes', 40);
  const screenshotMd = await extractWithScreenshots(tab.id);

  showStatus('🤖', 'Processing with AI…', 'Using ' + model, 60);
  let payload = cleanedText.length > 30000 ? cleanedText.slice(0, 30000) + '\n\n[… truncated …]' : cleanedText;
  if (imageUrls && imageUrls.length) {
    payload += '\n\n---\n## EXTRACTED IMAGE URLS\n';
    imageUrls.forEach(function(u, i) { payload += (i + 1) + '. ' + u + '\n'; });
  }

  let aiResult;
  try { aiResult = await msgTimeout(null, { action: 'CALL_AI', provider, apiKey, model, content: payload, templateId: selectedTemplate, customPrompt: getPrompt(selectedTemplate) }, 60000); }
  catch (e) { showStatus('❌', 'AI call failed', e.message, 0, 'error'); el.btnExtract.disabled = false; el.btnBack.disabled = false; return; }
  if (aiResult && aiResult.error) { showStatus('❌', 'AI error', aiResult.error, 0, 'error'); el.btnExtract.disabled = false; el.btnBack.disabled = false; return; }

  // Append screenshot markdown to the AI result (after AI processing)
  let finalMarkdown = aiResult.markdown;
  if (screenshotMd) {
    console.log('📸 Appending screenshots to final markdown');
    console.log('Screenshot markdown length:', screenshotMd.length);
    finalMarkdown += '\n\n---\n## CAPTURED DIAGRAMS\n\n' + screenshotMd;
  }

  showStatus('📝', 'Preparing download…', '', 95); await sleep(300);
  const filename = downloadMd(finalMarkdown);
  showStatus('✅', 'Done!', 'Saved as ' + filename, 100, 'success');
  el.btnExtract.disabled = false; el.btnBack.disabled = false;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function msgTimeout(tabId, msg, ms) {
  return new Promise(function(resolve, reject) {
    var t = setTimeout(function() { reject(new Error('Timed out')); }, ms);
    var cb = function(res) {
      clearTimeout(t);
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    };
    if (tabId !== null) chrome.tabs.sendMessage(tabId, msg, cb);
    else                chrome.runtime.sendMessage(msg, cb);
  });
}

function titleToFilename(title) {
  var cleaned = String(title || '')
    .replace(/^\s*#+\s*/, '').trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || 'content-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function extractMarkdownTitle(content) {
  var match = String(content || '').match(/^\s*#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

function downloadMd(content) {
  var title = extractMarkdownTitle(content);
  var name  = titleToFilename(title) + '.md';
  var a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
  a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  return name;
}

// ─── Screenshot Helpers ───────────────────────────────────────────────────────

/**
 * Captures a full-tab screenshot via background.js
 * @returns {Promise<string>} Base64 PNG data URL
 */
async function captureScreenshot() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'CAPTURE_SCREENSHOT' },
      (response) => {
        if (response?.error) reject(new Error(response.error));
        else resolve(response.dataUrl);
      }
    );
  });
}

/**
 * Extracts iframe screenshots from the active tab.
 * Returns Markdown image blocks for all captured iframes.
 * @param {number} tabId - Active tab ID
 * @returns {Promise<string|null>} Markdown with embedded screenshots, or null if no iframes
 */
async function extractWithScreenshots(tabId) {
  try {
    // 1. Get iframe positions from content script (before any scrolling)
    const { bounds } = await msgTimeout(tabId, { action: 'GET_IFRAME_BOUNDS' }, 5000);

    if (!bounds || bounds.length === 0) {
      return null; // no iframes, skip screenshot path
    }

    console.log('📸 Found', bounds.length, 'iframes to capture');
    console.log('Bounds data:', JSON.stringify(bounds, null, 2));

    // 2. Capture each iframe individually by scrolling to it
    const screenshots = [];

    for (let i = 0; i < bounds.length; i++) {
      const bound = bounds[i];
      
      console.log(`📸 Capturing iframe ${i + 1}/${bounds.length}: ${bound.title}`);
      console.log(`   Position: (${bound.pageX}, ${bound.pageY}), Size: ${bound.width}×${bound.height}px`);
      console.log(`   Bound object:`, bound);

      // Scroll to position the iframe at the top of the viewport
      // Convert to number and ensure it's valid
      const scrollY = Number(bound.pageY) || 0;
      console.log(`   Scroll Y value:`, scrollY, typeof scrollY);
      
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (scrollPosition) => {
          window.scrollTo(0, Math.max(0, scrollPosition - 50)); // 50px padding from top
        },
        args: [scrollY]
      });

      // Wait for scroll + iframe render to settle
      await sleep(500);

      // Get updated viewport position after scroll
      const { bounds: updatedBounds } = await msgTimeout(tabId, { action: 'GET_IFRAME_BOUNDS' }, 5000);
      const currentBound = updatedBounds[i];

      console.log(`   Viewport position after scroll: (${currentBound.viewportX}, ${currentBound.viewportY})`);

      // Capture + crop this specific iframe
      const result = await msgTimeout(
        null, // background.js
        { action: 'CAPTURE_AND_CROP', bounds: [currentBound] },
        15000
      );

      if (result.error) {
        console.warn(`   ❌ Failed to capture: ${result.error}`);
        
        // Check if it's a permission error
        if (result.error.includes('devtools://') || result.error.includes('chrome://')) {
          console.error('Cannot capture screenshots from DevTools or Chrome internal pages');
          return null; // Stop trying
        }
        continue;
      }

      const { croppedUrls, titles } = result;

      if (croppedUrls && croppedUrls.length > 0) {
        screenshots.push({
          title: titles[0],
          url: croppedUrls[0]
        });
        console.log(`   ✅ Captured successfully (${croppedUrls[0].length} chars)`);
      }
    }

    if (screenshots.length === 0) {
      return null;
    }

    // Log all captured screenshots
    console.group('📸 All Screenshot URLs Captured');
    screenshots.forEach((ss, i) => {
      console.log(`${i + 1}. ${ss.title}`);
      console.log(`   Length: ${ss.url.length} chars`);
      console.log(`   Preview: ${ss.url.substring(0, 100)}...`);
      console.log(`   Full URL:`, ss.url);
    });
    console.groupEnd();

    // Build markdown image blocks
    return screenshots.map(ss =>
      `### ${ss.title}\n\n![${ss.title}](${ss.url})\n`
    ).join('\n');
  } catch (err) {
    console.warn('Screenshot extraction failed:', err);
    return null; // Fail gracefully — continue without screenshots
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  const s = await load();
  provider         = s.provider         || 'gemini';
  selectedTemplate = s.selectedTemplate || 'summary';
  setProvider(provider);
  await loadTemplates();
  renderTemplates();
  if (s.geminiModel) el.geminiModel.value = s.geminiModel;
  if (s.nvidiaModel) el.nvidiaModel.value = s.nvidiaModel;
  const hasKey = provider === 'gemini' ? !!s.geminiKey : !!s.nvidiaKey;
  el.btnNext.disabled = !hasKey;
  if (hasKey) goToStep(2);
})();
