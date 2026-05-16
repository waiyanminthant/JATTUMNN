export const JATTUMNN_SEPARATOR = '__SEP__';
export const MAX_LOG_ENTRIES = 100;
export const DEFAULT_ENG_TRANSLATION_PROMPT = "Translate to English. For proper nouns translate to their original English spelling. Keep formatting, spacing, and the separator '__SEP__' unchanged. Output only the translation, no explanations.";

// ---------------------------------------------------------------------------
// Provider Registry
// Each entry fully describes how to talk to one AI backend.
// To add a new provider: append one object here — nothing else needs changing
// in apiHandler.js or translationHandler.js.
// ---------------------------------------------------------------------------
export const PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    apiKeyPlaceholder: 'sk-...',
    apiKeyLabel: '🔑 DeepSeek API Key',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    docsLabel: 'DeepSeek Platform',
    docsNote: '(Minimum 2 USD Top Up)',
    modelsUrl: 'https://api.deepseek.com/models',
    completionsUrl: 'https://api.deepseek.com/chat/completions',
    hasCustomBaseUrl: false,
    filterModels: (models) => models.filter(m => m.owned_by === 'deepseek'),
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }),
    buildBody: (model, systemPrompt, text) => ({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: text },
      ],
      thinking: { type: 'disabled' },
      temperature: 0.3,
      max_tokens: 2000,
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content?.trim(),
    httpErrorMessages: {
      401: 'Invalid API key. Please check your DeepSeek API key.',
      402: 'Insufficient balance. Please top up your DeepSeek account.',
      429: 'Rate limit exceeded. Please wait and try again.',
    },
  },

  {
    id: 'openai',
    name: 'OpenAI',
    apiKeyPlaceholder: 'sk-...',
    apiKeyLabel: '🔑 OpenAI API Key',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'OpenAI Platform',
    docsNote: null,
    modelsUrl: 'https://api.openai.com/v1/models',
    completionsUrl: 'https://api.openai.com/v1/chat/completions',
    hasCustomBaseUrl: false,
    filterModels: (models) => models.filter(m =>
      m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3')
    ).sort((a, b) => b.id.localeCompare(a.id)),
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }),
    buildBody: (model, systemPrompt, text) => ({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: text },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content?.trim(),
    httpErrorMessages: {
      401: 'Invalid API key. Please check your OpenAI API key.',
      429: 'Rate limit exceeded or quota reached. Check your OpenAI usage.',
      500: 'OpenAI server error. Please try again later.',
    },
  },

  {
    id: 'gemini',
    name: 'Google Gemini',
    apiKeyPlaceholder: 'AIza...',
    apiKeyLabel: '🔑 Gemini API Key',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'Google AI Studio',
    docsNote: null,
    modelsUrl: (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    completionsUrl: (model, apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    hasCustomBaseUrl: false,
    filterModels: (models) => models
      .filter(m => m.name && m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => ({ id: m.name.replace('models/', ''), ...m }))
      .sort((a, b) => b.id.localeCompare(a.id)),
    buildHeaders: (_apiKey) => ({
      'Content-Type': 'application/json',
    }),
    buildBody: (_model, systemPrompt, text) => ({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
    }),
    parseResponse: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text?.trim(),
    httpErrorMessages: {
      400: 'Bad request. Your prompt or model may be invalid.',
      401: 'Invalid Gemini API key. Please check your key.',
      403: 'API key does not have access to this model.',
      429: 'Rate limit exceeded. Please wait and try again.',
      500: 'Google server error. Please try again later.',
    },
  },

  {
    id: 'openai_compat',
    name: 'OpenAI-Compatible',
    apiKeyPlaceholder: 'API key (leave blank if not required)',
    apiKeyLabel: '🔑 API Key',
    docsUrl: null,
    docsLabel: null,
    docsNote: 'Works with Ollama, LM Studio, Groq, Together AI, and any OpenAI-compatible server.',
    modelsUrl: '__custom__',
    completionsUrl: '__custom__',
    hasCustomBaseUrl: true,
    filterModels: (models) => models.sort((a, b) => a.id.localeCompare(b.id)),
    buildHeaders: (apiKey) => {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey && apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey}`;
      return headers;
    },
    buildBody: (model, systemPrompt, text) => ({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: text },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content?.trim(),
    httpErrorMessages: {
      401: 'Unauthorized. Check the API key for your custom server.',
      404: 'Endpoint not found. Check the base URL.',
      500: 'Server error from the custom endpoint.',
    },
  },
];

// Convenience lookup: getProvider('openai') -> provider object, falls back to deepseek
export function getProvider(id) {
  return PROVIDERS.find(p => p.id === id) ?? PROVIDERS[0];
}