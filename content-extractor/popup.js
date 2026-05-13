'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_NVIDIA_MODEL = 'meta/llama-3.3-70b-instruct';

const TEMPLATES = [
  { id: 'summary',     emoji: '💬', label: 'Chat Session Summary',         desc: 'What was discussed, decided, and what\'s still pending' },
  { id: 'methodology', emoji: '🔁', label: 'Extract Reusable Methodology', desc: 'Turn what worked into a repeatable step-by-step process' },
  { id: 'plan',        emoji: '🗺️', label: 'Plan Extraction',              desc: 'Pull out goals, features, priorities & tasks' }
];

// ─── State ────────────────────────────────────────────────────────────────────
let provider         = 'gemini';
let selectedTemplate = 'summary';
let currentStep      = 1;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const el = {
  // step indicator
  stepDot1:      $('stepDot1'),
  stepDot2:      $('stepDot2'),
  stepLine:      $('stepLine'),
  stepLabel1:    $('stepLabel1'),
  stepLabel2:    $('stepLabel2'),
  // panels
  step1:         $('step1'),
  step2:         $('step2'),
  // step 1
  providerTabs:  $('providerTabs'),
  paneGemini:    $('paneGemini'),
  paneNvidia:    $('paneNvidia'),
  geminiKey:     $('geminiKey'),
  eyeGemini:     $('eyeGemini'),
  nvidiaKey:     $('nvidiaKey'),
  eyeNvidia:     $('eyeNvidia'),
  btnSave:       $('btnSave'),
  saveStatus:    $('saveStatus'),
  btnNext:       $('btnNext'),
  // step 2
  platformDot:   $('platformDot'),
  platformName:  $('platformName'),
  platformStatus:$('platformStatus'),
  modelCardTitle:$('modelCardTitle'),
  modelGemini:   $('modelGemini'),
  modelNvidia:   $('modelNvidia'),
  geminiModel:   $('geminiModel'),
  nvidiaModel:   $('nvidiaModel'),
  templateList:  $('templateList'),
  statusBar:     $('statusBar'),
  statusIcon:    $('statusIcon'),
  statusText:    $('statusText'),
  statusSub:     $('statusSub'),
  progressFill:  $('progressFill'),
  progressTrack: $('progressTrack'),
  btnExtract:    $('btnExtract'),
  btnBack:       $('btnBack'),
};

// ─── Step navigation ──────────────────────────────────────────────────────────
function goToStep(n) {
  currentStep = n;

  el.step1.classList.toggle('active', n === 1);
  el.step2.classList.toggle('active', n === 2);

  // dot 1
  el.stepDot1.className  = 'step-dot' + (n === 1 ? ' active' : ' done');
  el.stepLabel1.className = 'step-label' + (n === 1 ? ' active' : ' done');
  el.stepDot1.textContent = n > 1 ? '✓' : '1';

  // line
  el.stepLine.className = 'step-line' + (n > 1 ? ' done' : '');

  // dot 2
  el.stepDot2.className  = 'step-dot' + (n === 2 ? ' active' : '');
  el.stepLabel2.className = 'step-label' + (n === 2 ? ' active' : '');

  if (n === 2) {
    detectPlatform();
    syncModelUI();
  }
}

el.btnNext.addEventListener('click', () => goToStep(2));
el.btnBack.addEventListener('click', () => goToStep(1));

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
  el.modelGemini.style.display = provider === 'gemini' ? 'block' : 'none';
  el.modelNvidia.style.display = provider === 'nvidia' ? 'block' : 'none';
  el.modelCardTitle.textContent = provider === 'gemini' ? '🤖 Gemini Model' : '🤖 NVIDIA Model';
}

// ─── Eye toggles ─────────────────────────────────────────────────────────────
function wireEye(btn, input) {
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type      = show ? 'text' : 'password';
    btn.textContent = show ? '🙈' : '👁️';
  });
}
wireEye(el.eyeGemini, el.geminiKey);
wireEye(el.eyeNvidia, el.nvidiaKey);

