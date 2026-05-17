import {
  showSpinner,
  getTextNodes,
  getContainerElement,
  hideSpinner,
  showError,
  revertTranslation,
  applyTranslation,
  escapeRegex,
} from "./modules/utils.js";
import { JATTUMNN_SEPARATOR } from "./modules/options.js";
import { showTranslationModal, closeModal, isModalOpen } from "./modules/modal.js";

const ACTIONS = {
  GET_TEXT: "getTextToTranslate",
  DISPLAY: "displayTranslation",
  SHOW_MODAL: "showTranslationModal",
};

const REQUEST_TIMEOUT = 6000;

let hoveredElement = null;
let activeRequests = new Map();

function handleMouseOver(event) {
  let target = event.target;
  if (target.nodeType === Node.TEXT_NODE) {
    target = target.parentElement;
  }
  hoveredElement = target;
}

function handleKeyDown(event) {
  if (event.altKey && event.key === 'q') {
    event.preventDefault();
    event.stopPropagation();
    if (isModalOpen()) {
      closeModal();
    } else {
      showTranslationModal();
    }
  }

  if (event.key === 'Escape' && isModalOpen()) {
    closeModal();
  }
}

function setupTimeout(requestId) {
  return setTimeout(() => {
    if (activeRequests.has(requestId)) {
      const stale = activeRequests.get(requestId);
      hideSpinner(stale.element);
      activeRequests.delete(requestId);
      console.warn(
        `[JATTUMNN] Request ${requestId} timed out and was cleaned up`,
      );
    }
  }, REQUEST_TIMEOUT);
}

function generateRequestId() {
  return crypto.randomUUID();
}

function handleGetTextToTranslate(request, sendResponse) {
  const container = hoveredElement
    ? getContainerElement(hoveredElement)
    : null;
  if (!container) {
    sendResponse({ text: "", skip: false, requestId: null });
    return true;
  }

  if (container._jattumnn_translated && container._jattumnn_textNodes) {
    revertTranslation(container, container._jattumnn_textNodes);
    const staleId = container._jattumnn_requestId;
    if (staleId && activeRequests.has(staleId)) {
      hideSpinner(container);
      activeRequests.delete(staleId);
    }
    sendResponse({ text: "", skip: true, requestId: null });
    return true;
  }

  const textNodes = getTextNodes(container);
  if (textNodes.length === 0) {
    sendResponse({ text: "", skip: false, requestId: null });
    return true;
  }

  const texts = textNodes.map((node) => node.nodeValue);
  const combinedText = texts.join(" " + JATTUMNN_SEPARATOR + " ");
  const requestId = generateRequestId();
  const startTime = performance.now();
  const timeoutId = setupTimeout(requestId);

  container._jattumnn_requestId = requestId;
  activeRequests.set(requestId, {
    element: container,
    textNodes,
    separator: JATTUMNN_SEPARATOR,
    startTime,
    timeoutId,
  });

  showSpinner(container);
  sendResponse({ text: combinedText, skip: false, requestId });
  return true;
}

function handleDisplayTranslation(request, sendResponse) {
  const { requestId, translatedText, error } = request;
  const pending = activeRequests.get(requestId);

  if (pending && pending.element) {
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }

    if (!pending.element.isConnected) {
      if (pending.element.querySelector) {
        hideSpinner(pending.element);
      }
      activeRequests.delete(requestId);
      sendResponse({ received: true });
      return true;
    }

    if (error) {
      console.error(`[JATTUMNN] Translation error: ${error}`);
      hideSpinner(pending.element);
      showError(pending.element, `Error: ${error}`);
    } else if (translatedText) {
      const elapsed = (performance.now() - pending.startTime).toFixed(2);
      console.log(`[JATTUMNN] Translation completed in ${elapsed} ms`);

      const segments = translatedText.split(new RegExp(escapeRegex(pending.separator)));
      applyTranslation(pending.element, pending.textNodes, segments);
      hideSpinner(pending.element);
    }
  }

  activeRequests.delete(requestId);
  sendResponse({ received: true });
  return true;
}

function handleShowTranslationModal(sendResponse) {
  showTranslationModal();
  sendResponse({ received: true });
  return true;
}

function handleMessage(request, sender, sendResponse) {
  switch (request.action) {
    case ACTIONS.GET_TEXT:
      return handleGetTextToTranslate(request, sendResponse);
    case ACTIONS.DISPLAY:
      return handleDisplayTranslation(request, sendResponse);
    case ACTIONS.SHOW_MODAL:
      return handleShowTranslationModal(sendResponse);
  }
}

document.addEventListener("mouseover", handleMouseOver);
document.addEventListener("keydown", handleKeyDown);
chrome.runtime.onMessage.addListener(handleMessage);
