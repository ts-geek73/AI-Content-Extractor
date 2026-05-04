// content.js — DOM extractor injected into claude.ai / chatgpt.com tabs
// Guard against double-injection
if (window.__aiExtractorInjected) {
  // Already active — just respond to messages
} else {
  window.__aiExtractorInjected = true;

  // ─── Platform Selectors ───────────────────────────────────────────────────
  const PLATFORM_SELECTORS = {
    'claude.ai': {
      messageContainer: '[data-testid="conversation-turn"], .font-claude-message, .font-user-message, [class*="ConversationItem"], [class*="conversation-turn"], .grid-cols-1 > div',
      humanMessage:     '[data-testid="human-turn"], [class*="human-turn"], .font-user-message',
      aiMessage:        '[data-testid="assistant-turn"], .font-claude-message, [class*="assistant-turn"]',
      images:           'img[src]:not([src^="data:"])'
    },
    'chatgpt.com': {
      messageContainer: '[data-message-id], article',
      humanMessage:     '[data-message-author-role="user"]',
      aiMessage:        '[data-message-author-role="assistant"]',
      images:           'img[src]:not([src^="data:"])'
    }
  };

  // ─── Detect Platform ──────────────────────────────────────────────────────
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('claude.ai'))   return 'claude.ai';
    if (host.includes('chatgpt.com')) return 'chatgpt.com';
    return null;
  }

  // ─── Wait for Content ─────────────────────────────────────────────────────
  function waitForContent(selector, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        // Resolve with null instead of rejecting so we can try the fallback
        resolve(null);
      }, timeout);
    });
  }

  // ─── Clean a Cloned Node ──────────────────────────────────────────────────
  const REMOVE_TAGS = ['script','style','noscript','svg','iframe','canvas','video','audio','head','nav','footer'];
  const KEEP_ATTRS  = new Set(['src','href','alt','title','type']);

  function cleanNode(root) {
    // Remove unwanted tags
    REMOVE_TAGS.forEach(tag => {
      root.querySelectorAll(tag).forEach(el => el.remove());
    });

    // Remove UI chrome elements (buttons, icons, tooltips)
    root.querySelectorAll('button, [role="button"], [aria-label="Copy"], [data-testid*="copy"]').forEach(el => el.remove());

    // Walk all elements and strip non-essential attributes
    root.querySelectorAll('*').forEach(el => {
      const attrsToRemove = [];
      for (const attr of el.attributes) {
        if (!KEEP_ATTRS.has(attr.name) && !attr.name.startsWith('data-message')) {
          attrsToRemove.push(attr.name);
        }
      }
      attrsToRemove.forEach(attr => el.removeAttribute(attr));
    });

    return root;
  }

  // ─── Extract Image URLs ───────────────────────────────────────────────────
  function extractImages(root, selector) {
    const images = [];
    root.querySelectorAll(selector).forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (src && !src.startsWith('data:') && src.length > 10) {
        images.push(src);
      }
    });
    return [...new Set(images)]; // deduplicate
  }

  // ─── Node to Text ─────────────────────────────────────────────────────────
  function nodeToText(node) {
    // Attempt to preserve meaningful structure via innerText,
    // but fall back to textContent if needed
    if (node.innerText !== undefined) return node.innerText;
    return node.textContent || '';
  }

  // ─── Main Extraction ──────────────────────────────────────────────────────
  async function extractContent() {
    const platform = detectPlatform();
    if (!platform) {
      throw new Error('Not on a supported page (Claude.ai or ChatGPT). Please navigate there first.');
    }

    const selectors = PLATFORM_SELECTORS[platform];

    // Wait for conversation to be present
    await waitForContent(selectors.messageContainer, 6000);

    // Clone the body to avoid mutating the live DOM
    const bodyClone = document.body.cloneNode(true);
    const imageUrls = extractImages(bodyClone, selectors.images);

    // Clean the clone
    cleanNode(bodyClone);

    // Try to get structured messages
    const messageEls = bodyClone.querySelectorAll(selectors.messageContainer);

    let lines = [];

    if (messageEls.length > 0) {
      messageEls.forEach((msgEl, idx) => {
        // Detect role
        let role = 'Unknown';
        const isHuman = msgEl.matches(selectors.humanMessage) ||
                        msgEl.querySelector(selectors.humanMessage.split(',')[0]);
        const isAI    = msgEl.matches(selectors.aiMessage) ||
                        msgEl.querySelector(selectors.aiMessage.split(',')[0]);

        if (platform === 'claude.ai') {
          // Claude uses data-testid on parent containers
          const testId = msgEl.getAttribute('data-testid') || '';
          if (testId.includes('human') || msgEl.closest('[data-testid*="human"]')) role = 'User';
          else if (testId.includes('assistant') || msgEl.closest('[data-testid*="assistant"]')) role = 'AI (Claude)';
          else role = idx % 2 === 0 ? 'User' : 'AI (Claude)'; // fallback alternation
        } else {
          const authorRole = msgEl.getAttribute('data-message-author-role') ||
            msgEl.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
          if (authorRole === 'user') role = 'User';
          else if (authorRole === 'assistant') role = 'AI (ChatGPT)';
          else role = 'Unknown';
        }

        const text = nodeToText(msgEl).trim();
        if (text.length > 5) {
          lines.push(`--- Message ${idx + 1} | Role: ${role} ---`);
          lines.push(text);
          lines.push('');
        }
      });
    }

    // Fallback: if no structured messages found, grab full page text
    if (lines.length === 0) {
      const fullText = nodeToText(bodyClone).trim();
      if (fullText.length > 100) {
        lines = [fullText];
      } else {
        throw new Error('No conversation content found on this page. Please open a conversation first.');
      }
    }

    // Collapse excess whitespace
    let cleanedText = lines.join('\n');
    cleanedText = cleanedText
      .replace(/[ \t]+$/gm, '')           // trailing spaces per line
      .replace(/\n{4,}/g, '\n\n\n')       // max 3 consecutive newlines
      .trim();

    return {
      cleanedText,
      imageUrls,
      platform,
      messageCount: messageEls.length
    };
  }

  // ─── Message Listener ─────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'EXTRACT') {
      extractContent()
        .then(result => {
          sendResponse({
            cleanedText:  result.cleanedText,
            imageUrls:    result.imageUrls,
            platform:     result.platform,
            messageCount: result.messageCount
          });
        })
        .catch(err => {
          sendResponse({ error: err.message });
        });

      return true; // Keep message channel open for async
    }
  });
}
