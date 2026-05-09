import { MAX_LOG_ENTRIES } from "./options.js";

// Error logging function. 
// Logs errors to chrome.storage.local with a timestamp, message, stack trace, and optional context. 
// Maintains a capped log of recent errors for debugging purposes.
export async function logError(error, context = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message: error.message || String(error),
    stack: error.stack,
    context: context,
    type: error.name || 'Error'
  };
  
  try {
    const { errorLog = [] } = await chrome.storage.local.get('errorLog');
    errorLog.unshift(logEntry);
    if (errorLog.length > MAX_LOG_ENTRIES) errorLog.pop();
    await chrome.storage.local.set({ errorLog });
    console.log('[JATTUMNN] Error logged:', logEntry.message);
  } catch (e) {
    console.error('Failed to write error log:', e);
  }
}

// Clears the error log by setting it to an empty array in chrome.storage.local.
export async function clearErrorLog() {
  await chrome.storage.local.set({ errorLog: [] });
}

// Retrieves the error log from chrome.storage.local, returning an array of log entries.
export async function getErrorLog() {
  const { errorLog = [] } = await chrome.storage.local.get('errorLog');
  return errorLog;
}