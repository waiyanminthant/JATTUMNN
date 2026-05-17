import { MAX_LOG_ENTRIES } from "./options.js";

export async function logError(error, context = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message: error.message || String(error),
    stack: error.stack,
    context,
    type: error.name || 'Error',
  };

  try {
    const { errorLog = [] } = await chrome.storage.local.get('errorLog');
    errorLog.unshift(logEntry);
    if (errorLog.length > MAX_LOG_ENTRIES) errorLog.pop();
    await chrome.storage.local.set({ errorLog });
    console.log('[JATTUMNN] Error logged:', logEntry.message);
  } catch (e) {
    console.error('[JATTUMNN] Failed to write error log:', e);
  }
}

export async function clearErrorLog() {
  await chrome.storage.local.set({ errorLog: [] });
}

export async function getErrorLog() {
  const { errorLog = [] } = await chrome.storage.local.get('errorLog');
  return errorLog;
}
