import { logError, clearErrorLog, getErrorLog } from "./modules/errorLogger.js";
import { handleHoverTranslation } from "./modules/translationHandler.js";
import { clearTranslationCache } from "./modules/translationCache.js";

// ----- Command Listeners for Keyboard Shortcuts -----
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

// ----- Handler for input modal translation -----
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

// ----- Message Listener for Cache Management, Error Logging, and Input Translation -----
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
    case "translateInputText":
      handleInputTranslationRequest(message, sendResponse);
      return true;
    default:
      console.warn(
        "Background: unknown message action received:",
        message.action,
      );
  }
});

// ----- Handler for input text translation request from modal -----
async function handleInputTranslationRequest(message, sendResponse) {
  try {
    const { translateInputText } = await import("./modules/translationHandler.js");

    const translated = await translateInputText(
      message.text,
      message.targetLanguage,
      message.customPrompt,
      {
        selectedProvider: message.selectedProvider,
        apiKey_deepseek: message.apiKey_deepseek,
        apiKey_openai: message.apiKey_openai,
        apiKey_gemini: message.apiKey_gemini,
        apiKey_openai_compat: message.apiKey_openai_compat,
        baseUrl_openai_compat: message.baseUrl_openai_compat,
        aiModel_deepseek: message.aiModel_deepseek,
        aiModel_openai: message.aiModel_openai,
        aiModel_gemini: message.aiModel_gemini,
        aiModel_openai_compat: message.aiModel_openai_compat,
      },
      5000 // timeout
    );

    sendResponse({ translatedText: translated, error: null });
  } catch (error) {
    console.error("[JATTUMNN] Input translation error:", error);
    sendResponse({ translatedText: null, error: error.message || "Translation failed" });
  }
}