import { LANGUAGE_NAMES, PROVIDER_STORAGE_KEYS } from "./options.js";

const FOCUS_DELAY = 100;
const ERROR_AUTO_HIDE = 5000;

let modalOverlay = null;

const MODAL_STORAGE_KEYS = [
  ...PROVIDER_STORAGE_KEYS,
  "defaultTargetLanguage",
  "useModalCustomPrompt",
  "modalCustomPrompt",
  "languagePrompts",
  "autoCopyResult",
];

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

export async function showTranslationModal() {
  if (modalOverlay) return;

  try {
    modalOverlay = document.createElement("div");
    modalOverlay.className = "jattumnn-modal-overlay";
    modalOverlay.setAttribute("id", "jattumnn-modal-overlay");

    await loadModalCSS();

    const settings = await chrome.storage.local.get(MODAL_STORAGE_KEYS);

    const defaultLanguage = settings.defaultTargetLanguage || "th";

    const modal = document.createElement("div");
    modal.className = "jattumnn-modal";

    const header = document.createElement("div");
    header.className = "jattumnn-modal-header";
    header.innerHTML = `
      <h2>📝 JATTUMNN Translator</h2>
      <button class="jattumnn-close-btn" id="jattumnnCloseModal">✕</button>
    `;

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
        <div class="jattumnn-result-header">
          <div class="jattumnn-result-label">✨ Translation Result</div>
          <button id="jattumnnCopyBtn" class="jattumnn-copy-btn" style="display: none;">📋 Copy</button>
        </div>
        <div id="jattumnnResultText" class="jattumnn-result-text"></div>
      </div>
    `;

    const footer = document.createElement("div");
    footer.className = "jattumnn-modal-footer";
    footer.textContent = `💡 Powered by ${settings.selectedProvider || "DeepSeek"} • Press ESC to close`;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    modalOverlay.appendChild(modal);

    const languageSelect = body.querySelector("#jattumnnTargetLanguage");
    if (languageSelect && defaultLanguage) {
      languageSelect.value = defaultLanguage;
    }

    document.body.appendChild(modalOverlay);

    const textarea = body.querySelector("#jattumnnInputText");
    setTimeout(() => textarea.focus(), FOCUS_DELAY);

    setupModalEventListeners(settings);
  } catch (error) {
    console.error("[JATTUMNN] Error creating modal:", error);
    showModalError("Failed to create modal. Please try again.");
  }
}

function setupModalEventListeners(settings) {
  if (!modalOverlay) return;

  const closeBtn = modalOverlay.querySelector("#jattumnnCloseModal");
  const translateBtn = modalOverlay.querySelector("#jattumnnTranslateBtn");
  const textarea = modalOverlay.querySelector("#jattumnnInputText");
  const targetLangSelect = modalOverlay.querySelector("#jattumnnTargetLanguage");

  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

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

  if (textarea) {
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (e.shiftKey) {
          return;
        } else {
          e.preventDefault();
          if (translateBtn) translateBtn.click();
        }
      }
    });
  }
}

async function handleModalTranslation(inputText, targetLanguage, settings) {
  const translateBtn = modalOverlay?.querySelector("#jattumnnTranslateBtn");
  const resultArea = modalOverlay?.querySelector("#jattumnnResultArea");
  const resultText = modalOverlay?.querySelector("#jattumnnResultText");

  if (!translateBtn || !resultArea || !resultText) return;

  const originalBtnText = translateBtn.innerHTML;
  translateBtn.innerHTML = '<span class="jattumnn-loading"></span> Translating...';
  translateBtn.disabled = true;

  resultArea.style.display = "none";

  try {
    const customPrompt = await getModalPrompt(targetLanguage, settings);

    const response = await chrome.runtime.sendMessage({
      action: "translateInputText",
      text: inputText,
      targetLanguage,
      customPrompt,
    });

    if (response.error) {
      throw new Error(response.error);
    }

    resultText.textContent = response.translatedText;
    resultArea.style.display = "block";
    resultArea.scrollIntoView({ behavior: "smooth", block: "nearest" });

    if (settings.autoCopyResult) {
      navigator.clipboard.writeText(response.translatedText);
    }

    const copyBtn = modalOverlay.querySelector("#jattumnnCopyBtn");
    if (copyBtn) {
      copyBtn.style.display = "inline-block";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(response.translatedText).then(() => {
          copyBtn.textContent = "✅ Copied!";
          setTimeout(() => { copyBtn.textContent = "📋 Copy"; }, 2000);
        });
      };
    }
  } catch (error) {
    console.error("[JATTUMNN] Translation error:", error);
    showModalError(error.message || "Translation failed. Please check your settings.");
  } finally {
    translateBtn.innerHTML = originalBtnText;
    translateBtn.disabled = false;
  }
}

function showModalError(errorMessage) {
  if (!modalOverlay) return;

  const resultArea = modalOverlay.querySelector("#jattumnnResultArea");
  const resultText = modalOverlay.querySelector("#jattumnnResultText");

  if (resultArea && resultText) {
    resultText.innerHTML = "";
    const errorDiv = document.createElement("div");
    errorDiv.className = "jattumnn-error";
    errorDiv.textContent = `⚠️ ${errorMessage}`;
    resultText.appendChild(errorDiv);
    resultArea.style.display = "block";

    setTimeout(() => {
      if (resultArea && modalOverlay) {
        const errorDiv = resultText.querySelector(".jattumnn-error");
        if (errorDiv && !resultText.textContent.includes("Translation result")) {
          resultArea.style.display = "none";
        }
      }
    }, ERROR_AUTO_HIDE);
  }
}

export function closeModal() {
  if (modalOverlay) {
    modalOverlay.remove();
    modalOverlay = null;
  }
}

export function isModalOpen() {
  return modalOverlay !== null;
}

async function getModalPrompt(targetLanguage, settings) {
  const useGlobalPrompt = settings.useModalCustomPrompt || false;
  const globalCustomPrompt = settings.modalCustomPrompt || "";
  const languagePrompts = settings.languagePrompts || {};

  const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

  if (useGlobalPrompt && globalCustomPrompt) {
    return globalCustomPrompt.replace(/{targetLanguage}/g, targetLangName);
  }

  if (languagePrompts && languagePrompts[targetLanguage]) {
    return languagePrompts[targetLanguage].replace(/{targetLanguage}/g, targetLangName);
  }

  const defaultPrompts = {
    th: "Translate to Thai using natural and polite language. Use appropriate Thai particles (ครับ/ค่ะ) where suitable. Keep the translation natural and conversational.",
    ja: "Translate to Japanese using polite keigo (丁寧語) where appropriate. Keep the translation natural.",
    ko: "Translate to Korean using natural, polite language with appropriate honorifics.",
  };

  if (defaultPrompts[targetLanguage]) {
    return defaultPrompts[targetLanguage];
  }

  return `Translate the following text to ${targetLangName}.
For proper nouns (names of people, places, brands), keep them in their original spelling.
Maintain formatting and spacing. Output only the translation, no explanations.`;
}
