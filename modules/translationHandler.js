import { TranslationCache } from "./translationCache.js";
import { checkForActiveTab } from "./utils.js";
import { logError } from "./errorLogger.js";
import {
  DEFAULT_DEEPSEEK_API_URL,
  DEFAULT_ENG_TRANSLATION_PROMPT,
} from "./options.js";
import { callTranslationAPI, handleAPIError } from "./apiHandler.js";

const translationCache = new TranslationCache();

export async function translateText(text, timeoutMs = 5000) {
  // Check cache first
  const cached = await translationCache.get(text);

  // If cached translation exists, return it immediately
  if (cached) {
    console.log("Using cached translation for:", text.substring(0, 50));
    return cached;
  }

  // If not cached, proceed to call the DeepSeek API
  const { apiKey, aiModel, customPrompt } = await chrome.storage.sync.get([
    "apiKey",
    "aiModel",
    "customPrompt",
  ]);

  // Validate API key and model before making the request
  if (!apiKey)
    throw new Error("API key not set. Please configure in settings.");
  if (!aiModel)
    throw new Error("AI model not selected. Please configure in settings.");

  // Use custom prompt if provided, otherwise use default prompt
  let systemPrompt =
    customPrompt && customPrompt.trim() !== ""
      ? customPrompt.trim()
      : DEFAULT_ENG_TRANSLATION_PROMPT;

  // Set up an AbortController to handle timeouts for the API request
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await callTranslationAPI(
      apiKey,
      aiModel,
      systemPrompt,
      text,
      timeoutMs,
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      handleAPIError(response);
    }

    const data = await response.json();
    const translated = data.choices[0]?.message?.content?.trim();
    if (!translated)
      throw new Error(
        "No translation returned from API. Returned data: " +
          JSON.stringify(data),
      );

    await translationCache.set(text, translated);

    console.log("Cached translation for:", text.substring(0, 50));

    return translated;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      const timeoutError = new Error(
        `Translation timed out after ${timeoutMs / 1000} seconds. Please try again.`,
      );
      await logError(timeoutError, { apiCall: "deepseek", timeout: timeoutMs });
      throw timeoutError;
    }
    await logError(error, { apiCall: "deepseek" });
    throw error;
  }
}

export async function handleHoverTranslation() {
  try {
    const activeTab = await checkForActiveTab();
    if (!activeTab) {
      console.warn("Background: no active tab found");
      return;
    }
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      action: "getTextToTranslate",
    });
    if (response.skip) return;
    const hoveredText = response?.text?.trim();
    const requestId = response?.requestId;
    if (!hoveredText || !requestId) {
      console.warn("Background: no text or missing requestId");
      return;
    }
    console.log("Original text:", hoveredText);

    try {
      const translatedText = await translateText(hoveredText, 5000);
      await chrome.tabs.sendMessage(activeTab.id, {
        action: "displayTranslation",
        requestId: requestId,
        translatedText: translatedText,
        error: null,
      });
    } catch (translationError) {
      console.error("Translation error:", translationError);
      await logError(translationError, {
        action: "hover",
        textPreview: hoveredText.substring(0, 100),
      });
      await chrome.tabs.sendMessage(activeTab.id, {
        action: "displayTranslation",
        requestId: requestId,
        translatedText: null,
        error: translationError.message || "Translation failed",
      });
    }
  } catch (error) {
    console.error(error);
    await logError(error, { action: "hover" });
  }
}
