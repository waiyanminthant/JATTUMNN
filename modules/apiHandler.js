export async function callTranslationAPI(provider, apiKey, model, systemPrompt, text, timeoutMs = 5000, customBaseUrl = '') {
  const url = provider.id === 'gemini'
    ? provider.completionsUrl(model, apiKey)
    : provider.id === 'openai_compat'
      ? `${customBaseUrl.replace(/\/+$/, '')}/v1/chat/completions`
      : provider.completionsUrl;

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

  try {
    const data = await apiResponse.json();
    const bodyMsg = data.error?.message
      ?? data.error?.details?.[0]?.reason
      ?? null;
    if (bodyMsg) errorMsg = bodyMsg;
  } catch (_) {}

  throw new Error(errorMsg);
}
