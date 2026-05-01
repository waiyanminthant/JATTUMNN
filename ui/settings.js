// settings.js – JATTUMNN
// Updated with English Translation Prompt

function showStatus(message, isError = false) {
  const statusDiv = document.getElementById('statusMsg');
  statusDiv.textContent = message;
  statusDiv.style.color = isError ? '#f87171' : '#3b82f6';
  setTimeout(() => { statusDiv.textContent = ''; }, 3000);
}

function generateUUID() {
  return crypto.randomUUID();
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(['username', 'userId', 'email', 'apiKey', 'aiModel', 'customPrompt']);
  
  if (!result.userId) {
    const newId = generateUUID();
    await chrome.storage.sync.set({ userId: newId });
    result.userId = newId;
  }
  
  document.getElementById('username').value = result.username || '';
  document.getElementById('userId').value = result.userId;
  document.getElementById('email').value = result.email || '';
  document.getElementById('apiKey').value = result.apiKey || '';
  
  const aiModelSelect = document.getElementById('aiModel');
  if (result.aiModel) {
    aiModelSelect.value = result.aiModel;
  }
  
  // Load custom prompt (with condensed default if not set)
  const promptTextarea = document.getElementById('customPrompt');
  if (result.customPrompt) {
    promptTextarea.value = result.customPrompt;
  } else {
    // Set condensed default prompt
    promptTextarea.value = "Translate to English. Keep formatting, spacing, and the separator '__SEP__' unchanged. Output only the translation, no explanations.";
  }
  
  // If API key exists, enable refresh button and try to load models automatically
  if (result.apiKey && result.apiKey.trim() !== '') {
    document.getElementById('refreshModelsBtn').disabled = false;
    fetchModels(result.apiKey, false);
  } else {
    document.getElementById('refreshModelsBtn').disabled = true;
  }
}

async function saveFieldAndLock(fieldId) {
  const input = document.getElementById(fieldId);
  const value = fieldId === 'apiKey' ? input.value : input.value.trim();
  const btn = document.querySelector(`.edit-btn[data-field="${fieldId}"]`);
  
  try {
    await chrome.storage.sync.set({ [fieldId]: value });
    input.setAttribute('readonly', true);
    btn.textContent = '✏️ Edit';
    showStatus(`${fieldId === 'apiKey' ? 'API Key' : fieldId.charAt(0).toUpperCase() + fieldId.slice(1)} saved!`, false);
    
    if (fieldId === 'apiKey' && value && value.trim() !== '') {
      document.getElementById('refreshModelsBtn').disabled = false;
      fetchModels(value, true);
    } else if (fieldId === 'apiKey' && (!value || value.trim() === '')) {
      document.getElementById('refreshModelsBtn').disabled = true;
      document.getElementById('aiModel').disabled = true;
      document.getElementById('aiModel').innerHTML = '<option value="">-- Enter API key --</option>';
    }
  } catch (error) {
    console.error(`Save error for ${fieldId}:`, error);
    showStatus(`Failed to save ${fieldId}`, true);
  }
}

