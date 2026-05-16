// content.js - Updated to use modal module

import {
  showSpinner,
  getTextNodes,
  getContainerElement,
  hideSpinner,
  showError,
  revertTranslation,
  applyTranslation,
} from "./modules/utils.js";
import { JATTUMNN_SEPARATOR } from "./modules/options.js";
import { showTranslationModal, closeModal, isModalOpen } from "./modules/modal.js";

let hoveredElement = null;
let activeRequests = new Map();

// Listen for mouseover to track the currently hovered element for translation requests
document.addEventListener("mouseover", (event) => {
  let target = event.target;
  if (target.nodeType === Node.TEXT_NODE) {
    target = target.parentElement;
  }
  hoveredElement = target;
});

// Listen for keyboard shortcut to open modal
document.addEventListener("keydown", async (event) => {
  // Check for Alt+Q
  if (event.altKey && event.key === 'q') {
    event.preventDefault();
    event.stopPropagation();
    
    if (!isModalOpen()) {
      await showTranslationModal();
    } else {
      closeModal();
    }
  }
  
  // Close modal on Escape key
  if (event.key === 'Escape' && isModalOpen()) {
    closeModal();
  }
});

// Keep existing message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTextToTranslate") {
    const container = hoveredElement
      ? getContainerElement(hoveredElement)
      : null;
    if (!container) {
      sendResponse({ text: "", skip: false, requestId: null });
      return true;
    }

    if (container._jattumnn_translated && container._jattumnn_textNodes) {
      revertTranslation(container, container._jattumnn_textNodes);
      // Clean up any stale request still tracked for this container
      for (const [id, req] of activeRequests) {
        if (req.element === container) {
          hideSpinner(container);
          activeRequests.delete(id);
        }
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
    const combinedText = texts.join(JATTUMNN_SEPARATOR);
    const requestId =
      Date.now() + "-" + Math.random().toString(36).substr(2, 6);
    const startTime = performance.now();
    
    const timeoutId = setTimeout(() => {
      if (activeRequests.has(requestId)) {
        const stale = activeRequests.get(requestId);
        hideSpinner(stale.element);
        activeRequests.delete(requestId);
        console.warn(
          `[JATTUMNN] Request ${requestId} timed out and was cleaned up`,
        );
      }
    }, 6000);
    
    activeRequests.set(requestId, {
      element: container,
      textNodes: textNodes,
      separator: JATTUMNN_SEPARATOR,
      startTime: startTime,
      timeoutId: timeoutId,
    });

    showSpinner(container);

    console.log(
      `[JATTUMNN] Translation started for container with ${textNodes.length} text nodes`,
    );

    sendResponse({ text: combinedText, skip: false, requestId });
    return true;
  }

  if (request.action === "displayTranslation") {
    const { requestId, translatedText, error } = request;
    const pending = activeRequests.get(requestId);

    if (pending && pending.element) {
      // Clear the timeout since we got a response
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      
      // CRITICAL FIX: Check if the element is still in the DOM
      if (!pending.element.isConnected) {
        // Element was removed from DOM while translation was in flight
        console.warn(
          `[JATTUMNN] Translation completed but target element no longer in DOM. Request ${requestId} abandoned.`,
        );
        // Clean up any spinner that might still be attached (if element somehow still has it)
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

        const separator = pending.separator;
        const escapedSep = separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const segments = translatedText.split(new RegExp(escapedSep));
        const cleanedSegments = segments.filter((seg) => seg !== undefined);
        applyTranslation(pending.element, pending.textNodes, cleanedSegments);
        hideSpinner(pending.element);
      }
    }

    activeRequests.delete(requestId);
    sendResponse({ received: true });
    return true;
  }
  
  if (request.action === "showTranslationModal") {
    showTranslationModal();
    sendResponse({ received: true });
    return true;
  }
});