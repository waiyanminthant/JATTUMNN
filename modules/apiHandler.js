// apiHandler.js – provider-driven, no hardcoded URLs or formats.

export async function callTranslationAPI(provider, apiKey, model, systemPrompt, text, timeoutMs = 5000, customBaseUrl = '') {
  // Resolve the completions URL — Gemini encodes model+key in URL, custom encodes base URL
  let url;
  if (provider.id === 'gemini') {
    url = provider.completionsUrl(model, apiKey);
  } else if (provider.id === 'openai_compat') {
    const base = customBaseUrl.replace(/\/+$/, '');
    url = `${base}/v1/chat/completions`;
  } else {
    url = provider.completionsUrl;
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: provider.buildHeaders(apiKey),
      body: JSON.stringify(provider.buildBody(model, systemPrompt, text)),
      signal: abortController.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function handleAPIError(provider, apiResponse) {
  const knownMessage = provider.httpErrorMessages?.[apiResponse.status];
  let errorMsg = knownMessage ?? `API error: ${apiResponse.status}`;

  // Try to extract a more specific message from the response body
  try {
    const data = await apiResponse.json();
    // OpenAI / DeepSeek / OpenAI-compat shape
    const bodyMsg = data.error?.message
      // Gemini shape
      ?? data.error?.details?.[0]?.reason
      ?? null;
    if (bodyMsg) errorMsg = bodyMsg;
  } catch (_) {}

  throw new Error(errorMsg);
}