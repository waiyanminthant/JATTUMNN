// background.js – JATTUMNN
// Handles translation via DeepSeek API, with persistent cache and separator preservation.

chrome.commands.onCommand.addListener(async (command) => {
  let activeTab = null;
  switch (command) {
    default:
      console.warn("Background: unknown command received:", command);
      return;
    case "translate-text":
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
          const translatedText = await translateText(hoveredText);
          await chrome.tabs.sendMessage(activeTab.id, {
            action: "displayTranslation",
            requestId: requestId,
            translatedText: translatedText,
            error: null
          });
        } catch (translationError) {
          console.error("Translation error:", translationError);
          await chrome.tabs.sendMessage(activeTab.id, {
            action: "displayTranslation",
            requestId: requestId,
            translatedText: null,
            error: translationError.message || "Translation failed"
          });
        }
      } catch (error) {
        console.error(error);
      }
      break;
  }
});

function catchScriptError(error) {
  if (error.message?.includes("Receiving end does not exist")) {
    console.warn("Background: content script not ready or not injected in this tab");
  } else {
    console.error("Background: failed to send message", error);
  }
}

async function checkForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function translateText(text) {
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
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "clearTranslationCache") {
    translationCache.clear()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});