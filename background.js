chrome.commands.onCommand.addListener(async (command) => {
  if (command === "log-hello") {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { action: "logHello" });
        console.log("Background: message sent to tab", tab.id);
      } else {
        console.warn("Background: no active tab found");
      }
    } catch (error) {
      console.error("Background: failed to send message", error);
    }
  }
});