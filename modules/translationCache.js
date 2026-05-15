// translationCache.js – fixed version
export class TranslationCache {
  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
  }

  // Generate a key from original text + translation context
  _getStorageKey(text, context = {}) {
    // context should include anything that affects translation output:
    // provider, model, customPrompt (or a hash of it)
    const contextStr = JSON.stringify(context);
    let hash = 5381;
    const combined = text + '|' + contextStr;
    for (let i = 0; i < combined.length; i++) {
      hash = (hash * 33) ^ combined.charCodeAt(i);
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

  async get(originalText, context = {}) {
    const key = this._getStorageKey(originalText, context);
    const result = await chrome.storage.local.get([key, "recentKeys"]);
    const entry = result[key];
    // Also verify stored context matches (optional but safe)
    if (entry && entry.originalText === originalText && JSON.stringify(entry.context) === JSON.stringify(context)) {
      const recent = result.recentKeys || [];
      const idx = recent.indexOf(key);
      if (idx !== -1) recent.splice(idx, 1);
      recent.unshift(key);
      await this._saveRecentKeys(recent);
      return entry.translatedText;
    }
    return null;
  }

  async set(originalText, translatedText, context = {}) {
    const key = this._getStorageKey(originalText, context);
    const recent = await this._getRecentKeys();
    const existingIdx = recent.indexOf(key);
    if (existingIdx !== -1) recent.splice(existingIdx, 1);
    recent.unshift(key);
    while (recent.length > this.maxEntries) {
      const oldestKey = recent.pop();
      await chrome.storage.local.remove(oldestKey);
    }
    await Promise.all([
      chrome.storage.local.set({ [key]: { originalText, translatedText, context } }),
      this._saveRecentKeys(recent),
    ]);
  }

  async clear() {
    const recent = await this._getRecentKeys();
    if (recent.length) await chrome.storage.local.remove(recent);
    await chrome.storage.local.remove("recentKeys");
  }
}

export function clearTranslationCache() {
  const cache = new TranslationCache();
  return cache.clear();
}