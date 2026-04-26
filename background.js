// background.js

chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    default:
      console.warn("Background: unknown command received:", command);
      return;

    case "translate-text":
      try {
        const activeTab = await checkForActiveTab();

        if (!activeTab) {
          console.warn("Background: no active tab found");
          return;
        }

        const response = await chrome.tabs.sendMessage(activeTab.id, {
          action: "getHoveredElementText",
        });

        console.log(response.text);
      } catch (error) {
        catchScriptError(error);
      }
      break;
  }
});

function catchScriptError(error) {
  if (error.message?.includes("Receiving end does not exist")) {
    console.warn(
      "Background: content script not ready or not injected in this tab",
    );
  } else {
    console.error("Background: failed to send message", error);
  }
}

async function checkForActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab) {
    return null;
  } else {
    return tab;
  }
}
