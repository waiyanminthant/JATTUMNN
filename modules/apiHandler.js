import { DEFAULT_DEEPSEEK_API_URL } from "./options.js";

export async function callTranslationAPI(apiKey, aiModel, systemPrompt, text, timeoutMs = 5000) {

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  const response = await fetch(DEFAULT_DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      thinking: { type: "disabled" },
      temperature: 0.3,
      max_tokens: 2000,
    }),
    signal: abortController.signal,
  });

  return response;
}

export function handleAPIError(apiResponse) {
  let errorMsg = `API error: ${apiResponse.status}`;
  if (apiResponse.status === 401)
    errorMsg = "Invalid API key. Please check your DeepSeek API key.";
  if (apiResponse.status === 429)
    errorMsg = "Rate limit exceeded. Please wait and try again.";
  if (apiResponse.status === 402)
    errorMsg = "Insufficient balance. Please top up your DeepSeek account.";
  try {
    const data = apiResponse.json();
    errorMsg = data.error?.message || errorMsg;
  } catch (e) {}
   throw new Error(errorMsg);
}