// ─── Storage ──────────────────────────────────────────────────────────────────
function load() {
  return chrome.storage.local.get(['provider', 'geminiKey', 'nvidiaKey', 'geminiModel', 'nvidiaModel', 'selectedTemplate']);
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

// Enable "Next" only when a key exists for the active provider
async function checkNextEnabled() {
  const s = await load();
  const hasKey = provider === 'gemini' ? !!s.geminiKey : !!s.nvidiaKey;
  el.btnNext.disabled = !hasKey;
}

// ─── Templates ────────────────────────────────────────────────────────────────
function renderTemplates() {
  el.templateList.innerHTML = '';
  TEMPLATES.forEach(t => {
    const div = document.createElement('div');
    div.className = 'tmpl' + (t.id === selectedTemplate ? ' sel' : '');
    div.innerHTML = `
      <span class="tmpl-icon">${t.emoji}</span>
      <div class="tmpl-info">
        <div class="tmpl-name">${t.label}</div>
        <div class="tmpl-desc">${t.desc}</div>
      </div>
      <span class="tmpl-check">✓</span>
    `;
    div.addEventListener('click', () => {
      selectedTemplate = t.id;
      chrome.storage.local.set({ selectedTemplate: t.id });
      el.templateList.querySelectorAll('.tmpl').forEach(d => d.classList.remove('sel'));
      div.classList.add('sel');
    });
    el.templateList.appendChild(div);
  });
}

// ─── Platform detection ───────────────────────────────────────────────────────
async function detectPlatform() {
  const s = await load();
  const hasKey = provider === 'nvidia' ? !!s.nvidiaKey : !!s.geminiKey;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url   = tab?.url || '';
    const onClaude  = url.includes('claude.ai');
    const onChatGPT = url.includes('chatgpt.com');

    if (onClaude) {
      setDot('ok', 'Claude.ai', hasKey ? 'Ready to extract' : 'Save your API key first');
    } else if (onChatGPT) {
      setDot('ok', 'ChatGPT', hasKey ? 'Ready to extract' : 'Save your API key first');
    } else {
      setDot('err', 'Unsupported page', 'Navigate to Claude.ai or ChatGPT');
    }

    const onSupportedPage = onClaude || onChatGPT;

    if (!hasKey) {
      showStatus('🔑', 'No API key saved', 'Go back and save your key', 0, 'error');
    } else if (!onSupportedPage) {
      showStatus('🔴', 'Wrong page', 'Open Claude.ai or ChatGPT first', 0, 'error');
    } else {
      // Clear any leftover error status
      el.statusBar.className = 'status-bar';
    }

    el.btnExtract.disabled = !hasKey || !onSupportedPage;
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
function showStatus(icon, text, sub, pct, type = '') {
  el.statusBar.className        = 'status-bar show' + (type ? ' ' + type : '');
  el.statusIcon.textContent     = icon;
  el.statusText.textContent     = text;
  el.statusSub.textContent      = sub;
  el.progressFill.style.width   = pct + '%';
  el.progressTrack.style.display = type ? 'none' : 'block';
}

// ─── Extract ──────────────────────────────────────────────────────────────────
el.btnExtract.addEventListener('click', async () => {
  const s  = await load();
  // Use in-memory provider (kept in sync by setProvider) — do NOT overwrite from storage
  const apiKey = provider === 'gemini' ? s.geminiKey : s.nvidiaKey;

  // Resolve model
  let model;
  if (provider === 'gemini') {
    model = el.geminiModel.value || s.geminiModel || 'gemini-2.5-flash';
  } else {
    model = el.nvidiaModel.value.trim() || s.nvidiaModel || DEFAULT_NVIDIA_MODEL;
  }

  // Persist chosen model
  if (provider === 'gemini') chrome.storage.local.set({ geminiModel: model });
  else                        chrome.storage.local.set({ nvidiaModel: model });

  if (!apiKey) {
    showStatus('🔑', 'No API key saved', 'Go back and save your key', 0, 'error');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url   = tab?.url || '';

  if (!url.includes('claude.ai') && !url.includes('chatgpt.com')) {
    showStatus('🔴', 'Wrong page', 'Open Claude.ai or ChatGPT first', 0, 'error');
    return;
  }

  el.btnExtract.disabled = true;
  el.btnBack.disabled    = true;

  // Step 1 — read DOM
  showStatus('⏳', 'Reading conversation…', 'Scanning the page', 20);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (_) {}
  await sleep(150);

  let extracted;
  try {
    extracted = await msgTimeout(tab.id, { action: 'EXTRACT' }, 30000);
  } catch (e) {
    showStatus('❌', 'Extraction failed', e.message, 0, 'error');
    el.btnExtract.disabled = false;
    el.btnBack.disabled    = false;
    return;
  }

  if (extracted?.error) {
    showStatus('❌', 'Extraction failed', extracted.error, 0, 'error');
    el.btnExtract.disabled = false;
    el.btnBack.disabled    = false;
    return;
  }

  const { cleanedText, imageUrls } = extracted;
  if (!cleanedText || cleanedText.trim().length < 50) {
    showStatus('❌', 'No content found', 'Make sure a conversation is open', 0, 'error');
    el.btnExtract.disabled = false;
    el.btnBack.disabled    = false;
    return;
  }

  // Step 2 — call AI
  showStatus('🤖', 'Processing with AI…', `Using ${model}`, 60);

  let payload = cleanedText.length > 30000
    ? cleanedText.slice(0, 30000) + '\n\n[… truncated …]'
    : cleanedText;

  if (imageUrls?.length) {
    payload += '\n\n---\n## EXTRACTED IMAGE URLS\n';
    imageUrls.forEach((u, i) => { payload += `${i + 1}. ${u}\n`; });
  }

  let aiResult;
  try {
    aiResult = await msgTimeout(null,
      { action: 'CALL_AI', provider, apiKey, model, content: payload, templateId: selectedTemplate },
      60000
    );
  } catch (e) {
    showStatus('❌', 'AI call failed', e.message, 0, 'error');
    el.btnExtract.disabled = false;
    el.btnBack.disabled    = false;
    return;
  }

  if (aiResult?.error) {
    showStatus('❌', 'AI error', aiResult.error, 0, 'error');
    el.btnExtract.disabled = false;
    el.btnBack.disabled    = false;
    return;
  }

  // Step 3 — download
  showStatus('📝', 'Preparing download…', '', 95);
  await sleep(300);

  const filename = downloadMd(aiResult.markdown);
  showStatus('✅', 'Done!', `Saved as ${filename}`, 100, 'success');
  el.btnExtract.disabled = false;
  el.btnBack.disabled    = false;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function msgTimeout(tabId, msg, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timed out')), ms);
    const cb = res => {
      clearTimeout(t);
      chrome.runtime.lastError
        ? reject(new Error(chrome.runtime.lastError.message))
        : resolve(res);
    };
    tabId !== null
      ? chrome.tabs.sendMessage(tabId, msg, cb)
      : chrome.runtime.sendMessage(msg, cb);
  });
}

function downloadMd(content) {
  const name = `content-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`;
  const a    = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([content], { type: 'text/markdown' })),
    download: name
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  return name;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  const s = await load();

  provider         = s.provider         || 'gemini';
  selectedTemplate = s.selectedTemplate || 'summary';

  setProvider(provider);
  renderTemplates();

  // Restore saved model values
  if (s.geminiModel) el.geminiModel.value = s.geminiModel;
  if (s.nvidiaModel) el.nvidiaModel.value = s.nvidiaModel;

  // Check if we can skip to step 2
  const hasKey = provider === 'gemini' ? !!s.geminiKey : !!s.nvidiaKey;
  el.btnNext.disabled = !hasKey;

  if (hasKey) {
    // Already have a key — go straight to step 2
    goToStep(2);
  }
  // else stay on step 1 (default)
})();
