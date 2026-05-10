import { logError, clearErrorLog, getErrorLog } from "./modules/errorLogger.js";
import { handleHoverTranslation } from "./modules/translationHandler.js";
import { clearTranslationCache } from "./modules/translationCache.js";

// ----- Command Listeners for Keyboard Shortcuts -----
chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    case "translate-text":
      await handleHoverTranslation();
      break;
    // case "translate-input":
    //   await handleInputTranslation();
    //   break;
    default:
      console.warn("Background: unknown command received:", command);
  }
});

// ----- Message Listener for Cache Management and Error Logging -----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "clearTranslationCache":
      clearTranslationCache()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    case "logError":
      logError(new Error(message.error), {
        source: "content",
        context: message.context,
      })
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true;
    case "getErrorLog":
      getErrorLog()
        .then((log) => sendResponse({ log }))
        .catch((e) => sendResponse({ error: e.message }));
      return true;
    case "clearErrorLog":
      clearErrorLog()
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ error: e.message }));
      return true;
    default:
      console.warn(
        "Background: unknown message action received:",
        message.action,
      );
  }
});