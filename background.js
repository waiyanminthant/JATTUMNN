// background.js

chrome.commands.onCommand.addListener(async (command) => {
  let activeTab = null;
  switch (command) {
    default:
      console.warn("Background: unknown command received:", command);
      return;

    // Inside background.js, in the "translate-text" case:

    case "translate-text":
      try {
        const activeTab = await checkForActiveTab();
        if (!activeTab) {
          console.warn("Background: no active tab found");
          return;
        }

        // Ask content for text and get a requestId
        const response = await chrome.tabs.sendMessage(activeTab.id, {
          action: "getTextToTranslate",
        });

        if (response.skip) {
          // Already reverted, nothing more to do
          return;
        }

        const hoveredText = response?.text?.trim();
        const requestId = response?.requestId;
        if (!hoveredText || !requestId) {
          console.warn("Background: no text or missing requestId");
          return;
        }

        console.log("Original text:", hoveredText);

        // Translate (cached or API)
        const translatedText = await translateText(hoveredText);

        // Send translation back with the same requestId
        await chrome.tabs.sendMessage(activeTab.id, {
          action: "displayTranslation",
          requestId: requestId,
          translatedText: translatedText,
        });
      } catch (error) {
        // ... error handling (hide spinner if needed, but now spinner is per-element)
        console.error(error);
      }
      break;
  }
});

function catchScriptError(error) {
  if (error.message?.includes("Receiving end does not exist")) {
    console.warn(
      "Background: content script not ready or not injected in this tab",
    );
  } else {
    console.error("Background: failed to send message", error);
  }
}

async function checkForActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab) {
    return null;
  } else {
    return tab;
  }
}

async function translateText(text) {
  // 1. Check persistent cache
  const cached = await translationCache.get(text);
  if (cached) {
    console.log("Using cached translation for:", text.substring(0, 50));
    return cached;
  }

  // 2. Get API key and model from storage
  const { apiKey, aiModel } = await chrome.storage.sync.get([
    "apiKey",
    "aiModel",
  ]);
  if (!apiKey) throw new Error("API key not set.");
  if (!aiModel) throw new Error("AI model not selected.");

  // 3. Call DeepSeek API
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        {
          role: "system",
          content:
            "You are a translator. Translate the following text to English. Preserve formatting and only output the translated text, no explanations.",
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    let errorMsg = `API error: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMsg = errorData.error?.message || errorMsg;
    } catch (e) {}
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const translated = data.choices[0]?.message?.content?.trim();
  if (!translated) throw new Error("No translation returned");

  // 4. Store in persistent cache
  await translationCache.set(text, translated);
  console.log("Cached translation for:", text.substring(0, 50));

  return translated;
}

// ----- Persistent Translation Cache with LRU eviction -----
class TranslationCache {
  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
  }

  // Generate a safe storage key from original text (max 512 chars)
  _getStorageKey(text) {
    // Use a simple hash to keep keys short (djb2)
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 33) ^ text.charCodeAt(i);
    }
    return `trans_${hash >>> 0}`;
  }

  // Get list of recent keys (most recent first)
  async _getRecentKeys() {
    const { recentKeys = [] } = await chrome.storage.local.get("recentKeys");
    return recentKeys;
  }

  async _saveRecentKeys(keys) {
    await chrome.storage.local.set({ recentKeys: keys });
  }

  // Get translation from cache
  async get(originalText) {
    const key = this._getStorageKey(originalText);
    const result = await chrome.storage.local.get(key);
    if (result[key]) {
      // Move this key to front of recentKeys (LRU update)
      const recent = await this._getRecentKeys();
      const idx = recent.indexOf(key);
      if (idx !== -1) recent.splice(idx, 1);
      recent.unshift(key);
      await this._saveRecentKeys(recent);
      return result[key];
    }
    return null;
  }

  // Store translation in cache
  async set(originalText, translatedText) {
    const key = this._getStorageKey(originalText);
    const recent = await this._getRecentKeys();

    // If already exists, remove old position
    const existingIdx = recent.indexOf(key);
    if (existingIdx !== -1) recent.splice(existingIdx, 1);

    // Add to front
    recent.unshift(key);

    // Enforce max size
    while (recent.length > this.maxEntries) {
      const oldestKey = recent.pop();
      await chrome.storage.local.remove(oldestKey);
    }

    // Save new translation and updated recent list
    await Promise.all([
      chrome.storage.local.set({ [key]: translatedText }),
      this._saveRecentKeys(recent),
    ]);
  }

  // Clear entire cache
  async clear() {
    const recent = await this._getRecentKeys();
    if (recent.length) {
      await chrome.storage.local.remove(recent);
    }
    await chrome.storage.local.remove("recentKeys");
  }
}

const translationCache = new TranslationCache();

// Clear translation cache listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "clearTranslationCache") {
    translationCache
      .clear()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  // ... other message handlers if any
});
