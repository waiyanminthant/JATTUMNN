(async () => {
  const src = chrome.runtime.getURL('content.js');
  const contentScript = await import(src);
  // Your logic here
})();