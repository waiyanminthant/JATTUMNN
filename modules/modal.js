// modules/modal.js - JATTUMNN Translation Modal Handler

let modalOverlay = null;

// Load modal CSS dynamically with better error handling
async function loadModalCSS() {
  if (!document.querySelector("#jattumnn-modal-style")) {
    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.id = "jattumnn-modal-style";
      link.rel = "stylesheet";
      link.type = "text/css";
      link.href = chrome.runtime.getURL("ui/modal.css");

      link.onload = () => {
        console.log("[JATTUMNN] Modal CSS loaded successfully");
        resolve();
      };

      link.onerror = (error) => {
        console.error("[JATTUMNN] Failed to load modal CSS:", error);
        reject(error);
      };

      document.head.appendChild(link);
    });
  }
  return Promise.resolve();
}

// Show the translation modal
export async function showTranslationModal() {
  // Don't create duplicate modals
  if (modalOverlay) return;

  try {
    // Wait for CSS to load
    await loadModalCSS();

    // Load settings from storage
    const settings = await chrome.storage.local.get([
      "selectedProvider",
      "defaultTargetLanguage",
      "useModalCustomPrompt",
      "modalCustomPrompt",
      "languagePrompts",
      "apiKey_deepseek",
      "apiKey_openai",
      "apiKey_gemini",
      "apiKey_openai_compat",
      "baseUrl_openai_compat",
      "aiModel_deepseek",
      "aiModel_openai",
      "aiModel_gemini",
      "aiModel_openai_compat",
      "customPrompt",
    ]);

    const defaultLanguage = settings.defaultTargetLanguage || "th";

    // Create modal elements
    modalOverlay = document.createElement("div");
    modalOverlay.className = "jattumnn-modal-overlay";
    modalOverlay.setAttribute("id", "jattumnn-modal-overlay");

    // Create modal container
    const modal = document.createElement("div");
    modal.className = "jattumnn-modal";

    // Header
    const header = document.createElement("div");
    header.className = "jattumnn-modal-header";
    header.innerHTML = `
      <h2>📝 JATTUMNN Translator</h2>
      <button class="jattumnn-close-btn" id="jattumnnCloseModal">✕</button>
    `;

    // Body
    const body = document.createElement("div");
    body.className = "jattumnn-modal-body";
    body.innerHTML = `
      <div class="jattumnn-input-group">
        <label>📄 Text to Translate</label>
        <textarea 
          id="jattumnnInputText" 
          class="jattumnn-text-input" 
          rows="4" 
          placeholder="Enter text to translate here... (Enter to translate | Shift+Enter for new line)"
        ></textarea>
      </div>
      
      <div class="jattumnn-input-group">
        <label>🌐 Target Language</label>
        <select id="jattumnnTargetLanguage" class="jattumnn-language-select">
          <option value="th">Thai</option>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="it">Italian</option>
          <option value="pt">Portuguese</option>
          <option value="ru">Russian</option>
          <option value="zh">Chinese (Simplified)</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="ar">Arabic</option>
          <option value="hi">Hindi</option>
        </select>
      </div>
      
      <button id="jattumnnTranslateBtn" class="jattumnn-translate-btn">
        🔄 Translate
      </button>
      
      <div id="jattumnnResultArea" class="jattumnn-result-area" style="display: none;">
        <div class="jattumnn-result-label">✨ Translation Result</div>
        <div id="jattumnnResultText" class="jattumnn-result-text"></div>
      </div>
    `;

    // Footer
    const footer = document.createElement("div");
    footer.className = "jattumnn-modal-footer";
    footer.textContent = `💡 Powered by ${settings.selectedProvider || "DeepSeek"} • Press ESC to close`;

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    modalOverlay.appendChild(modal);

    // Set default language
    const languageSelect = body.querySelector("#jattumnnTargetLanguage");
    if (languageSelect && defaultLanguage) {
      languageSelect.value = defaultLanguage;
    }

    document.body.appendChild(modalOverlay);

    // Focus on textarea
    const textarea = body.querySelector("#jattumnnInputText");
    setTimeout(() => textarea.focus(), 100);

    // Set up event listeners
    setupModalEventListeners(settings);
  } catch (error) {
    console.error("[JATTUMNN] Error creating modal:", error);
    showModalError("Failed to create modal. Please try again.");
  }
}

// Set up all modal event listeners
function setupModalEventListeners(settings) {
  if (!modalOverlay) return;

  const closeBtn = modalOverlay.querySelector("#jattumnnCloseModal");
  const translateBtn = modalOverlay.querySelector("#jattumnnTranslateBtn");
  const textarea = modalOverlay.querySelector("#jattumnnInputText");
  const targetLangSelect = modalOverlay.querySelector(
    "#jattumnnTargetLanguage",
  );

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  // Translate button
  if (translateBtn) {
    translateBtn.addEventListener("click", async () => {
      const inputText = textarea ? textarea.value.trim() : "";
      if (!inputText) {
        showModalError("Please enter text to translate");
        return;
      }

      const targetLanguage = targetLangSelect ? targetLangSelect.value : "en";
      await handleModalTranslation(inputText, targetLanguage, settings);
    });
  }

  // Allow Enter to trigger translation (Enter key), Shift+Enter for new line
  if (textarea) {
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (e.shiftKey) {
          // Shift+Enter: Allow default behavior (new line)
          // Do nothing, let the browser handle it
          return;
        } else {
          // Enter without Shift: Trigger translation
          e.preventDefault();
          if (translateBtn) translateBtn.click();
        }
      }
    });
  }
}

