chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "captureThumbnail") {
    chrome.windows.create(
      {
        url: request.url,
        type: "popup",
        width: 1280,
        height: 800,
        focused: true,
        state: "normal",
      },
      async (createdWindow) => {
        try {
          // Wait for the page to load
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // Find the tab in the created window
          const tabs = await chrome.tabs.query({ windowId: createdWindow.id });
          if (!tabs || tabs.length === 0) {
            throw new Error("Tab not found");
          }
          const tab = tabs[0];

          // Wait for tab to complete loading
          if (tab.status !== "complete") {
            await new Promise((resolve) => {
              chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === tab.id && info.status === "complete") {
                  chrome.tabs.onUpdated.removeListener(listener);
                  resolve();
                }
              });
            });
          }

          // Take screenshot using Chrome's API
          const dataUrl = await chrome.tabs.captureVisibleTab(
            createdWindow.id,
            {
              format: "jpeg",
              quality: 70,
            }
          );

          // Close the window and send the response
          await chrome.windows.remove(createdWindow.id);
          sendResponse({ thumbnail: dataUrl });
        } catch (error) {
          console.error("Capture error:", error);
          try {
            await chrome.windows.remove(createdWindow.id);
          } catch (e) {
            console.error("Cleanup error:", e);
          }
          sendResponse({ error: error.message });
        }
      }
    );
    return true;
  }
});
