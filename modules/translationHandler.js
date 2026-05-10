import { TranslationCache } from "./translationCache.js";
import { checkForActiveTab } from "./utils.js";
import { logError } from "./errorLogger.js";
import { DEFAULT_ENG_TRANSLATION_PROMPT, getProvider } from "./options.js";
import { callTranslationAPI, handleAPIError } from "./apiHandler.js";

const translationCache = new TranslationCache();

export async function translateText(text, timeoutMs = 5000) {
  // Cache check first
  const cached = await translationCache.get(text);
  if (cached) {
    console.log("[JATTUMNN] Using cached translation for:", text.substring(0, 50));
    return cached;
  }

  // Load all settings in one call
  const settings = await chrome.storage.sync.get([
    'selectedProvider',
    'apiKey_deepseek',
    'apiKey_openai',
    'apiKey_gemini',
    'apiKey_openai_compat',
    'baseUrl_openai_compat',
    'aiModel_deepseek',
    'aiModel_openai',
    'aiModel_gemini',
    'aiModel_openai_compat',
    'customPrompt',
  ]);

  // Resolve provider — default to deepseek for backwards compat
  const providerId = settings.selectedProvider || 'deepseek';
  const provider = getProvider(providerId);

  const apiKey = settings[`apiKey_${providerId}`] || '';
  const model  = settings[`aiModel_${providerId}`] || '';
  const customBaseUrl = settings['baseUrl_openai_compat'] || '';

  // Validate
  if (provider.id !== 'openai_compat' && !apiKey)
    throw new Error(`API key not set for ${provider.name}. Please configure in settings.`);
  if (provider.id === 'openai_compat' && !customBaseUrl)
    throw new Error('Base URL not set for OpenAI-Compatible. Please configure in settings.');
  if (!model)
    throw new Error(`AI model not selected for ${provider.name}. Please configure in settings.`);

  const systemPrompt = settings.customPrompt?.trim() || DEFAULT_ENG_TRANSLATION_PROMPT;

  try {
    const response = await callTranslationAPI(provider, apiKey, model, systemPrompt, text, timeoutMs, customBaseUrl);

    if (!response.ok) {
      await handleAPIError(provider, response);
    }

    const data = await response.json();
    const translated = provider.parseResponse(data);
    if (!translated)
      throw new Error("No translation returned from API. Returned data: " + JSON.stringify(data));

    await translationCache.set(text, translated);
    console.log("[JATTUMNN] Cached translation for:", text.substring(0, 50));
    return translated;

  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Translation timed out after ${timeoutMs / 1000} seconds. Please try again.`);
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

    const response = await chrome.tabs.sendMessage(activeTab.id, { action: "getTextToTranslate" });
    if (response.skip) return;

    const hoveredText = response?.text?.trim();
    const requestId   = response?.requestId;
    if (!hoveredText || !requestId) {
      console.warn("[JATTUMNN] No text or missing requestId");
      return;
    }

    console.log("[JATTUMNN] Original text:", hoveredText);

    try {
      const translatedText = await translateText(hoveredText, 5000);
      await chrome.tabs.sendMessage(activeTab.id, {
        action: "displayTranslation",
        requestId,
        translatedText,
        error: null,
      });
    } catch (translationError) {
      console.error("[JATTUMNN] Translation error:", translationError);
      await logError(translationError, { action: "hover", textPreview: hoveredText.substring(0, 100) });
      await chrome.tabs.sendMessage(activeTab.id, {
        action: "displayTranslation",
        requestId,
        translatedText: null,
        error: translationError.message || "Translation failed",
      });
    }
  } catch (error) {
    console.error("[JATTUMNN]", error);
    await logError(error, { action: "hover" });
  }
}