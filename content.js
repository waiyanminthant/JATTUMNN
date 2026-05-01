// content.js – JATTUMNN
// Replaces all non‑empty text nodes inside the container, preserving HTML structure.
// Uses a fixed separator that the AI is instructed to preserve.

const JATTUMNN_SEPARATOR = '__SEP__';

let hoveredElement = null;
let activeRequests = new Map();

function getTextNodes(container) {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeValue.trim().length === 0) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function getContainerElement(element) {
  if (!element) return null;
  const container = element.closest("p, div, section, article, li, blockquote, h1, h2, h3, h4, h5, h6, td, th");
  return container || element;
}

function showSpinner(container) {
  if (!container) return;
  const existingSpinner = container.querySelector('.jattumnn-spinner');
  if (existingSpinner) existingSpinner.remove();
  const spinner = document.createElement('span');
  spinner.className = 'jattumnn-spinner';
  spinner.setAttribute('aria-label', 'Translating...');
  spinner.style.cssText = `
    display: inline-block;
    width: 0.6em;
    height: 0.6em;
    background-color: #3b82f6;
    border-radius: 50%;
    animation: jattumnn-pulse 1s ease-in-out infinite;
    margin-left: 8px;
    vertical-align: middle;
  `;
  if (!document.querySelector('#jattumnn-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'jattumnn-spinner-style';
    style.textContent = `
      @keyframes jattumnn-pulse {
        0%, 100% { opacity: 0.4; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.2); }
      }
    `;
    document.head.appendChild(style);
  }
  container.appendChild(spinner);
  return spinner;
}

function hideSpinner(container) {
  if (container) {
    const spinner = container.querySelector('.jattumnn-spinner');
    if (spinner) spinner.remove();
  }
}

function revertTranslation(container, textNodes) {
  if (!container || !textNodes) return false;
  let restored = false;
  for (const node of textNodes) {
    if (node._jattumnn_original) {
      node.nodeValue = node._jattumnn_original;
      restored = true;
    }
  }
  if (restored) {
    delete container._jattumnn_translated;
    delete container._jattumnn_textNodes;
    hideSpinner(container);
  }
  return restored;
}

function applyTranslation(container, textNodes, translatedSegments) {
  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];
    if (node._jattumnn_original === undefined) {
      node._jattumnn_original = node.nodeValue;
    }
  }
  for (let i = 0; i < textNodes.length && i < translatedSegments.length; i++) {
    textNodes[i].nodeValue = translatedSegments[i];
  }
  container._jattumnn_translated = true;
  container._jattumnn_textNodes = textNodes;
}

document.addEventListener("mouseover", (event) => {
  let target = event.target;
  if (target.nodeType === Node.TEXT_NODE) {
    target = target.parentElement;
  }
  hoveredElement = target;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTextToTranslate") {
    const container = hoveredElement ? getContainerElement(hoveredElement) : null;
    if (!container) {
      sendResponse({ text: "", skip: false, requestId: null });
      return true;
    }

    if (container._jattumnn_translated && container._jattumnn_textNodes) {
      revertTranslation(container, container._jattumnn_textNodes);
      sendResponse({ text: "", skip: true, requestId: null });
      return true;
    }

    const textNodes = getTextNodes(container);
    if (textNodes.length === 0) {
      sendResponse({ text: "", skip: false, requestId: null });
      return true;
    }

    const texts = textNodes.map(node => node.nodeValue);
    const combinedText = texts.join(JATTUMNN_SEPARATOR);
    const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    const startTime = performance.now();
    activeRequests.set(requestId, {
      element: container,
      textNodes: textNodes,
      separator: JATTUMNN_SEPARATOR,
      startTime: startTime
    });

    showSpinner(container);
    console.log(`[JATTUMNN] Translation started for container with ${textNodes.length} text nodes`);

    sendResponse({ text: combinedText, skip: false, requestId });
    return true;
  }

  if (request.action === "displayTranslation") {
    const { requestId, translatedText } = request;
    const pending = activeRequests.get(requestId);
    if (pending && pending.element) {
      const elapsed = (performance.now() - pending.startTime).toFixed(2);
      console.log(`[JATTUMNN] Translation completed in ${elapsed} ms`);

      const separator = pending.separator;
      const escapedSep = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const segments = translatedText.split(new RegExp(escapedSep));
      const cleanedSegments = segments.filter(seg => seg !== undefined);
      applyTranslation(pending.element, pending.textNodes, cleanedSegments);
      hideSpinner(pending.element);
    }
    activeRequests.delete(requestId);
    sendResponse({ received: true });
    return true;
  }

  return true;
});