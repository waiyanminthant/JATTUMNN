export async function checkForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

export function showSpinner(container) {
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

export function hideSpinner(container) {
  if (container) {
    const spinner = container.querySelector('.jattumnn-spinner');
    if (spinner) spinner.remove();
  }
}

export function getTextNodes(container) {
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

export function getContainerElement(element) {
  if (!element) return null;
  const container = element.closest("p, div, section, article, li, blockquote, h1, h2, h3, h4, h5, h6, td, th");
  return container || element;
}

export function showError(container, errorMessage) {
  if (!container) return;
  const existingError = container.querySelector('.jattumnn-error');
  if (existingError) existingError.remove();
  
  const errorSpan = document.createElement('span');
  errorSpan.className = 'jattumnn-error';
  errorSpan.textContent = `⚠️ ${errorMessage}`;
  errorSpan.style.cssText = `
    display: inline-block;
    color: #f87171;
    background-color: rgba(0,0,0,0.7);
    font-size: 0.8em;
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 8px;
    font-family: monospace;
    white-space: nowrap;
  `;
  container.appendChild(errorSpan);
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (errorSpan.parentNode) errorSpan.remove();
  }, 5000);
}

export function revertTranslation(container, textNodes) {
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

export function applyTranslation(container, textNodes, translatedSegments) {
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

// Helper – quick hash for the prompt (avoid huge keys)
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return hash.toString();
}