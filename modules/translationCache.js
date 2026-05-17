// translationCache.js – fixed with stable JSON stringification
export class TranslationCache {
  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
  }

  // Stable JSON: sorts keys to ensure consistent string representation
  _stableStringify(obj) {
    if (!obj || typeof obj !== 'object') return JSON.stringify(obj);
    const sorted = Object.keys(obj).sort().reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});
    return JSON.stringify(sorted);
  }

  // Generate a key from original text + translation context
  _getStorageKey(text, context = {}) {
    const contextStr = this._stableStringify(context);
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
    
    // Compare using stable stringification
    if (entry && entry.originalText === originalText && 
        this._stableStringify(entry.context) === this._stableStringify(context)) {
      // Bump to front of recent keys
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
    
    // Enforce max entries
    while (recent.length > this.maxEntries) {
      const oldestKey = recent.pop();
      await chrome.storage.local.remove(oldestKey);
    }
    
    // Store with a stable-context copy
    const stableContext = JSON.parse(this._stableStringify(context));
    await Promise.all([
      chrome.storage.local.set({ 
        [key]: { originalText, translatedText, context: stableContext } 
      }),
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