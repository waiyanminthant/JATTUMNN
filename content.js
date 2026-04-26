chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "logHello") {
    console.log("Hello from the content script! Shortcut worked.");
  }
});