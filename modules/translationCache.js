export class TranslationCache {
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
    const result = await chrome.storage.local.get([key, "recentKeys"]);
    const entry = result[key];
    // Collision guard: verify the stored text matches before returning
    if (entry && entry.originalText === originalText) {
      const recent = result.recentKeys || [];
      const idx = recent.indexOf(key);
      if (idx !== -1) recent.splice(idx, 1);
      recent.unshift(key);
      await this._saveRecentKeys(recent);
      return entry.translatedText;
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
      chrome.storage.local.set({ [key]: { originalText, translatedText } }),
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