// modules/modal.js - Updated to use saved modal settings

let modalOverlay = null;

// Load modal CSS dynamically
async function loadModalCSS() {
    if (!document.querySelector('#jattumnn-modal-style')) {
        const style = document.createElement('link');
        style.id = 'jattumnn-modal-style';
        style.rel = 'stylesheet';
        style.href = chrome.runtime.getURL('ui/modal.css');
        document.head.appendChild(style);

        // Wait for CSS to load
        return new Promise((resolve) => {
            style.onload = resolve;
            style.onerror = resolve;
        });
    }
    return Promise.resolve();
}

// Get modal translation prompt based on settings
async function getModalPrompt(targetLanguage, settings) {
  const useCustomPrompt = settings.useModalCustomPrompt || false;
  const customPrompt = settings.modalCustomPrompt || '';
  
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
  
  if (useCustomPrompt && customPrompt) {
    // Replace {targetLanguage} placeholder with actual language name
    const targetLangName = languageNames[targetLanguage] || targetLanguage;
    return customPrompt.replace(/{targetLanguage}/g, targetLangName);
  }
  
  // Default prompt
  const targetLangName = languageNames[targetLanguage] || targetLanguage;
  return `Translate the following text to ${targetLangName}. 
For proper nouns (names of people, places, brands), keep them in their original spelling.
Maintain formatting and spacing. Output only the translation, no explanations.`;
}

// Show the translation modal
export async function showTranslationModal() {
  // Don't create duplicate modals
  if (modalOverlay) return;
  
  try {
    await loadModalCSS();
    
    // Load settings from storage
    const settings = await chrome.storage.local.get([
      "selectedProvider",
      "defaultTargetLanguage",
      "useModalCustomPrompt",
      "modalCustomPrompt",
      "apiKey_deepseek",
      "apiKey_openai", 
      "apiKey_gemini",
      "apiKey_openai_compat",
      "baseUrl_openai_compat",
      "aiModel_deepseek",
      "aiModel_openai",
      "aiModel_gemini",
      "aiModel_openai_compat",
      "customPrompt"
    ]);
    
    const defaultLanguage = settings.defaultTargetLanguage || 'th'; // Default to Thai
    
    // Create modal elements with Thai option preselected
    modalOverlay = document.createElement('div');
    modalOverlay.className = 'jattumnn-modal-overlay';
    modalOverlay.innerHTML = `
      <div class="jattumnn-modal">
        <div class="jattumnn-modal-header">
          <h2>📝 JATTUMNN Translator</h2>
          <button class="jattumnn-close-btn" id="jattumnnCloseModal">✕</button>
        </div>
        <div class="jattumnn-modal-body">
          <div class="jattumnn-input-group">
            <label>📄 Text to Translate</label>
            <textarea 
              id="jattumnnInputText" 
              class="jattumnn-text-input" 
              rows="4" 
              placeholder="Enter text to translate here... (Ctrl+Enter to translate)"
            ></textarea>
          </div>
          
          <div class="jattumnn-input-group">
            <label>🌐 Target Language</label>
            <select id="jattumnnTargetLanguage" class="jattumnn-language-select">
              <option value="th" ${defaultLanguage === 'th' ? 'selected' : ''}>Thai</option>
              <option value="en" ${defaultLanguage === 'en' ? 'selected' : ''}>English</option>
              <option value="es" ${defaultLanguage === 'es' ? 'selected' : ''}>Spanish</option>
              <option value="fr" ${defaultLanguage === 'fr' ? 'selected' : ''}>French</option>
              <option value="de" ${defaultLanguage === 'de' ? 'selected' : ''}>German</option>
              <option value="it" ${defaultLanguage === 'it' ? 'selected' : ''}>Italian</option>
              <option value="pt" ${defaultLanguage === 'pt' ? 'selected' : ''}>Portuguese</option>
              <option value="ru" ${defaultLanguage === 'ru' ? 'selected' : ''}>Russian</option>
              <option value="zh" ${defaultLanguage === 'zh' ? 'selected' : ''}>Chinese (Simplified)</option>
              <option value="ja" ${defaultLanguage === 'ja' ? 'selected' : ''}>Japanese</option>
              <option value="ko" ${defaultLanguage === 'ko' ? 'selected' : ''}>Korean</option>
              <option value="ar" ${defaultLanguage === 'ar' ? 'selected' : ''}>Arabic</option>
              <option value="hi" ${defaultLanguage === 'hi' ? 'selected' : ''}>Hindi</option>
            </select>
          </div>
          
          <button id="jattumnnTranslateBtn" class="jattumnn-translate-btn">
            🔄 Translate
          </button>
          
          <div id="jattumnnResultArea" class="jattumnn-result-area" style="display: none;">
            <div class="jattumnn-result-label">✨ Translation Result</div>
            <div id="jattumnnResultText" class="jattumnn-result-text"></div>
          </div>
        </div>
        <div class="jattumnn-modal-footer">
          💡 Powered by ${settings.selectedProvider || 'DeepSeek'} • Press ESC to close
        </div>
      </div>
    `;
    
    document.body.appendChild(modalOverlay);
    
    // Focus on textarea
    const textarea = modalOverlay.querySelector('#jattumnnInputText');
    setTimeout(() => textarea.focus(), 100);
    
    // Set up event listeners
    setupModalEventListeners(settings);
    
  } catch (error) {
    console.error('[JATTUMNN] Error creating modal:', error);
    showModalError('Failed to create modal. Please try again.');
  }
}

