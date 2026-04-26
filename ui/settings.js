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
  const result = await chrome.storage.sync.get(['username', 'userId', 'email', 'apiKey', 'aiModel']);
  
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
  
  // If API key exists, enable refresh button and try to load models automatically
  if (result.apiKey && result.apiKey.trim() !== '') {
    document.getElementById('refreshModelsBtn').disabled = false;
    // Optionally auto-fetch models on load (silent)
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
    
    // If API key was saved, enable refresh button and optionally fetch models
    if (fieldId === 'apiKey' && value && value.trim() !== '') {
      document.getElementById('refreshModelsBtn').disabled = false;
      // Fetch models automatically after saving a valid-looking key (optional)
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

// Fetch models from DeepSeek API
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
      // Populate dropdown
      select.innerHTML = models.map(m => `<option value="${m.id}">${m.id}</option>`).join('');
      
      // Get currently saved model (if any)
      const stored = await chrome.storage.sync.get('aiModel');
      let selectedModel = stored.aiModel;
      
      // If saved model is not in the new list, default to first model
      if (!selectedModel || !models.some(m => m.id === selectedModel)) {
        selectedModel = models[0].id;
        await chrome.storage.sync.set({ aiModel: selectedModel });
        if (showStatusMsg) showStatus(`Default model "${selectedModel}" selected and saved`, false);
      } else {
        // Saved model exists and is valid
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

// Save AI model when dropdown changes
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
  const confirmed = confirm('🗑️ Are you sure you want to clear all cached data?\nThis will reset your username, email, and API key. AI model will not be cleared.');
  if (!confirmed) return;
  
  try {
    await chrome.storage.sync.set({ username: '', email: '', apiKey: '' });
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const apiKeyInput = document.getElementById('apiKey');
    usernameInput.value = '';
    emailInput.value = '';
    apiKeyInput.value = '';
    usernameInput.setAttribute('readonly', true);
    emailInput.setAttribute('readonly', true);
    apiKeyInput.setAttribute('readonly', true);
    
    const usernameBtn = document.querySelector('.edit-btn[data-field="username"]');
    const emailBtn = document.querySelector('.edit-btn[data-field="email"]');
    const apiKeyBtn = document.querySelector('.edit-btn[data-field="apiKey"]');
    if (usernameBtn) usernameBtn.textContent = '✏️ Edit';
    if (emailBtn) emailBtn.textContent = '✏️ Edit';
    if (apiKeyBtn) apiKeyBtn.textContent = '✏️ Edit';
    
    // Disable model refresh and clear dropdown
    document.getElementById('refreshModelsBtn').disabled = true;
    const modelSelect = document.getElementById('aiModel');
    modelSelect.innerHTML = '<option value="">-- Enter API key --</option>';
    modelSelect.disabled = true;
    
    showStatus('Cache cleared!', false);
  } catch (error) {
    console.error('Clear cache error:', error);
    showStatus('Failed to clear cache', true);
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  document.getElementById('clearCacheBtn').addEventListener('click', clearCache);
  setupField('username');
  setupField('email');
  setupField('apiKey');
  updateCacheStats();
  
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
});

document.getElementById('clearTransCacheBtn')?.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ action: "clearTranslationCache" });
  if (response.success) showStatus("Translation cache cleared", false);
  else showStatus("Failed to clear cache", true);
});

// ---- Translation Cache Statistics ----
async function updateCacheStats() {
  try {
    // Get all keys that start with 'trans_'
    const all = await chrome.storage.local.get(null);
    const transKeys = Object.keys(all).filter(k => k.startsWith('trans_'));
    const entryCount = transKeys.length;

    // Calculate total approximate size (in bytes)
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
    // Send message to background to clear the cache
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

// Event listeners for cache panel
document.getElementById('clearTransCacheBtn')?.addEventListener('click', clearTranslationCache);
document.getElementById('refreshCacheStatsBtn')?.addEventListener('click', updateCacheStats);