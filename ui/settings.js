// settings.js – JATTUMNN (multi-provider edition) with modal settings

const DEFAULT_ENG_TRANSLATION_PROMPT = "Translate to English. For proper nouns (names of people, places, brands), reverse-transliterate them back to their original English spelling. Keep formatting, spacing, and the separator '__SEP__' unchanged. Output only the translation, no explanations."

// Default modal settings
const DEFAULT_TARGET_LANGUAGE = "th";
const DEFAULT_USE_MODAL_CUSTOM_PROMPT = false;
const DEFAULT_MODAL_CUSTOM_PROMPT = "Translate to {targetLanguage}. For proper nouns (names of people, places, brands), keep them in their original spelling. Maintain formatting and spacing. Output only the translation, no explanations.";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PROVIDER_IDS = ['deepseek', 'openai', 'gemini', 'openai_compat'];

// All storage keys we ever read or write
const ALL_STORAGE_KEYS = [
  'username', 'userId', 'email',
  'selectedProvider', 'customPrompt',
  'defaultTargetLanguage', 'useModalCustomPrompt', 'modalCustomPrompt',
  'apiKey_deepseek', 'apiKey_openai', 'apiKey_gemini', 'apiKey_openai_compat',
  'baseUrl_openai_compat',
  'aiModel_deepseek', 'aiModel_openai', 'aiModel_gemini', 'aiModel_openai_compat',
  // Legacy key from pre-multi-provider version
  'apiKey',
];

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
function showStatus(message, isError = false) {
  const el = document.getElementById('statusMsg');
  el.textContent = message;
  el.style.color = isError ? '#f87171' : '#3b82f6';
  setTimeout(() => { el.textContent = ''; }, 3000);
}

function showPromptStatus(message, isError = false) {
  const el = document.getElementById('promptStatus');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#f87171' : '#3b82f6';
  setTimeout(() => { el.textContent = ''; }, 2500);
}

