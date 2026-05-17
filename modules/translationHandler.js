import { TranslationCache } from "./translationCache.js";
import { checkForActiveTab, simpleHash } from "./utils.js";
import { logError } from "./errorLogger.js";
import { DEFAULT_ENG_TRANSLATION_PROMPT, getProvider, PROVIDER_STORAGE_KEYS, LANGUAGE_NAMES } from "./options.js";
import { callTranslationAPI, handleAPIError } from "./apiHandler.js";

const TRANSLATION_TIMEOUT = 5000;
const translationCache = new TranslationCache();

function validateProviderConfig(provider, apiKey, model, customBaseUrl) {
  if (provider.id !== "openai_compat" && !apiKey)
    throw new Error(`API key not set for ${provider.name}. Please configure in settings.`);
  if (provider.id === "openai_compat" && !customBaseUrl)
    throw new Error("Base URL not set for OpenAI-Compatible. Please configure in settings.");
  if (!model)
    throw new Error(`AI model not selected for ${provider.name}. Please configure in settings.`);
}

async function sendTranslationResponse(tabId, requestId, translatedText, error) {
  await chrome.tabs.sendMessage(tabId, {
    action: "displayTranslation",
    requestId,
    translatedText,
    error,
  });
}

export async function translateText(text, timeoutMs = TRANSLATION_TIMEOUT) {
  const settings = await chrome.storage.local.get(PROVIDER_STORAGE_KEYS);

  const providerId = settings.selectedProvider || "deepseek";
  const provider = getProvider(providerId);
  const apiKey = settings[`apiKey_${providerId}`] || "";
  const model = settings[`aiModel_${providerId}`] || "";
  const customBaseUrl = settings["baseUrl_openai_compat"] || "";
  const systemPrompt = settings.customPrompt?.trim() || DEFAULT_ENG_TRANSLATION_PROMPT;

  const context = {
    provider: providerId,
    model,
    promptHash: simpleHash(systemPrompt),
  };

  const cached = await translationCache.get(text, context);
  if (cached) {
    console.log("[JATTUMNN] Cache HIT for:", text.substring(0, 50));
    return cached;
  }
  console.log("[JATTUMNN] Cache MISS for:", text.substring(0, 50));

  validateProviderConfig(provider, apiKey, model, customBaseUrl);

  try {
    const response = await callTranslationAPI(
      provider, apiKey, model, systemPrompt, text, timeoutMs, customBaseUrl
    );
    if (!response.ok) await handleAPIError(provider, response);

    const data = await response.json();
    const translated = provider.parseResponse(data);
    if (!translated)
      throw new Error("No translation returned from API. Returned data: " + JSON.stringify(data));

    await translationCache.set(text, translated, context);
    console.log("[JATTUMNN] Cached translation for:", text.substring(0, 50));
    return translated;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`Translation timed out after ${timeoutMs / 1000} seconds.`);
      await logError(timeoutError, { provider: providerId, timeout: timeoutMs });
      throw timeoutError;
    }
    await logError(error, { provider: providerId });
    throw error;
  }
}

export async function handleHoverTranslation() {
  try {
    const activeTab = await checkForActiveTab();
    if (!activeTab) {
      console.warn("[JATTUMNN] No active tab found");
      return;
    }

    const response = await chrome.tabs.sendMessage(activeTab.id, {
      action: "getTextToTranslate",
    });
    if (response.skip) return;

    const hoveredText = response?.text?.trim();
    const requestId = response?.requestId;
    if (!hoveredText || !requestId) {
      console.warn("[JATTUMNN] No text or missing requestId");
      return;
    }

    console.log("[JATTUMNN] Original text:", hoveredText);

    try {
      const translatedText = await translateText(hoveredText);
      await sendTranslationResponse(activeTab.id, requestId, translatedText, null);
    } catch (translationError) {
      console.error("[JATTUMNN] Translation error:", translationError);
      await logError(translationError, {
        action: "hover",
        textPreview: hoveredText.substring(0, 100),
      });
      await sendTranslationResponse(activeTab.id, requestId, null, translationError.message || "Translation failed");
    }
  } catch (error) {
    console.error("[JATTUMNN]", error);
    await logError(error, { action: "hover" });
  }
}

export async function translateInputText(text, targetLanguage, customPrompt, timeoutMs = TRANSLATION_TIMEOUT) {
  const settings = await chrome.storage.local.get(PROVIDER_STORAGE_KEYS);

  let systemPrompt = customPrompt;
  if (!systemPrompt) {
    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    systemPrompt = `Translate the following text to ${targetLangName}.
For proper nouns (names of people, places, brands), keep them in their original spelling.
Maintain formatting and spacing. Output only the translation, no explanations.`;
  }

  const providerId = settings.selectedProvider || "deepseek";
  const provider = getProvider(providerId);
  const apiKey = settings[`apiKey_${providerId}`] || "";
  const model = settings[`aiModel_${providerId}`] || "";
  const customBaseUrl = settings["baseUrl_openai_compat"] || "";

  validateProviderConfig(provider, apiKey, model, customBaseUrl);

  try {
    const response = await callTranslationAPI(
      provider, apiKey, model, systemPrompt, text, timeoutMs, customBaseUrl
    );
    if (!response.ok) await handleAPIError(provider, response);

    const data = await response.json();
    const translated = provider.parseResponse(data);
    if (!translated)
      throw new Error("No translation returned from API. Returned data: " + JSON.stringify(data));

    console.log("[JATTUMNN] Input text translation completed");
    return translated;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`Translation timed out after ${timeoutMs / 1000} seconds.`);
      await logError(timeoutError, { provider: providerId, timeout: timeoutMs, action: "modal" });
      throw timeoutError;
    }
    await logError(error, { provider: providerId, action: "modal", inputPreview: text.substring(0, 100) });
    throw error;
  }
}