// Set up all modal event listeners
function setupModalEventListeners(settings) {
    if (!modalOverlay) return;

    const closeBtn = modalOverlay.querySelector('#jattumnnCloseModal');
    const translateBtn = modalOverlay.querySelector('#jattumnnTranslateBtn');
    const textarea = modalOverlay.querySelector('#jattumnnInputText');
    const targetLangSelect = modalOverlay.querySelector('#jattumnnTargetLanguage');

    // Close button
    closeBtn.addEventListener('click', closeModal);

    // Translate button
    translateBtn.addEventListener('click', async () => {
        const inputText = textarea.value.trim();
        if (!inputText) {
            showModalError('Please enter text to translate');
            return;
        }

        const targetLanguage = targetLangSelect.value;
        await handleModalTranslation(inputText, targetLanguage, settings);
    });

    // Allow Enter to trigger translation (Ctrl+Enter or Cmd+Enter)
    textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            translateBtn.click();
        }
    });
}

// Handle the actual translation from modal
async function handleModalTranslation(inputText, targetLanguage, settings) {
    const translateBtn = modalOverlay?.querySelector('#jattumnnTranslateBtn');
    const resultArea = modalOverlay?.querySelector('#jattumnnResultArea');
    const resultText = modalOverlay?.querySelector('#jattumnnResultText');

    if (!translateBtn || !resultArea || !resultText) return;

    // Show loading state
    const originalBtnText = translateBtn.innerHTML;
    translateBtn.innerHTML = '<span class="jattumnn-loading"></span> Translating...';
    translateBtn.disabled = true;

    // Hide any existing error/result
    resultArea.style.display = 'none';

    try {
        // Get the appropriate prompt based on settings
        const customPrompt = await getModalPrompt(targetLanguage, settings);

        // Send translation request to background script
        const response = await chrome.runtime.sendMessage({
            action: 'translateInputText',
            text: inputText,
            targetLanguage: targetLanguage,
            customPrompt: customPrompt,
            selectedProvider: settings.selectedProvider,
            apiKey_deepseek: settings.apiKey_deepseek,
            apiKey_openai: settings.apiKey_openai,
            apiKey_gemini: settings.apiKey_gemini,
            apiKey_openai_compat: settings.apiKey_openai_compat,
            baseUrl_openai_compat: settings.baseUrl_openai_compat,
            aiModel_deepseek: settings.aiModel_deepseek,
            aiModel_openai: settings.aiModel_openai,
            aiModel_gemini: settings.aiModel_gemini,
            aiModel_openai_compat: settings.aiModel_openai_compat,
        });

        if (response.error) {
            throw new Error(response.error);
        }

        // Display result
        resultText.textContent = response.translatedText;
        resultArea.style.display = 'block';

        // Smooth scroll to result
        resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {
        console.error('[JATTUMNN] Translation error:', error);
        showModalError(error.message || 'Translation failed. Please check your settings.');
    } finally {
        // Restore button
        translateBtn.innerHTML = originalBtnText;
        translateBtn.disabled = false;
    }
}

// Show error in modal
function showModalError(errorMessage) {
    if (!modalOverlay) return;

    const resultArea = modalOverlay.querySelector('#jattumnnResultArea');
    const resultText = modalOverlay.querySelector('#jattumnnResultText');

    if (resultArea && resultText) {
        resultText.innerHTML = `<div class="jattumnn-error">⚠️ ${errorMessage}</div>`;
        resultArea.style.display = 'block';

        // Auto-hide error after 5 seconds
        setTimeout(() => {
            if (resultArea && modalOverlay) {
                const errorDiv = resultText.querySelector('.jattumnn-error');
                if (errorDiv && !resultText.textContent.includes('Translation result')) {
                    resultArea.style.display = 'none';
                }
            }
        }, 5000);
    }
}

// Close modal
export function closeModal() {
    if (modalOverlay) {
        modalOverlay.remove();
        modalOverlay = null;
    }
}

// Check if modal is open
export function isModalOpen() {
    return modalOverlay !== null;
}