// ---------------------------------------------------------------------------
// UUID
// ---------------------------------------------------------------------------
function generateUUID() {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Modal settings UI helpers
// ---------------------------------------------------------------------------
function toggleModalPromptField() {
  const checkbox = document.getElementById('useModalCustomPrompt');
  const modalPromptField = document.getElementById('modalPromptField');
  
  if (checkbox && modalPromptField) {
    modalPromptField.style.display = checkbox.checked ? '' : 'none';
  }
}

/ Update the updateModalPromptPreview function to include Thai
function updateModalPromptPreview() {
  const useCustom = document.getElementById('useModalCustomPrompt')?.checked || false;
  const customPrompt = document.getElementById('modalCustomPrompt')?.value || '';
  const defaultLang = document.getElementById('defaultTargetLanguage')?.value || 'th';
  
  const previewDiv = document.getElementById('modalPromptPreview');
  if (!previewDiv) return;
  
  // Complete language mapping including Thai
  const languageNames = {
    'th': 'Thai',
    'en': 'English', 
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'zh': 'Chinese (Simplified)',
    'ja': 'Japanese',
    'ko': 'Korean',
    'ar': 'Arabic',
    'hi': 'Hindi'
  };
  const targetLangName = languageNames[defaultLang] || defaultLang;
  
  if (useCustom && customPrompt) {
    let preview = customPrompt.replace(/{targetLanguage}/g, targetLangName);
    previewDiv.innerHTML = `<strong>Using custom prompt:</strong><br><span style="color: #e0e0e0;">${escapeHtml(preview)}</span>`;
  } else {
    const defaultPrompt = DEFAULT_MODAL_CUSTOM_PROMPT.replace(/{targetLanguage}/g, targetLangName);
    previewDiv.innerHTML = `<strong>Using default prompt:</strong><br><span style="color: #e0e0e0;">${escapeHtml(defaultPrompt)}</span>`;
  }
}

// ---------------------------------------------------------------------------
// Provider UI switching
// Hides / shows the right API key field and base URL field based on selection.
// ---------------------------------------------------------------------------
function applyProviderUI(providerId) {
  // Hide all provider-specific key fields
  PROVIDER_IDS.forEach(id => {
    const el = document.getElementById(`field-apiKey-${id}`);
    if (el) el.style.display = 'none';
  });

  // Show the active one
  const activeField = document.getElementById(`field-apiKey-${providerId}`);
  if (activeField) activeField.style.display = '';

  // Base URL field only for openai_compat
  const baseUrlField = document.getElementById('field-baseUrl');
  if (baseUrlField) baseUrlField.style.display = providerId === 'openai_compat' ? '' : 'none';

  // Update model helper note
  const note = document.getElementById('modelHelperNote');
  if (note) {
    note.textContent = providerId === 'openai_compat'
      ? '💡 Enter the base URL above, then click Refresh to load models. If your server doesn\'t expose /models, type the model name manually below.'
      : '💡 Save your API key first, then click Refresh to load available models.';
  }

  // Reset model select
  const modelSelect = document.getElementById('aiModel');
  modelSelect.innerHTML = '<option value="">-- Configure provider above and refresh --</option>';
  modelSelect.disabled = true;

  // Hide manual model input (will be shown only on fetch failure for openai_compat)
  document.getElementById('manualModel').style.display = 'none';

  // Enable refresh only if there's something to work with
  updateRefreshBtnState(providerId);
}

function updateRefreshBtnState(providerId) {
  const btn = document.getElementById('refreshModelsBtn');
  if (providerId === 'openai_compat') {
    const baseUrl = document.getElementById('baseUrl_openai_compat')?.value?.trim();
    btn.disabled = !baseUrl;
  } else {
    const apiKey = document.getElementById(`apiKey_${providerId}`)?.value?.trim();
    btn.disabled = !apiKey;
  }
}

// ---------------------------------------------------------------------------
// Load all settings (single storage call)
// ---------------------------------------------------------------------------
async function loadSettings() {
  const result = await chrome.storage.local.get(ALL_STORAGE_KEYS);

  // --- Migrate legacy single apiKey -> apiKey_deepseek ---
  if (result.apiKey && !result.apiKey_deepseek) {
    await chrome.storage.local.set({ apiKey_deepseek: result.apiKey });
    result.apiKey_deepseek = result.apiKey;
    console.log('[JATTUMNN] Migrated legacy apiKey -> apiKey_deepseek');
  }

  // --- Auto-generate userId ---
  if (!result.userId) {
    const newId = generateUUID();
    await chrome.storage.local.set({ userId: newId });
    result.userId = newId;
  }

  // --- Populate user fields ---
  document.getElementById('username').value = result.username || '';
  document.getElementById('userId').value   = result.userId;
  document.getElementById('email').value    = result.email    || '';

  // --- Populate all API key inputs ---
  PROVIDER_IDS.forEach(id => {
    const el = document.getElementById(`apiKey_${id}`);
    if (el) el.value = result[`apiKey_${id}`] || '';
  });

  // --- Base URL for openai_compat ---
  const baseUrlEl = document.getElementById('baseUrl_openai_compat');
  if (baseUrlEl) baseUrlEl.value = result['baseUrl_openai_compat'] || '';

  // --- Modal Translation Settings ---
  const defaultTargetLanguage = document.getElementById('defaultTargetLanguage');
  if (defaultTargetLanguage) {
    defaultTargetLanguage.value = result.defaultTargetLanguage || DEFAULT_TARGET_LANGUAGE;
  }
  
  const useModalCustomPrompt = document.getElementById('useModalCustomPrompt');
  if (useModalCustomPrompt) {
    useModalCustomPrompt.checked = result.useModalCustomPrompt !== undefined ? result.useModalCustomPrompt : DEFAULT_USE_MODAL_CUSTOM_PROMPT;
  }
  
  const modalCustomPrompt = document.getElementById('modalCustomPrompt');
  if (modalCustomPrompt) {
    modalCustomPrompt.value = result.modalCustomPrompt || DEFAULT_MODAL_CUSTOM_PROMPT;
  }
  
  // Toggle modal prompt field visibility based on checkbox
  toggleModalPromptField();
  updateModalPromptPreview();
  
  // Add event listeners for modal settings
  if (defaultTargetLanguage) {
    defaultTargetLanguage.addEventListener('change', () => {
      saveModalSetting('defaultTargetLanguage', defaultTargetLanguage.value);
      updateModalPromptPreview();
    });
  }
  
  if (useModalCustomPrompt) {
    useModalCustomPrompt.addEventListener('change', () => {
      saveModalSetting('useModalCustomPrompt', useModalCustomPrompt.checked);
      toggleModalPromptField();
      updateModalPromptPreview();
    });
  }
  
  if (modalCustomPrompt) {
    modalCustomPrompt.addEventListener('input', () => {
      // Debounce save
      clearTimeout(window.modalPromptTimeout);
      window.modalPromptTimeout = setTimeout(() => {
        saveModalSetting('modalCustomPrompt', modalCustomPrompt.value);
        updateModalPromptPreview();
      }, 500);
    });
  }

  // --- Provider selector ---
  const providerId = result.selectedProvider || 'deepseek';
  const providerSelect = document.getElementById('providerSelect');
  providerSelect.value = providerId;
  applyProviderUI(providerId);

  // --- Prompt ---
  document.getElementById('customPrompt').value = result.customPrompt || DEFAULT_ENG_TRANSLATION_PROMPT;

  // --- Load saved model then try to populate model list ---
  await loadModelsForProvider(providerId, result, false);
}

// Helper to save modal settings
async function saveModalSetting(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    showStatus(`${key} saved!`, false);
  } catch (err) {
    console.error(`[JATTUMNN] Save error for ${key}:`, err);
    showStatus(`Failed to save ${key}`, true);
  }
}

