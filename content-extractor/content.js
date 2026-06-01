// ─── One-time setup: only run when first injected ─────────────────────────
if (!window.__aiExtractorInjected) {
  window.__aiExtractorInjected = true;

  const PLATFORM_SELECTORS = {
    "claude.ai": {
      messageContainer:
        '[data-testid="user-message"], div.standard-markdown, div[data-user-message-bubble="true"], div[data-is-streaming="false"] div.standard-markdown',
      humanMessage:
        '[data-testid="user-message"], div[data-user-message-bubble="true"]',
      aiMessage: "div.standard-markdown, div.font-claude-response",
      images: 'img[src]:not([src^="data:"])',
    },
    "chatgpt.com": {
      messageContainer: "[data-message-id], article",
      humanMessage: '[data-message-author-role="user"]',
      aiMessage: '[data-message-author-role="assistant"]',
      images: 'img[src]:not([src^="data:"])',
    },
  };

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("claude.ai")) return "claude.ai";
    if (host.includes("chatgpt.com")) return "chatgpt.com";
    return null;
  }

  function waitForContent(selector, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }

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

  const REMOVE_TAGS = [
    "script",
    "style",
    "noscript",
    "iframe",
    "canvas",
    "video",
    "audio",
    "head",
    "nav",
    "footer",
  ];
  const KEEP_ATTRS = new Set(["src", "href", "alt", "title", "type"]);

  const NOISE_SELECTORS = [
    "nav",
    "header",
    "footer",
    "aside",
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    '[role="contentinfo"]',
    '[role="note"]',
    '[data-disclaimer="true"]',
    '[class*="sidebar"]',
    '[class*="nav"]',
    '[class*="menu"]',
    '[class*="ad"]',
    '[class*="ads"]',
    '[class*="advert"]',
    '[class*="cookie"]',
    '[class*="banner"]',
    '[class*="popup"]',
    '[class*="modal"]',
    '[class*="related"]',
    '[class*="recommend"]',
    '[class*="share"]',
    '[class*="social"]',
    '[class*="comment"]',
    '[class*="pagination"]',
    '[class*="pager"]',
    '[class*="breadcrumb"]',
    '[class*="footer"]',
    '[class*="header"]',
    '[class*="subscribe"]',
    '[class*="newsletter"]',
    '[class*="promo"]',
    '[id*="sidebar"]',
    '[id*="nav"]',
    '[id*="menu"]',
    '[id*="ad"]',
    '[id*="ads"]',
    '[id*="advert"]',
    '[id*="cookie"]',
    '[id*="banner"]',
    '[id*="popup"]',
    '[id*="modal"]',
    '[id*="related"]',
    '[id*="recommend"]',
    '[id*="share"]',
    '[id*="social"]',
    '[id*="comment"]',
    '[id*="pagination"]',
    '[id*="pager"]',
    '[id*="breadcrumb"]',
    '[id*="footer"]',
    '[id*="header"]',
    '[id*="subscribe"]',
    '[id*="newsletter"]',
    '[id*="promo"]',
    // Claude.ai specific UI chrome
    '[class*="usage"]',
    '[class*="session"]',
    '[class*="limit"]',
    '[class*="bookmark"]',
    '[class*="fork"]',
    '[class*="export"]',
    '[class*="import"]',
    '[class*="preference"]',
    '[class*="setting"]',
    '[class*="navigation"]',
    '[class*="toolbar"]',
    '[class*="action"]',
    '[class*="button-group"]',
    '[aria-label*="Navigation"]',
    '[aria-label*="Bookmark"]',
    '[aria-label*="Fork"]',
    '[aria-label*="Export"]',
    '[aria-label*="Settings"]',
    '[aria-label*="Usage"]',
    '[aria-label*="Session"]',
    // Generic UI elements
    'button:not([class*="code"])',
    '[role="button"]:not([class*="code"])',
    '[class*="tooltip"]',
    '[class*="dropdown"]',
    '[class*="overlay"]',
  ].join(",\n    ");

  /**
   * Removes all noise elements from the given root element in place.
   * Mutates the passed root — does not clone.
   * @param {Element} root
   */
  function removeNoise(root) {
    root.querySelectorAll(NOISE_SELECTORS).forEach((el) => el.remove());
  }

  /**
   * Returns the DOM depth of an element relative to the document root.
   * @param {Element} el
   * @returns {number}
   */
  function elementDepth(el) {
    let depth = 0;
    let node = el;
    while (node.parentElement) {
      depth++;
      node = node.parentElement;
    }
    return depth;
  }

  /**
   * Scores a candidate element for main-content likelihood.
   * Formula: textLength - 25 × linkDensity + 5 × paragraphCount - 10 × (depth > 8 ? 1 : 0)
   *
   * @param {Element} el
   * @returns {number}
   */
  function scoreCandidate(el) {
    const totalText = (el.textContent || "").trim();
    const textLength = totalText.length;

    if (textLength === 0) return -Infinity;

    // linkDensity: ratio of anchor text to total text (0–1)
    let anchorTextLength = 0;
    el.querySelectorAll("a").forEach((a) => {
      anchorTextLength += (a.textContent || "").length;
    });
    const linkDensity = anchorTextLength / textLength;

    // paragraphCount: number of <p> descendants
    const paragraphCount = el.querySelectorAll("p").length;

    // depth penalty
    const depth = elementDepth(el);
    const depthPenalty = depth > 8 ? 1 : 0;

    return (
      textLength - 25 * linkDensity + 5 * paragraphCount - 10 * depthPenalty
    );
  }

  /**
   * Selects the main content element from a cleaned root.
   * Scores all block-level candidate elements (div, article, section, main, p)
   * with textLength > 200. Returns the highest-scoring element if its score ≥ 20.
   * Falls back to a DocumentFragment containing all p, h1-h6, li, blockquote, pre
   * elements if no candidate meets the threshold.
   *
   * @param {Element} root
   * @returns {Element|DocumentFragment}
   */
  function selectMainContent(root) {
    const CANDIDATE_SELECTORS = "div, article, section, main, p";
    const candidates = Array.from(root.querySelectorAll(CANDIDATE_SELECTORS));

    let bestEl = null;
    let bestScore = -Infinity;

    for (const el of candidates) {
      const textLength = (el.textContent || "").trim().length;
      if (textLength <= 200) continue;

      const score = scoreCandidate(el);
      if (score > bestScore) {
        bestScore = score;
        bestEl = el;
      }
    }

    if (bestEl !== null && bestScore >= 20) {
      return bestEl;
    }

    // Fallback: collect all prose elements into a fragment
    const FALLBACK_SELECTORS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre";
    const fragment = root.ownerDocument
      ? root.ownerDocument.createDocumentFragment()
      : document.createDocumentFragment();

    root.querySelectorAll(FALLBACK_SELECTORS).forEach((el) => {
      fragment.appendChild(el.cloneNode(true));
    });

    return fragment;
  }

  function cleanNode(root) {
    REMOVE_TAGS.forEach((tag) => {
      root.querySelectorAll(tag).forEach((el) => el.remove());
    });

    root
      .querySelectorAll(
        'button, [role="button"], [aria-label="Copy"], [data-testid*="copy"]',
      )
      .forEach((el) => el.remove());

    root.querySelectorAll("*").forEach((el) => {
      const attrsToRemove = [];
      for (const attr of el.attributes) {
        if (
          !KEEP_ATTRS.has(attr.name) &&
          !attr.name.startsWith("data-message")
        ) {
          attrsToRemove.push(attr.name);
        }
      }
      attrsToRemove.forEach((attr) => el.removeAttribute(attr));
    });

    return root;
  }

  function extractImages(root, selector) {
    const images = [];
    root.querySelectorAll(selector).forEach((img) => {
      const src = img.getAttribute("src") || img.getAttribute("data-src");
      if (src && !src.startsWith("data:") && src.length > 10) {
        images.push(src);
      }
    });
    return [...new Set(images)]; // deduplicate
  }

  /**
   * Decides if an SVG element is a diagram (worth keeping) vs a UI icon/logo.
   *
   * Rules (any one match = diagram):
   *   1. Has a <title> or <desc> child — Claude always adds these to diagrams
   *   2. Has a role="img" attribute
   *   3. viewBox area ≥ 10000 (e.g. 100×100 minimum meaningful diagram)
   *   4. Contains meaningful child elements: rect/circle/path/line/text count ≥ 5
   *
   * Rules (any one match = skip):
   *   A. Pixel width or height attribute < 40 (explicit small size)
   *   B. Is a descendant of a known UI chrome selector
   *
   * @param {SVGElement} svg
   * @returns {boolean}
   */
  function isDiagramSvg(svg) {
    // Skip rule A: explicit small pixel dimensions
    const wAttr = svg.getAttribute("width");
    const hAttr = svg.getAttribute("height");
    const wPx =
      wAttr && !wAttr.includes("%") && !wAttr.includes("em")
        ? parseFloat(wAttr)
        : null;
    const hPx =
      hAttr && !hAttr.includes("%") && !hAttr.includes("em")
        ? parseFloat(hAttr)
        : null;
    if (wPx !== null && wPx < 40) return false;
    if (hPx !== null && hPx < 40) return false;

    // Skip rule B: lives inside UI chrome (header, nav, button, sidebar, logo areas)
    const uiChromeSelector =
      'header, nav, footer, aside, [class*="logo"], [class*="icon"],[class*="avatar"], [class*="brand"], button, [role="button"],  [role="banner"], [class*="header"], [class*="toolbar"]';
    if (svg.closest(uiChromeSelector)) return false;

    // Keep rule 1: has <title> or <desc> — Claude always adds these to diagrams
    if (svg.querySelector("title, desc")) return true;
    if (svg.id?.startsWith("mermaid") || svg.closest('[class*="mermaid"]'))
      return true;

    // Keep rule 2: role="img"
    if (svg.getAttribute("role") === "img") return true;

    // Keep rule 3: viewBox area ≥ 10000
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0 && vb.width * vb.height >= 10000)
      return true;

    // Keep rule 4: rich content (≥ 5 meaningful child elements)
    const richCount = svg.querySelectorAll(
      "rect, circle, ellipse, line, polyline, polygon, path, text, g",
    ).length;
    if (richCount >= 5) return true;

    return false;
  }

  function extractSvgs(root) {
    const serializer = new XMLSerializer();
    const results = [];
    root.querySelectorAll("svg").forEach((svg) => {
      if (!isDiagramSvg(svg)) return;
      // Skip nested SVGs — only grab top-level diagrams
      if (svg.parentElement?.closest("svg")) return;
      const str = serializer.serializeToString(svg).trim();
      if (str.length > 200) results.push(str);
    });
    return results;
  }

  function nodeToText(node) {
    if (node.innerText !== undefined) return node.innerText;
    return node.textContent || "";
  }

  function escapeMd(text) {
    return String(text || "")
      .replace(/\|/g, "\\|")
      .trim();
  }

  function htmlToMarkdown(node) {
    if (!node) return "";

    const tag = (node.tagName || "").toLowerCase();
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    if (tag === "svg") {
      if (!isDiagramSvg(node)) return "";
      // Skip nested SVGs
      if (node.parentElement?.closest("svg")) return "";
      const svgStr = new XMLSerializer().serializeToString(node).trim();
      if (svgStr.length < 200) return "";
      return `\n\`\`\`svg\n${svgStr}\n\`\`\`\n\n`;
    }

    if (tag === "pre") {
      const code = node.querySelector("code");
      const raw = (code ? code.textContent : node.textContent) || "";
      return `\n\`\`\`\n${raw.trimEnd()}\n\`\`\`\n`;
    }

    if (tag === "code") return `\`${(node.textContent || "").trim()}\``;

    if (tag === "p")
      return `${Array.from(node.childNodes).map(htmlToMarkdown).join("").trim()}\n\n`;
    if (tag === "br") return "\n";
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      return `${"#".repeat(level)} ${node.textContent.trim()}\n\n`;
    }

    if (tag === "ul" || tag === "ol") {
      const items = Array.from(node.querySelectorAll(":scope > li")).map(
        (li, i) => {
          const prefix = tag === "ol" ? `${i + 1}. ` : "- ";
          return `${prefix}${li.textContent.trim()}`;
        },
      );
      return `${items.join("\n")}\n\n`;
    }

    if (tag === "a") {
      const text = (node.textContent || "").trim();
      const href = node.getAttribute("href") || "";
      return href ? `[${text}](${href})` : text;
    }

    if (tag === "table") {
      const rows = Array.from(node.querySelectorAll("tr"));
      if (rows.length === 0) return "";
      const cells = rows.map((r) =>
        Array.from(r.querySelectorAll("th,td")).map((c) =>
          escapeMd(c.textContent),
        ),
      );
      const header = cells[0];
      const sep = header.map(() => "---");
      const body = cells.slice(1);
      const lines = [
        `| ${header.join(" | ")} |`,
        `| ${sep.join(" | ")} |`,
        ...body.map((r) => `| ${r.join(" | ")} |`),
      ];
      return `${lines.join("\n")}\n\n`;
    }

    return Array.from(node.childNodes).map(htmlToMarkdown).join("");
  }

  /**
   * Counts words in a string by splitting on whitespace.
   * @param {string} text
   * @returns {number}
   */
  function wordCount(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function extractPageContent() {
    // Step 1: Clone document.body
    const bodyClone = document.body.cloneNode(true);

    // Step 2: Strip REMOVE_TAGS (script, style, noscript, iframe, canvas, video, audio, svg)
    const PAGE_REMOVE_TAGS = [
      "script",
      "style",
      "noscript",
      "canvas",
      "video",
      "audio",
    ];
    PAGE_REMOVE_TAGS.forEach((tag) => {
      bodyClone.querySelectorAll(tag).forEach((el) => el.remove());
    });

    // Step 3: Strip NOISE_SELECTORS elements
    removeNoise(bodyClone);

    // Step 4 & 5: Score candidates; select highest-scoring element (falls back internally)
    const mainContent = selectMainContent(bodyClone);

    // Step 6: Convert selected content to Markdown
    let markdown;
    if (mainContent instanceof DocumentFragment) {
      // Convert each child node and join
      markdown = Array.from(mainContent.childNodes)
        .map(htmlToMarkdown)
        .join("");
    } else {
      markdown = htmlToMarkdown(mainContent);
    }

    // Step 7: Collapse \n{3,} → \n\n
    let cleanedText = markdown.replace(/\n{3,}/g, "\n\n");

    // Trim trailing/leading whitespace
    cleanedText = cleanedText.trim();

    // Step 8: Throw if result < 100 chars
    if (cleanedText.length < 100) {
      throw new Error("No readable content found on this page.");
    }

    // Step 9: Return result
    return {
      cleanedText,
      title: document.title,
      wordCount: wordCount(cleanedText),
    };
  }

  async function extractContent() {
    const platform = detectPlatform();
    if (!platform) {
      throw new Error(
        "Not on a supported page (Claude.ai or ChatGPT). Please navigate there first.",
      );
    }

    const selectors = PLATFORM_SELECTORS[platform];

    await waitForContent(selectors.messageContainer, 6000);

    const bodyClone = document.body.cloneNode(true);
    const imageUrls = extractImages(bodyClone, selectors.images);

    // Extract SVGs before cleanNode strips them
    const svgBlocks = extractSvgs(bodyClone);

    // Clean the clone
    cleanNode(bodyClone);

    // Try to get structured messages
    const messageEls = bodyClone.querySelectorAll(selectors.messageContainer);

    let lines = [];

    if (messageEls.length > 0) {
      messageEls.forEach((msgEl, idx) => {
        // Detect role
        let role = "Unknown";
        const isHuman =
          msgEl.matches(selectors.humanMessage) ||
          msgEl.querySelector(selectors.humanMessage.split(",")[0]);
        const isAI =
          msgEl.matches(selectors.aiMessage) ||
          msgEl.querySelector(selectors.aiMessage.split(",")[0]);

        if (platform === "claude.ai") {
          // Claude uses data-testid on parent containers
          const testId = msgEl.getAttribute("data-testid") || "";
          if (
            testId.includes("human") ||
            msgEl.closest('[data-testid*="human"]')
          )
            role = "User";
          else if (
            testId.includes("assistant") ||
            msgEl.closest('[data-testid*="assistant"]')
          )
            role = "AI (Claude)";
          else role = idx % 2 === 0 ? "User" : "AI (Claude)"; // fallback alternation
        } else {
          const authorRole =
            msgEl.getAttribute("data-message-author-role") ||
            msgEl
              .querySelector("[data-message-author-role]")
              ?.getAttribute("data-message-author-role");
          if (authorRole === "user") role = "User";
          else if (authorRole === "assistant") role = "AI (ChatGPT)";
          else role = "Unknown";
        }

        const text = htmlToMarkdown(msgEl).trim() || nodeToText(msgEl).trim();
        if (text.length > 5) {
          // Filter out UI chrome lines
          const filteredText = text
            .split('\n')
            .filter(line => {
              const trimmed = line.trim();
              // Skip empty lines
              if (!trimmed) return true;
              // Skip UI chrome patterns
              const uiPatterns = [
                /^(Fork from here|Advanced Edit|Search Conversation|Bookmark|Navigation|Chat style|TTS Settings|Export|Import|Usage flags|Preferences preset|Previous user message|Next user message|Length of the conversation|Session:|Messages left:|Reset in:|UUID:|====)/i,
                /^(Claude is AI and can make mistakes)/i,
                /^(Please double-check responses)/i,
                /^\d+%\s*(PEAK|peak)?$/i, // "29%PEAK"
              ];
              return !uiPatterns.some(pattern => pattern.test(trimmed));
            })
            .join('\n')
            .trim();

          if (filteredText.length > 5) {
            lines.push(`--- Message ${idx + 1} | Role: ${role} ---`);
            lines.push(filteredText);
            lines.push("");
          }
        }
      });
    }

    // Fallback: if no structured messages found, grab full page text
    if (lines.length === 0) {
      const fullText = nodeToText(bodyClone).trim();
      if (fullText.length > 100) {
        lines = [fullText];
      } else {
        throw new Error(
          "No conversation content found on this page. Please open a conversation first.",
        );
      }
    }

    // Collapse excess whitespace and clean up noise patterns
    let cleanedText = lines.join("\n");
    cleanedText = cleanedText
      .replace(/[ \t]+$/gm, "") // trailing spaces per line
      .replace(/\n{4,}/g, "\n\n\n") // max 3 consecutive newlines
      // Remove common UI noise patterns
      .replace(/^(Fork from here|Advanced Edit|Search Conversation|Bookmark this message|Navigation|Chat style:|TTS Settings|Export\/Import chat|Usage flags|Preferences preset:|Previous user message|Next user message|Length of the conversation.*|Session:.*|Messages left:.*|Reset in:.*|UUID:.*|====.*====)/gim, '')
      .replace(/\n{3,}/g, "\n\n") // collapse again after removals
      .trim();

    // Append any extracted SVG diagrams
    if (svgBlocks.length > 0) {
      cleanedText += "\n\n---\n## EXTRACTED SVG DIAGRAMS\n\n";
      svgBlocks.forEach((svg, i) => {
        cleanedText += `### Diagram ${i + 1}\n\`\`\`svg\n${svg}\n\`\`\`\n\n`;
      });
    }

    return {
      cleanedText,
      imageUrls,
      platform,
      messageCount: messageEls.length,
    };
  }

  /**
   * Gets bounding rectangles of all meaningful iframes on the page.
   * Returns an array of iframe metadata for screenshot cropping.
   * @returns {Array<{index, x, y, width, height, title, src, viewportX, viewportY}>}
   */
  function getIframeBounds() {
    const iframes = document.querySelectorAll('iframe');
    const bounds = [];

    iframes.forEach((iframe, i) => {
      const rect = iframe.getBoundingClientRect();
      // Only capture visible, meaningful iframes (height > 100px)
      if (rect.width > 100 && rect.height > 100) {
        bounds.push({
          index: i,
          // Absolute page coordinates
          pageX: Math.round(rect.left + window.scrollX),
          pageY: Math.round(rect.top + window.scrollY),
          // Current viewport coordinates (for cropping after scroll)
          viewportX: Math.round(rect.left),
          viewportY: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          title: iframe.getAttribute('title') || iframe.getAttribute('aria-label') || `Diagram ${i + 1}`,
          src: iframe.src || ''
        });
      }
    });

    return bounds;
  }

  // Expose extraction functions on window so the message listener (registered
  // outside this guard) can always call them, even after a second injection
  // re-runs the outer listener registration without re-running this block.
  window.__aiExtract = extractContent;
  window.__aiExtractPage = extractPageContent;
  window.__aiGetIframeBounds = getIframeBounds;
} // end if (!window.__aiExtractorInjected)

// ─── Message Listeners ────────────────────────────────────────────────────
// Registered OUTSIDE the injection guard so they are always re-registered
// even when content.js is injected a second time. This ensures both EXTRACT
// and EXTRACT_PAGE messages work correctly after double injection (Req 7.4).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "EXTRACT") {
    window
      .__aiExtract()
      .then((result) => {
        sendResponse({
          cleanedText: result.cleanedText,
          imageUrls: result.imageUrls,
          platform: result.platform,
          messageCount: result.messageCount,
        });
      })
      .catch((err) => {
        sendResponse({ error: err.message });
      });

    return true; // Keep message channel open for async
  }

  if (message.action === "EXTRACT_PAGE") {
    Promise.resolve()
      .then(() => window.__aiExtractPage())
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));

    return true; // Keep message channel open for async
  }

  if (message.action === "GET_IFRAME_BOUNDS") {
    try {
      const bounds = window.__aiGetIframeBounds();
      sendResponse({ bounds });
    } catch (err) {
      sendResponse({ error: err.message });
    }
    return true;
  }
});