function setupField(fieldId) {
  const input = document.getElementById(fieldId);
  const btn = document.querySelector(`.edit-btn[data-field="${fieldId}"]`);
  if (!btn) return;
  
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

async function fetchModels(apiKey, showStatusMsg = true) {
  const select = document.getElementById('aiModel');
  const refreshBtn = document.getElementById('refreshModelsBtn');
  
  if (!apiKey || apiKey.trim() === '') {
    if (showStatusMsg) showStatus('❌ API key is missing. Please enter and save your DeepSeek API key first.', true);
    return;
  }
  
  select.disabled = true;
  refreshBtn.disabled = true;
  select.innerHTML = '<option value="">⏳ Loading models...</option>';
  
  try {
    const response = await fetch('https://api.deepseek.com/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      if (response.status === 401) errorMsg = 'Invalid API key (401)';
      else if (response.status === 403) errorMsg = 'Forbidden – check your API key permissions';
      else if (response.status === 429) errorMsg = 'Rate limited – wait a moment';
      else if (response.status === 500) errorMsg = 'DeepSeek server error';
      throw new Error(errorMsg);
    }
    
    const data = await response.json();
    const models = data.data.filter(m => m.object === 'model' && m.owned_by === 'deepseek');
    
    if (models.length === 0) {
      select.innerHTML = '<option value="">⚠️ No models found for this API key</option>';
      if (showStatusMsg) showStatus('No DeepSeek models returned – your API key may have limited access', true);
    } else {
      select.innerHTML = models.map(m => `<option value="${m.id}">${m.id}</option>`).join('');
      
      const stored = await chrome.storage.sync.get('aiModel');
      let selectedModel = stored.aiModel;
      
      if (!selectedModel || !models.some(m => m.id === selectedModel)) {
        selectedModel = models[0].id;
        await chrome.storage.sync.set({ aiModel: selectedModel });
        if (showStatusMsg) showStatus(`Default model "${selectedModel}" selected and saved`, false);
      } else {
        if (showStatusMsg) showStatus(`Loaded ${models.length} model(s)`, false);
      }
      
      select.value = selectedModel;
    }
  } catch (error) {
    console.error('Fetch models error:', error);
    select.innerHTML = `<option value="">❌ Error: ${error.message}</option>`;
    if (showStatusMsg) showStatus(`Failed to load models: ${error.message}`, true);
  } finally {
    select.disabled = false;
    refreshBtn.disabled = false;
  }
}

async function saveAiModel() {
  const select = document.getElementById('aiModel');
  const selectedModel = select.value;
  if (!selectedModel) return;
  try {
    await chrome.storage.sync.set({ aiModel: selectedModel });
    showStatus('AI model saved!', false);
  } catch (error) {
    console.error('Save AI model error:', error);
    showStatus('Failed to save AI model', true);
  }
}

async function clearCache() {
  const confirmed = confirm('🗑️ Are you sure you want to clear all user data?\nThis will reset your username, email, API key, and English translation prompt.');
  if (!confirmed) return;
  
  try {
    await chrome.storage.sync.set({ 
      username: '', 
      email: '', 
      apiKey: '',
      customPrompt: 'Translate to English. Keep formatting, spacing, and the separator \'__SEP__\' unchanged. Output only the translation, no explanations.'
    });
    
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const apiKeyInput = document.getElementById('apiKey');
    const promptTextarea = document.getElementById('customPrompt');
    if (usernameInput) usernameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (apiKeyInput) apiKeyInput.value = '';
    if (promptTextarea) promptTextarea.value = 'Translate to English. Keep formatting, spacing, and the separator \'__SEP__\' unchanged. Output only the translation, no explanations.';
    
    makeFieldReadOnly('username');
    makeFieldReadOnly('email');
    makeFieldReadOnly('apiKey');
    
    const refreshBtn = document.getElementById('refreshModelsBtn');
    if (refreshBtn) refreshBtn.disabled = true;
    const modelSelect = document.getElementById('aiModel');
    if (modelSelect) {
      modelSelect.innerHTML = '<option value="">-- Enter API key --</option>';
      modelSelect.disabled = true;
    }
    
    showStatus('User data cleared!', false);
    showPromptStatus('English translation prompt reset to default', false);
    
  } catch (error) {
    console.error('Clear cache error:', error);
    showStatus('Failed to clear user data', true);
  }
}

function makeFieldReadOnly(fieldId) {
  const input = document.getElementById(fieldId);
  const btn = document.querySelector(`.edit-btn[data-field="${fieldId}"]`);
  if (input) {
    input.setAttribute('readonly', true);
    if (btn) btn.textContent = '✏️ Edit';
  }
}

async function updateCacheStats() {
  try {
    const all = await chrome.storage.local.get(null);
    const transKeys = Object.keys(all).filter(k => k.startsWith('trans_'));
    const entryCount = transKeys.length;

    let totalBytes = 0;
    for (const key of transKeys) {
      totalBytes += (key.length + (all[key]?.length || 0));
    }

    const totalMB = totalBytes / (1024 * 1024);
    const percentUsed = Math.min(100, (totalBytes / (5 * 1024 * 1024)) * 100);

    document.getElementById('cacheCount').textContent = entryCount;
    document.getElementById('cacheSize').textContent = totalMB.toFixed(2);
    document.getElementById('cacheProgressFill').style.width = `${percentUsed}%`;
  } catch (err) {
    console.error('Failed to get cache stats', err);
    document.getElementById('cacheCount').textContent = '?';
    document.getElementById('cacheSize').textContent = '?';
  }
}

async function clearTranslationCache() {
  const confirmed = confirm('🗑️ Clear all cached translations? This cannot be undone.');
  if (!confirmed) return;

  try {
    const response = await chrome.runtime.sendMessage({ action: 'clearTranslationCache' });
    if (response?.success) {
      showStatus('Translation cache cleared', false);
      await updateCacheStats();
    } else {
      showStatus('Failed to clear cache', true);
    }
  } catch (err) {
    showStatus('Error clearing cache', true);
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`${tabId}-tab`).classList.add('active');
  document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
}

async function loadPrompt() {
  const { customPrompt } = await chrome.storage.sync.get('customPrompt');
  const textarea = document.getElementById('customPrompt');
  if (textarea) {
    if (customPrompt) {
      textarea.value = customPrompt;
    } else {
      // Set condensed default
      textarea.value = "Translate to English. Keep formatting, spacing, and the separator '__SEP__' unchanged. Output only the translation, no explanations.";
    }
  }
}

async function savePrompt() {
  const textarea = document.getElementById('customPrompt');
  const customPrompt = textarea.value.trim();
  if (!customPrompt) {
    showPromptStatus('Prompt cannot be empty', true);
    return;
  }
  try {
    await chrome.storage.sync.set({ customPrompt });
    showPromptStatus('English translation prompt saved!', false);
  } catch (error) {
    showPromptStatus('Failed to save prompt', true);
  }
}

function showPromptStatus(message, isError) {
  const statusDiv = document.getElementById('promptStatus');
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? '#f87171' : '#3b82f6';
    setTimeout(() => { statusDiv.textContent = ''; }, 2000);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await updateCacheStats();
  await loadPrompt();
  
  document.getElementById('clearCacheBtn').addEventListener('click', clearCache);
  document.getElementById('clearTransCacheBtn')?.addEventListener('click', clearTranslationCache);
  document.getElementById('refreshCacheStatsBtn')?.addEventListener('click', updateCacheStats);
  document.getElementById('savePromptBtn')?.addEventListener('click', savePrompt);
  
  setupField('username');
  setupField('email');
  setupField('apiKey');
  
  const refreshBtn = document.getElementById('refreshModelsBtn');
  refreshBtn.addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value;
    if (!apiKey || apiKey.trim() === '') {
      showStatus('API key is empty. Please enter and save your DeepSeek API key first.', true);
      return;
    }
    await fetchModels(apiKey, true);
  });
  
  const aiModelSelect = document.getElementById('aiModel');
  aiModelSelect.addEventListener('change', saveAiModel);
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
});