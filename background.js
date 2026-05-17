import { logError, clearErrorLog, getErrorLog } from "./modules/errorLogger.js";
import { handleHoverTranslation, translateInputText } from "./modules/translationHandler.js";
import { clearTranslationCache } from "./modules/translationCache.js";

const ACTIONS = {
  CLEAR_CACHE: "clearTranslationCache",
  LOG_ERROR: "logError",
  GET_ERROR_LOG: "getErrorLog",
  CLEAR_ERROR_LOG: "clearErrorLog",
  TRANSLATE_INPUT: "translateInputText",
};

const INPUT_TRANSLATION_TIMEOUT = 5000;

function respondAsync(sendResponse, fn) {
  fn()
    .then((result) => sendResponse(result ?? { success: true }))
    .catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
}

chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    case "translate-text":
      await handleHoverTranslation();
      break;
    case "translate-input":
      await handleInputTranslation();
      break;
    default:
      console.warn("Background: unknown command received:", command);
  }
});

async function handleInputTranslation() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      console.warn("[JATTUMNN] No active tab found");
      return;
    }
    await chrome.tabs.sendMessage(tab.id, { action: "showTranslationModal" });
  } catch (err) {
    console.error("[JATTUMNN] Error showing modal:", err);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case ACTIONS.CLEAR_CACHE:
      return respondAsync(sendResponse, () => clearTranslationCache());
    case ACTIONS.LOG_ERROR:
      return respondAsync(sendResponse, () =>
        logError(new Error(message.error), { source: "content", context: message.context })
      );
    case ACTIONS.GET_ERROR_LOG:
      return respondAsync(sendResponse, async () => {
        const log = await getErrorLog();
        return { log, success: true };
      });
    case ACTIONS.CLEAR_ERROR_LOG:
      return respondAsync(sendResponse, () => clearErrorLog());
    case ACTIONS.TRANSLATE_INPUT:
      return handleInputTranslationRequest(message, sendResponse);
    default:
      console.warn("Background: unknown message action received:", message.action);
  }
});

async function handleInputTranslationRequest(message, sendResponse) {
  try {
    const translated = await translateInputText(
      message.text,
      message.targetLanguage,
      message.customPrompt,
      INPUT_TRANSLATION_TIMEOUT
    );

    sendResponse({ translatedText: translated, error: null });
  } catch (error) {
    console.error("[JATTUMNN] Input translation error:", error);
    sendResponse({ translatedText: null, error: error.message || "Translation failed" });
  }
}
