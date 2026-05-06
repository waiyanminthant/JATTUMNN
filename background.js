// background.js – JATTUMNN
// Handles translation via DeepSeek API, with persistent cache, separator preservation, timeout, and error logging.

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

async function handleHoverTranslation() {
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
        error: null
      });
    } catch (translationError) {
      console.error("Translation error:", translationError);
      await logError(translationError, { action: 'hover', textPreview: hoveredText.substring(0, 100) });
      await chrome.tabs.sendMessage(activeTab.id, {
        action: "displayTranslation",
        requestId: requestId,
        translatedText: null,
        error: translationError.message || "Translation failed"
      });
    }
  } catch (error) {
    console.error(error);
    await logError(error, { action: 'hover' });
  }
}

async function handleInputTranslation() {
  // Placeholder for future implementation
  console.log("Input translation command received – feature coming soon");
}

function catchScriptError(error) {
  if (error.message?.includes("Receiving end does not exist")) {
    console.warn("Background: content script not ready or not injected in this tab");
  } else {
    console.error("Background: failed to send message", error);
    logError(error, { source: 'background' });
  }
}

async function checkForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function translateText(text, timeoutMs = 5000) {
  const cached = await translationCache.get(text);
  if (cached) {
    console.log("Using cached translation for:", text.substring(0, 50));
    return cached;
  }

  const { apiKey, aiModel, customPrompt } = await chrome.storage.sync.get(["apiKey", "aiModel", "customPrompt"]);
  if (!apiKey) throw new Error("API key not set. Please configure in settings.");
  if (!aiModel) throw new Error("AI model not selected. Please configure in settings.");

  let systemPrompt = customPrompt && customPrompt.trim() !== "" 
    ? customPrompt.trim() 
    : "Translate to English. Keep formatting, spacing, and the separator '__SEP__' unchanged. Output only the translation, no explanations.";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        thinking: { "type": "disabled" },
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `API error: ${response.status}`;
      if (response.status === 401) errorMsg = "Invalid API key. Please check your DeepSeek API key.";
      if (response.status === 429) errorMsg = "Rate limit exceeded. Please wait and try again.";
      if (response.status === 402) errorMsg = "Insufficient balance. Please top up your DeepSeek account.";
      try {
        const errorData = await response.json();
        errorMsg = errorData.error?.message || errorMsg;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const translated = data.choices[0]?.message?.content?.trim();
    if (!translated) throw new Error("No translation returned from API");

    await translationCache.set(text, translated);
    console.log("Cached translation for:", text.substring(0, 50));
    return translated;

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Translation timed out after ${timeoutMs/1000} seconds. Please try again.`);
      await logError(timeoutError, { apiCall: 'deepseek', timeout: timeoutMs });
      throw timeoutError;
    }
    await logError(error, { apiCall: 'deepseek' });
    throw error;
  }
}

// ----- Persistent Translation Cache -----
class TranslationCache {
  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
  }
  _getStorageKey(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 33) ^ text.charCodeAt(i);
    }
    return `trans_${hash >>> 0}`;
  }
  async _getRecentKeys() {
    const { recentKeys = [] } = await chrome.storage.local.get("recentKeys");
    return recentKeys;
  }
  async _saveRecentKeys(keys) {
    await chrome.storage.local.set({ recentKeys: keys });
  }
  async get(originalText) {
    const key = this._getStorageKey(originalText);
    const result = await chrome.storage.local.get(key);
    if (result[key]) {
      const recent = await this._getRecentKeys();
      const idx = recent.indexOf(key);
      if (idx !== -1) recent.splice(idx, 1);
      recent.unshift(key);
      await this._saveRecentKeys(recent);
      return result[key];
    }
    return null;
  }
  async set(originalText, translatedText) {
    const key = this._getStorageKey(originalText);
    const recent = await this._getRecentKeys();
    const existingIdx = recent.indexOf(key);
    if (existingIdx !== -1) recent.splice(existingIdx, 1);
    recent.unshift(key);
    while (recent.length > this.maxEntries) {
      const oldestKey = recent.pop();
      await chrome.storage.local.remove(oldestKey);
    }
    await Promise.all([
      chrome.storage.local.set({ [key]: translatedText }),
      this._saveRecentKeys(recent),
    ]);
  }
  async clear() {
    const recent = await this._getRecentKeys();
    if (recent.length) await chrome.storage.local.remove(recent);
    await chrome.storage.local.remove("recentKeys");
  }
}

const translationCache = new TranslationCache();

// ----- Error Logging -----
const MAX_LOG_ENTRIES = 100;

async function logError(error, context = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message: error.message || String(error),
    stack: error.stack,
    context: context,
    type: error.name || 'Error'
  };
  
  try {
    const { errorLog = [] } = await chrome.storage.local.get('errorLog');
    errorLog.unshift(logEntry);
    if (errorLog.length > MAX_LOG_ENTRIES) errorLog.pop();
    await chrome.storage.local.set({ errorLog });
    console.log('[JATTUMNN] Error logged:', logEntry.message);
  } catch (e) {
    console.error('Failed to write error log:', e);
  }
}

async function clearErrorLog() {
  await chrome.storage.local.set({ errorLog: [] });
}

async function getErrorLog() {
  const { errorLog = [] } = await chrome.storage.local.get('errorLog');
  return errorLog;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "clearTranslationCache") {
    translationCache.clear()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === "logError") {
    logError(new Error(message.error), { source: 'content', context: message.context }).then(() => {
      sendResponse({ success: true });
    }).catch(() => sendResponse({ success: false }));
    return true;
  }
  if (message.action === "getErrorLog") {
    getErrorLog().then(log => sendResponse({ log })).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (message.action === "clearErrorLog") {
    clearErrorLog().then(() => sendResponse({ success: true })).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  return true;
});