// Handle the actual translation from modal
async function handleModalTranslation(inputText, targetLanguage, settings) {
  const translateBtn = modalOverlay?.querySelector("#jattumnnTranslateBtn");
  const resultArea = modalOverlay?.querySelector("#jattumnnResultArea");
  const resultText = modalOverlay?.querySelector("#jattumnnResultText");

  if (!translateBtn || !resultArea || !resultText) return;

  // Show loading state
  const originalBtnText = translateBtn.innerHTML;
  translateBtn.innerHTML =
    '<span class="jattumnn-loading"></span> Translating...';
  translateBtn.disabled = true;

  // Hide any existing error/result
  resultArea.style.display = "none";

  try {
    // Get the appropriate prompt based on settings
    const customPrompt = await getModalPrompt(targetLanguage, settings);

    // Send translation request to background script
    const response = await chrome.runtime.sendMessage({
      action: "translateInputText",
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
    resultArea.style.display = "block";

    // Smooth scroll to result
    resultArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    console.error("[JATTUMNN] Translation error:", error);
    showModalError(
      error.message || "Translation failed. Please check your settings.",
    );
  } finally {
    // Restore button
    translateBtn.innerHTML = originalBtnText;
    translateBtn.disabled = false;
  }
}

// Get modal translation prompt based on settings
// async function getModalPrompt(targetLanguage, settings) {
//   const useCustomPrompt = settings.useModalCustomPrompt || false;
//   const customPrompt = settings.modalCustomPrompt || "";

//   const languageNames = {
//     th: "Thai",
//     en: "English",
//     es: "Spanish",
//     fr: "French",
//     de: "German",
//     it: "Italian",
//     pt: "Portuguese",
//     ru: "Russian",
//     zh: "Chinese (Simplified)",
//     ja: "Japanese",
//     ko: "Korean",
//     ar: "Arabic",
//     hi: "Hindi",
//   };

//   if (useCustomPrompt && customPrompt) {
//     const targetLangName = languageNames[targetLanguage] || targetLanguage;
//     return customPrompt.replace(/{targetLanguage}/g, targetLangName);
//   }

//   const targetLangName = languageNames[targetLanguage] || targetLanguage;
//   return `Translate the following text to ${targetLangName}. 
// For proper nouns (names of people, places, brands), keep them in their original spelling.
// Maintain formatting and spacing. Output only the translation, no explanations.`;
// }

// Show error in modal
function showModalError(errorMessage) {
  if (!modalOverlay) return;

  const resultArea = modalOverlay.querySelector("#jattumnnResultArea");
  const resultText = modalOverlay.querySelector("#jattumnnResultText");

  if (resultArea && resultText) {
    resultText.innerHTML = `<div class="jattumnn-error">⚠️ ${errorMessage}</div>`;
    resultArea.style.display = "block";

    // Auto-hide error after 5 seconds
    setTimeout(() => {
      if (resultArea && modalOverlay) {
        const errorDiv = resultText.querySelector(".jattumnn-error");
        if (
          errorDiv &&
          !resultText.textContent.includes("Translation result")
        ) {
          resultArea.style.display = "none";
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

// Get modal translation prompt based on settings and language
async function getModalPrompt(targetLanguage, settings) {
  const useGlobalPrompt = settings.useModalCustomPrompt || false;
  const globalCustomPrompt = settings.modalCustomPrompt || "";
  const languagePrompts = settings.languagePrompts || {};

  const languageNames = {
    th: "Thai",
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    zh: "Chinese (Simplified)",
    ja: "Japanese",
    ko: "Korean",
    ar: "Arabic",
    hi: "Hindi",
  };

  const targetLangName = languageNames[targetLanguage] || targetLanguage;

  // Priority 1: Global custom prompt (if enabled)
  if (useGlobalPrompt && globalCustomPrompt) {
    return globalCustomPrompt.replace(/{targetLanguage}/g, targetLangName);
  }

  // Priority 2: Language-specific custom prompt
  if (languagePrompts && languagePrompts[targetLanguage]) {
    return languagePrompts[targetLanguage].replace(
      /{targetLanguage}/g,
      targetLangName,
    );
  }

  // Priority 3: Default prompt for this language
  const defaultPrompts = {
    th: `Translate to Thai using natural and polite language. Use appropriate Thai particles (ครับ/ค่ะ) where suitable. Keep the translation natural and conversational.`,
    ja: `Translate to Japanese using polite keigo (丁寧語) where appropriate. Keep the translation natural.`,
    ko: `Translate to Korean using natural, polite language with appropriate honorifics.`,
    // Add other languages as needed
  };

  if (defaultPrompts[targetLanguage]) {
    return defaultPrompts[targetLanguage];
  }

  // Priority 4: Generic fallback
  return `Translate the following text to ${targetLangName}. 
For proper nouns (names of people, places, brands), keep them in their original spelling.
Maintain formatting and spacing. Output only the translation, no explanations.`;
}