// ---------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------
async function loadModelsForProvider(providerId, storedSettings, showStatusMsg) {
  const apiKey    = storedSettings[`apiKey_${providerId}`]    || '';
  const baseUrl   = storedSettings['baseUrl_openai_compat']   || '';
  const savedModel = storedSettings[`aiModel_${providerId}`]  || '';

  if (providerId === 'openai_compat') {
    if (!baseUrl) return;
    await fetchModels(providerId, apiKey, baseUrl, savedModel, showStatusMsg);
  } else {
    if (!apiKey) return;
    await fetchModels(providerId, apiKey, '', savedModel, showStatusMsg);
  }
}

async function fetchModels(providerId, apiKey, baseUrl, savedModel = '', showStatusMsg = true) {
  const select     = document.getElementById('aiModel');
  const refreshBtn = document.getElementById('refreshModelsBtn');
  const manualInput = document.getElementById('manualModel');

  select.disabled = true;
  refreshBtn.disabled = true;
  select.innerHTML = '<option value="">⏳ Loading models...</option>';
  manualInput.style.display = 'none';

  try {
    let modelsUrl;

    if (providerId === 'gemini') {
      modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    } else if (providerId === 'openai_compat') {
      const base = baseUrl.replace(/\/+$/, '');
      modelsUrl = `${base}/v1/models`;
    } else if (providerId === 'deepseek') {
      modelsUrl = 'https://api.deepseek.com/models';
    } else if (providerId === 'openai') {
      modelsUrl = 'https://api.openai.com/v1/models';
    }

    const headers = {};
    if (providerId !== 'gemini') {
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(modelsUrl, { method: 'GET', headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Normalise response shape: Gemini uses data.models[], others use data.data[]
    const rawModels = providerId === 'gemini' ? (data.models || []) : (data.data || []);

    // Apply provider-specific filter from options.js registry
    const filtered = filterModelsForProvider(providerId, rawModels);

    if (filtered.length === 0) {
      select.innerHTML = '<option value="">⚠️ No models found</option>';
      if (showStatusMsg) showStatus('No models found for this provider / key', true);

      // For openai_compat, offer manual input as fallback
      if (providerId === 'openai_compat') showManualModelInput(savedModel);
      return;
    }

    select.innerHTML = filtered.map(m => `<option value="${m.id}">${m.id}</option>`).join('');

    // Restore previously saved model if it's still in the list
    let selected = savedModel && filtered.some(m => m.id === savedModel)
      ? savedModel
      : filtered[0].id;

    select.value = selected;
    await chrome.storage.local.set({ [`aiModel_${providerId}`]: selected });

    if (showStatusMsg) showStatus(`Loaded ${filtered.length} model(s)`, false);

  } catch (err) {
    console.error('[JATTUMNN] Fetch models error:', err);
    select.innerHTML = `<option value="">❌ Error: ${err.message}</option>`;
    if (showStatusMsg) showStatus(`Failed to load models: ${err.message}`, true);

    // For openai_compat, offer manual input as fallback even on error
    if (providerId === 'openai_compat') showManualModelInput(savedModel);
  } finally {
    select.disabled = false;
    refreshBtn.disabled = false;
  }
}

// Standalone filter logic mirroring options.js PROVIDERS
function filterModelsForProvider(providerId, models) {
  switch (providerId) {
    case 'deepseek':
      return models.filter(m => m.owned_by === 'deepseek');
    case 'openai':
      return models
        .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3'))
        .sort((a, b) => b.id.localeCompare(a.id));
    case 'gemini':
      return models
        .filter(m => m.name?.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => ({ id: m.name.replace('models/', ''), ...m }))
        .sort((a, b) => b.id.localeCompare(a.id));
    case 'openai_compat':
      return models.sort((a, b) => a.id.localeCompare(b.id));
    default:
      return models;
  }
}

function showManualModelInput(savedModel = '') {
  const manualInput = document.getElementById('manualModel');
  manualInput.style.display = '';
  if (savedModel) manualInput.value = savedModel;
  manualInput.addEventListener('change', async () => {
    const val = manualInput.value.trim();
    if (val) {
      await chrome.storage.local.set({ aiModel_openai_compat: val });
      showStatus('Manual model name saved', false);
    }
  }, { once: false });
}

// ---------------------------------------------------------------------------
// Save AI model on dropdown change
// ---------------------------------------------------------------------------
async function saveAiModel() {
  const providerId = document.getElementById('providerSelect').value;
  const select     = document.getElementById('aiModel');
  const model      = select.value;
  if (!model) return;
  await chrome.storage.local.set({ [`aiModel_${providerId}`]: model });
  showStatus('Model saved', false);
}

// ---------------------------------------------------------------------------
// Generic editable field setup
// ---------------------------------------------------------------------------
function setupField(fieldId) {
  const input = document.getElementById(fieldId);
  const btn   = document.querySelector(`.edit-btn[data-field="${fieldId}"]`);
  if (!input || !btn) return;

  btn.addEventListener('click', async () => {
    if (input.hasAttribute('readonly')) {
      input.removeAttribute('readonly');
      input.focus();
      btn.textContent = '💾 Save';
    } else {
      await saveFieldAndLock(fieldId);
    }
  });
}

async function saveFieldAndLock(fieldId) {
  const input = document.getElementById(fieldId);
  const btn   = document.querySelector(`.edit-btn[data-field="${fieldId}"]`);
  const value = input.value; // don't trim passwords / URLs

  try {
    await chrome.storage.local.set({ [fieldId]: value });
    input.setAttribute('readonly', true);
    btn.textContent = '✏️ Edit';

    const label = fieldId.startsWith('apiKey_') ? 'API Key'
      : fieldId === 'baseUrl_openai_compat' ? 'Base URL'
      : fieldId.charAt(0).toUpperCase() + fieldId.slice(1);
    showStatus(`${label} saved!`, false);

    // After saving an API key or base URL, refresh model list automatically
    const providerId = document.getElementById('providerSelect').value;
    if (fieldId === `apiKey_${providerId}` || fieldId === 'baseUrl_openai_compat') {
      updateRefreshBtnState(providerId);
      const stored = await chrome.storage.local.get(ALL_STORAGE_KEYS);
      await loadModelsForProvider(providerId, stored, true);
    }
  } catch (err) {
    console.error(`[JATTUMNN] Save error for ${fieldId}:`, err);
    showStatus(`Failed to save`, true);
  }
}

function makeFieldReadOnly(fieldId) {
  const input = document.getElementById(fieldId);
  const btn   = document.querySelector(`.edit-btn[data-field="${fieldId}"]`);
  if (input) input.setAttribute('readonly', true);
  if (btn)   btn.textContent = '✏️ Edit';
}

// ---------------------------------------------------------------------------
// Clear user data
// ---------------------------------------------------------------------------
async function clearUserData() {
  const confirmed = confirm(
    '🗑️ Clear all user data?\n\nThis will reset your username, email, all API keys, base URL, translation prompts, and modal settings.'
  );
  if (!confirmed) return;

  const resetValues = {
    username: '',
    email: '',
    customPrompt: DEFAULT_ENG_TRANSLATION_PROMPT,
    defaultTargetLanguage: DEFAULT_TARGET_LANGUAGE,
    useModalCustomPrompt: DEFAULT_USE_MODAL_CUSTOM_PROMPT,
    modalCustomPrompt: DEFAULT_MODAL_CUSTOM_PROMPT,
  };
  PROVIDER_IDS.forEach(id => {
    resetValues[`apiKey_${id}`] = '';
    resetValues[`aiModel_${id}`] = '';
  });
  resetValues['baseUrl_openai_compat'] = '';

  try {
    await chrome.storage.local.set(resetValues);

    document.getElementById('username').value = '';
    document.getElementById('email').value    = '';
    document.getElementById('customPrompt').value = DEFAULT_ENG_TRANSLATION_PROMPT;
    
    // Reset modal settings UI
    const defaultTargetLanguage = document.getElementById('defaultTargetLanguage');
    if (defaultTargetLanguage) defaultTargetLanguage.value = DEFAULT_TARGET_LANGUAGE;
    
    const useModalCustomPrompt = document.getElementById('useModalCustomPrompt');
    if (useModalCustomPrompt) useModalCustomPrompt.checked = DEFAULT_USE_MODAL_CUSTOM_PROMPT;
    
    const modalCustomPrompt = document.getElementById('modalCustomPrompt');
    if (modalCustomPrompt) modalCustomPrompt.value = DEFAULT_MODAL_CUSTOM_PROMPT;
    
    toggleModalPromptField();
    updateModalPromptPreview();

    PROVIDER_IDS.forEach(id => {
      const el = document.getElementById(`apiKey_${id}`);
      if (el) el.value = '';
    });
    const baseUrlEl = document.getElementById('baseUrl_openai_compat');
    if (baseUrlEl) baseUrlEl.value = '';

    ['username', 'email', ...PROVIDER_IDS.map(id => `apiKey_${id}`), 'baseUrl_openai_compat']
      .forEach(makeFieldReadOnly);

    const providerId = document.getElementById('providerSelect').value;
    applyProviderUI(providerId);

    showStatus('User data cleared!', false);
    showPromptStatus('Prompts reset to default', false);
  } catch (err) {
    console.error('[JATTUMNN] Clear data error:', err);
    showStatus('Failed to clear user data', true);
  }
}

// ---------------------------------------------------------------------------
// Translation cache stats
// ---------------------------------------------------------------------------
async function updateCacheStats() {
  try {
    const all      = await chrome.storage.local.get(null);
    const transKeys = Object.keys(all).filter(k => k.startsWith('trans_'));
    let totalBytes = 0;
    for (const key of transKeys) {
      const entry = all[key];
      const entryStr = typeof entry === 'string' ? entry : JSON.stringify(entry);
      totalBytes += key.length + entryStr.length;
    }
    const totalMB    = totalBytes / (1024 * 1024);
    const pctUsed    = Math.min(100, (totalBytes / (5 * 1024 * 1024)) * 100);

    document.getElementById('cacheCount').textContent       = transKeys.length;
    document.getElementById('cacheSize').textContent        = totalMB.toFixed(2);
    document.getElementById('cacheProgressFill').style.width = `${pctUsed}%`;
  } catch (err) {
    console.error('[JATTUMNN] Cache stats error:', err);
    document.getElementById('cacheCount').textContent = '?';
    document.getElementById('cacheSize').textContent  = '?';
  }
}

async function clearTranslationCache() {
  if (!confirm('🗑️ Clear all cached translations? This cannot be undone.')) return;
  try {
    const res = await chrome.runtime.sendMessage({ action: 'clearTranslationCache' });
    if (res?.success) {
      showStatus('Translation cache cleared', false);
      await updateCacheStats();
    } else {
      showStatus('Failed to clear cache', true);
    }
  } catch {
    showStatus('Error clearing cache', true);
  }
}

// ---------------------------------------------------------------------------
// Prompt tab
// ---------------------------------------------------------------------------
async function savePrompt() {
  const val = document.getElementById('customPrompt').value.trim();
  if (!val) { showPromptStatus('Prompt cannot be empty', true); return; }
  try {
    await chrome.storage.local.set({ customPrompt: val });
    showPromptStatus('Hover prompt saved!', false);
  } catch {
    showPromptStatus('Failed to save hover prompt', true);
  }
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`${tabId}-tab`).classList.add('active');
  document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
  
  // Update modal prompt preview when switching to prompt tab
  if (tabId === 'prompt') {
    updateModalPromptPreview();
  }
}

// ---------------------------------------------------------------------------
// Error logs
// ---------------------------------------------------------------------------
async function loadErrorLogs() {
  const container = document.getElementById('logContainer');
  if (!container) return;
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getErrorLog' });
    if (res?.log) {
      displayErrorLogs(res.log);
    } else {
      container.innerHTML = '<div style="color:#888;">No errors logged.</div>';
    }
  } catch {
    container.innerHTML = '<div style="color:#f87171;">Error loading logs.</div>';
  }
}

function displayErrorLogs(logs) {
  const container = document.getElementById('logContainer');
  if (!logs?.length) {
    container.innerHTML = '<div style="color:#888;">No errors logged.</div>';
    return;
  }
  container.innerHTML = logs.map(log => `
    <div style="border-bottom:1px solid #333;padding:8px 0;margin-bottom:8px;">
      <div style="color:#f87171;font-weight:bold;">${new Date(log.timestamp).toLocaleString()}</div>
      <div style="color:#ffaa66;">${escapeHtml(log.type)}: ${escapeHtml(log.message)}</div>
      <div style="color:#aaa;font-size:11px;">Context: ${escapeHtml(JSON.stringify(log.context))}</div>
      ${log.stack ? `<details><summary style="cursor:pointer;color:#888;">Stack trace</summary><pre style="background:#000;color:#fff;padding:4px;margin-top:4px;overflow-x:auto;">${escapeHtml(log.stack)}</pre></details>` : ''}
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

async function exportErrorLogs() {
  const res = await chrome.runtime.sendMessage({ action: 'getErrorLog' });
  if (!res?.log?.length) { alert('No logs to export.'); return; }
  const blob = new Blob([JSON.stringify(res.log, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `jattumnn_error_logs_${new Date().toISOString().slice(0, 19)}.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

async function clearErrorLogs() {
  if (!confirm('Clear all error logs?')) return;
  const res = await chrome.runtime.sendMessage({ action: 'clearErrorLog' });
  if (res?.success) {
    loadErrorLogs();
    showStatus('Error logs cleared.', false);
  } else {
    showStatus('Failed to clear logs.', true);
  }
}

// ---------------------------------------------------------------------------
// DOMContentLoaded — wire everything up
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await updateCacheStats();

  // --- User fields ---
  ['username', 'email'].forEach(setupField);

  // --- Per-provider API key fields ---
  PROVIDER_IDS.forEach(id => setupField(`apiKey_${id}`));

  // --- Base URL field for openai_compat ---
  setupField('baseUrl_openai_compat');

  // --- Provider selector ---
  document.getElementById('providerSelect').addEventListener('change', async (e) => {
    const providerId = e.target.value;
    await chrome.storage.local.set({ selectedProvider: providerId });
    applyProviderUI(providerId);

    // Load stored model list for the newly selected provider
    const stored = await chrome.storage.local.get(ALL_STORAGE_KEYS);
    await loadModelsForProvider(providerId, stored, false);
  });

  // --- Refresh models button ---
  document.getElementById('refreshModelsBtn').addEventListener('click', async () => {
    const providerId = document.getElementById('providerSelect').value;
    const apiKey     = document.getElementById(`apiKey_${providerId}`)?.value?.trim() || '';
    const baseUrl    = document.getElementById('baseUrl_openai_compat')?.value?.trim() || '';

    if (providerId === 'openai_compat' && !baseUrl) {
      showStatus('Enter and save the Base URL first.', true);
      return;
    }
    if (providerId !== 'openai_compat' && !apiKey) {
      showStatus('Enter and save the API key first.', true);
      return;
    }

    const stored = await chrome.storage.local.get(ALL_STORAGE_KEYS);
    await fetchModels(providerId, apiKey, baseUrl, stored[`aiModel_${providerId}`] || '', true);
  });

  // --- Model dropdown change ---
  document.getElementById('aiModel').addEventListener('change', saveAiModel);

  // --- Clear buttons ---
  document.getElementById('clearCacheBtn').addEventListener('click', clearUserData);
  document.getElementById('clearTransCacheBtn')?.addEventListener('click', clearTranslationCache);

  // --- Prompt tab ---
  document.getElementById('savePromptBtn')?.addEventListener('click', savePrompt);

  // --- Tab switching ---
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
      if (tabId === 'logs') loadErrorLogs();
    });
  });

  // --- Log buttons ---
  document.getElementById('exportLogsBtn')?.addEventListener('click', exportErrorLogs);
  document.getElementById('clearLogsBtn')?.addEventListener('click', clearErrorLogs);
});