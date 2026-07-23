export class TranslationCache {
  constructor(maxBytes = 5 * 1024 * 1024) {
    this.maxBytes = maxBytes;
  }

  _sortKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => this._sortKeys(v));
    return Object.keys(obj).sort().reduce((acc, key) => {
      acc[key] = this._sortKeys(obj[key]);
      return acc;
    }, {});
  }

  _stableStringify(obj) {
    return JSON.stringify(this._sortKeys(obj));
  }

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

    if (entry && entry.originalText === originalText &&
        this._stableStringify(entry.context) === this._stableStringify(context)) {
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

    const stableContext = JSON.parse(this._stableStringify(context));
    await chrome.storage.local.set({
      [key]: { originalText, translatedText, context: stableContext }
    });

    while (recent.length > 0) {
      const bytesInUse = await chrome.storage.local.getBytesInUse(recent);
      if (bytesInUse <= this.maxBytes) break;
      const oldestKey = recent.pop();
      await chrome.storage.local.remove(oldestKey);
    }
    await this._saveRecentKeys(recent);
  }

  async clear() {
    const recent = await this._getRecentKeys();
    if (recent.length) await chrome.storage.local.remove(recent);
    await chrome.storage.local.remove("recentKeys");
  }
}

let _sharedCache;

export function clearTranslationCache() {
  if (!_sharedCache) {
    _sharedCache = new TranslationCache();
  }
  return _sharedCache.clear();
}
