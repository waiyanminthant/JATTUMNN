// content.js
let hoveredElement = null;
let activeRequests = new Map();   // requestId -> { element, originalText, startTime }

document.addEventListener("mouseover", (event) => {
  hoveredElement = event.target;
});

function getContainerElement(element) {
  if (!element) return null;
  const container = element.closest("p, div, section, article, li, blockquote, h1, h2, h3, h4, h5, h6, td, th");
  return container || element;
}

function getFullTextFromElement(container) {
  if (!container) return "";
  return container.innerText.trim();
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

function revertTranslation(container) {
  if (container && container._originalText) {
    container.innerText = container._originalText;
    delete container._originalText;
    hideSpinner(container);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Request to translate (get text from hovered element)
  if (request.action === "getTextToTranslate") {
    const container = hoveredElement ? getContainerElement(hoveredElement) : null;
    if (!container) {
      sendResponse({ text: "", skip: false, requestId: null });
      return true;
    }
    // If already translated, revert immediately
    if (container._originalText) {
      revertTranslation(container);
      sendResponse({ text: "", skip: true, requestId: null });
      return true;
    }
    // Generate unique request ID
    const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    const text = getFullTextFromElement(container);
    const startTime = performance.now();
    activeRequests.set(requestId, { element: container, originalText: text, startTime });
    showSpinner(container);
    console.log(`[JATTUMNN] Translation started for: "${text.substring(0, 50)}${text.length > 50 ? '…' : ''}"`);
    sendResponse({ text, skip: false, requestId });
    return true;
  }

  // 2. Translation result (background sends back translated text with same requestId)
  if (request.action === "displayTranslation") {
    const { requestId, translatedText } = request;
    const pending = activeRequests.get(requestId);
    if (pending && pending.element && !pending.element._originalText) {
      const elapsed = (performance.now() - pending.startTime).toFixed(2);
      console.log(`[JATTUMNN] Translation completed in ${elapsed} ms`);
      console.log(`   Original: "${pending.originalText.substring(0, 60)}${pending.originalText.length > 60 ? '…' : ''}"`);
      console.log(`   Translated: "${translatedText.substring(0, 60)}${translatedText.length > 60 ? '…' : ''}"`);
      
      pending.element._originalText = pending.element.innerText;
      pending.element.innerText = translatedText;
    }
    if (pending && pending.element) {
      hideSpinner(pending.element);
    }
    activeRequests.delete(requestId);
    sendResponse({ received: true });
    return true;
  }

  return true;
});