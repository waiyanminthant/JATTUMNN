function showStatus(message, isError = false) {
  const statusDiv = document.getElementById('statusMsg');
  statusDiv.textContent = message;
  statusDiv.style.color = isError ? '#f87171' : '#3b82f6';
  setTimeout(() => { statusDiv.textContent = ''; }, 2000);
}

function generateUUID() {
  return crypto.randomUUID();
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(['username', 'userId', 'email']);
  
  if (!result.userId) {
    const newId = generateUUID();
    await chrome.storage.sync.set({ userId: newId });
    result.userId = newId;
  }
  
  document.getElementById('username').value = result.username || '';
  document.getElementById('userId').value = result.userId;
  document.getElementById('email').value = result.email || '';
}

// Save a specific field to storage and lock it
async function saveFieldAndLock(fieldId) {
  const input = document.getElementById(fieldId);
  const value = input.value.trim();
  const btn = document.querySelector(`.edit-btn[data-field="${fieldId}"]`);
  
  try {
    // Save only this field
    await chrome.storage.sync.set({ [fieldId]: value });
    // Lock the field
    input.setAttribute('readonly', true);
    btn.textContent = 'Edit';
    showStatus(`${fieldId.charAt(0).toUpperCase() + fieldId.slice(1)} saved!`, false);
  } catch (error) {
    console.error(`Save error for ${fieldId}:`, error);
    showStatus(`Failed to save ${fieldId}`, true);
  }
}

// Setup edit/save toggle for a field
function setupField(fieldId) {
  const input = document.getElementById(fieldId);
  const btn = document.querySelector(`.edit-btn[data-field="${fieldId}"]`);
  if (!btn) return;
  
  btn.addEventListener('click', async () => {
    if (input.hasAttribute('readonly')) {
      // Currently read-only → switch to edit mode
      input.removeAttribute('readonly');
      input.focus();
      btn.textContent = 'Save';
    } else {
      // Currently editing → save and lock
      await saveFieldAndLock(fieldId);
    }
  });
}

async function clearCache() {
  const confirmed = confirm('Are you sure you want to clear all cached data?\nThis will reset your username and email.');
  if (!confirmed) return;
  
  try {
    await chrome.storage.sync.set({ username: '', email: '' });
    // Reset input fields
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    usernameInput.value = '';
    emailInput.value = '';
    // Lock them and reset buttons
    usernameInput.setAttribute('readonly', true);
    emailInput.setAttribute('readonly', true);
    const usernameBtn = document.querySelector('.edit-btn[data-field="username"]');
    const emailBtn = document.querySelector('.edit-btn[data-field="email"]');
    if (usernameBtn) usernameBtn.textContent = 'Edit';
    if (emailBtn) emailBtn.textContent = 'Edit';
    showStatus('Cache cleared!', false);
  } catch (error) {
    console.error('Clear cache error:', error);
    showStatus('Failed to clear cache', true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  document.getElementById('clearCacheBtn').addEventListener('click', clearCache);
  setupField('username');
  setupField('email');
});