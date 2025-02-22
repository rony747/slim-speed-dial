class SpeedDial {
  constructor() {
    this.groups = [];
    this.currentGroup = null;
    this.settings = {
      columnSize: 250,
      thumbnailHeight: 180,
      showThumbnails: true,
      showUrls: true,
    };
    this.init();
  }

  async init() {
    await this.loadFromStorage();
    this.setupEventListeners();
    this.setupContextMenu();
    this.renderGroups();
  }

  setupEventListeners() {
    // Group modal events
    document
      .getElementById("addGroupBtn")
      .addEventListener("click", () => this.showAddGroupModal());
    document
      .getElementById("saveGroupBtn")
      .addEventListener("click", () => this.saveGroup());
    document
      .getElementById("cancelGroupBtn")
      .addEventListener("click", () => this.hideGroupModal());

    // Site modal events
    document.getElementById("saveSiteBtn").addEventListener("click", () => {
      this.saveSite();
      this.hideModal();
    });
    document
      .getElementById("cancelSiteBtn")
      .addEventListener("click", () => this.hideModal());

    // Close modals when clicking outside
    window.addEventListener("click", (event) => {
      if (event.target.classList.contains("modal")) {
        this.hideModal();
        this.hideGroupModal();
      }
    });

    // Add keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hideModal();
        this.hideGroupModal();
      }
      if (e.key === "Enter") {
        const groupModal = document.getElementById("addGroupModal");
        const siteModal = document.getElementById("addSiteModal");
        if (groupModal.style.display === "block") {
          this.saveGroup();
        } else if (siteModal.style.display === "block") {
          this.saveSite();
          this.hideModal();
        }
      }
    });

    // Settings modal events
    document
      .getElementById("settingsBtn")
      .addEventListener("click", () => this.showSettingsModal());
    document
      .getElementById("saveSettingsBtn")
      .addEventListener("click", () => this.saveSettings());
    document
      .getElementById("cancelSettingsBtn")
      .addEventListener("click", () => this.hideSettingsModal());

    // Settings live preview
    document.getElementById("columnSize").addEventListener("change", (e) => {
      this.settings.columnSize = parseInt(e.target.value);
      this.applySettings();
    });

    document
      .getElementById("thumbnailHeight")
      .addEventListener("input", (e) => {
        this.settings.thumbnailHeight = parseInt(e.target.value);
        document.getElementById(
          "thumbnailHeightValue"
        ).textContent = `${e.target.value}px`;
        this.applySettings();
      });

    document
      .getElementById("showThumbnails")
      .addEventListener("change", (e) => {
        this.settings.showThumbnails = e.target.checked;
        this.applySettings();
      });

    document.getElementById("showUrls").addEventListener("change", (e) => {
      this.settings.showUrls = e.target.checked;
      this.applySettings();
    });
  }

  async setupContextMenu() {
    // Remove existing menu items first
    await chrome.contextMenus.removeAll();

    // Create parent menu item
    chrome.contextMenus.create({
      id: "addToSpeedDial",
      title: "Add to Speed Dial",
      contexts: ["page", "link"],
    });

    // Create submenu items for each group
    this.groups.forEach((group) => {
      chrome.contextMenus.create({
        id: `addTo_${group.id}`,
        parentId: "addToSpeedDial",
        title: group.name,
        contexts: ["page", "link"],
      });
    });

    // Handle context menu clicks
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      const groupId = info.menuItemId.replace("addTo_", "");
      const group = this.groups.find((g) => g.id === groupId);

      if (group) {
        try {
          const url = info.linkUrl || info.pageUrl;
          const title = info.linkUrl
            ? new URL(info.linkUrl).hostname
            : tab.title;
          const thumbnail = await this.generateThumbnail(url);

          group.sites.push({
            id: Date.now().toString(),
            name: title,
            url: url,
            thumbnail: thumbnail,
          });

          await this.saveToStorage();
          this.renderSites();
        } catch (error) {
          console.error("Error adding site from context menu:", error);
          alert("Failed to add site. Please try again.");
        }
      }
    });
  }

  async loadFromStorage() {
    try {
      const data = await chrome.storage.local.get([
        "speedDialData",
        "settings",
      ]);
      this.groups = data.speedDialData?.groups || [];
      this.settings = { ...this.settings, ...data.settings };
      this.currentGroup = this.groups[0]?.id || null;
      this.applySettings();
    } catch (error) {
      console.error("Error loading from storage:", error);
    }
  }

  async saveToStorage() {
    try {
      await chrome.storage.local.set({
        speedDialData: { groups: this.groups },
        settings: this.settings,
      });
    } catch (error) {
      console.error("Error saving to storage:", error);
    }
  }

  showAddGroupModal() {
    document.getElementById("addGroupModal").style.display = "block";
    document.getElementById("groupName").focus();
  }

  hideGroupModal() {
    const modal = document.getElementById("addGroupModal");
    modal.style.display = "none";
    document.getElementById("groupName").value = "";
  }

  async saveGroup() {
    const nameInput = document.getElementById("groupName");
    const name = nameInput.value.trim();

    if (name) {
      await this.addGroup(name);
      this.hideGroupModal();
    } else {
      alert("Please enter a group name");
    }
  }

  showAddSiteModal() {
    document.getElementById("addSiteModal").style.display = "block";
  }

  hideModal() {
    document.getElementById("addSiteModal").style.display = "none";
  }

  async saveSite() {
    const nameInput = document.getElementById("siteName");
    const urlInput = document.getElementById("siteUrl");
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    const saveBtn = document.getElementById("saveSiteBtn");

    try {
      // Validate inputs
      if (!name || !url) {
        throw new Error("Please enter both name and URL");
      }

      // Add https:// if no protocol specified
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }

      // Validate URL
      new URL(url);

      if (!this.currentGroup) {
        throw new Error("Please create or select a group first");
      }

      const group = this.groups.find((g) => g.id === this.currentGroup);
      if (!group) {
        throw new Error("Selected group not found");
      }

      // Show loading state
      saveBtn.textContent = "Saving...";
      saveBtn.disabled = true;

      try {
        // Generate thumbnail
        const thumbnail = await this.generateThumbnail(url);

        // Add the site
        group.sites.push({
          id: Date.now().toString(),
          name: name,
          url: url,
          thumbnail: thumbnail,
        });

        // Save to storage
        await this.saveToStorage();
        console.log("Site saved successfully");

        // Update UI
        this.renderSites();

        // Clear inputs for next entry
        nameInput.value = "";
        urlInput.value = "";

        // Reset button
        saveBtn.textContent = "Add Site";
        saveBtn.disabled = false;
      } catch (error) {
        console.error("Error in saveSite:", error);
        throw new Error("Failed to save site. Please try again.");
      }
    } catch (error) {
      // Reset button state
      saveBtn.textContent = "Add Site";
      saveBtn.disabled = false;

      // Show error to user
      alert(error.message || "Error saving site. Please try again.");
    }
  }

  async generateThumbnail(url) {
    try {
      // First try to get a favicon
      const domain = new URL(url).hostname;
      const favicon = `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(
        domain
      )}`;

      // Test if favicon exists and use it if available
      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = favicon;
        });
        return favicon;
      } catch (faviconError) {
        console.log("Favicon not found, trying screenshot...");
      }

      // If favicon fails, try screenshot
      const window = await chrome.windows.create({
        url: url,
        type: "popup",
        width: 1280,
        height: 800,
        focused: false,
        state: "minimized", // Keep it minimized to avoid flashing
      });

      // Wait for the page to load
      await new Promise((resolve) => setTimeout(resolve, 3000));

      try {
        // Capture the screenshot
        const screenshot = await chrome.tabs.captureVisibleTab(window.id, {
          format: "jpeg",
          quality: 60,
        });

        // Close the temporary window
        await chrome.windows.remove(window.id);
        return screenshot;
      } catch (screenshotError) {
        // If screenshot fails, close window
        await chrome.windows.remove(window.id);
        throw screenshotError;
      }
    } catch (error) {
      console.error("Error generating thumbnail:", error);
      // Return default icon as last resort
      return "icons/icon128.png";
    }
  }

  renderGroups() {
    const container = document.getElementById("groupTabs");
    container.innerHTML = "";

    this.groups.forEach((group) => {
      const tab = document.createElement("div");
      tab.className = `group-tab ${
        group.id === this.currentGroup ? "active" : ""
      }`;
      tab.textContent = group.name;
      tab.addEventListener("click", () => {
        this.currentGroup = group.id;
        this.renderGroups();
        this.renderSites();
      });
      container.appendChild(tab);
    });

    this.renderSites();
  }

  renderSites() {
    const container = document.getElementById("speedDialContainer");
    container.innerHTML = "";

    const group = this.groups.find((g) => g.id === this.currentGroup);
    if (!group) return;

    group.sites.forEach((site) => {
      const item = document.createElement("div");
      item.className = "speed-dial-item";
      item.innerHTML = `
        <div class="site-thumbnail" style="background-image: url('${
          site.thumbnail
        }')">
          <div class="site-overlay"></div>
        </div>
        <div class="site-info">
          <h3>${site.name}</h3>
          <span class="site-url">${new URL(site.url).hostname}</span>
        </div>
      `;

      item.addEventListener("click", () => {
        window.open(site.url, "_blank");
      });

      container.appendChild(item);
    });

    // Add "Add Site" button
    const addButton = document.createElement("div");
    addButton.className = "speed-dial-item add-site";
    addButton.innerHTML = `
      <div class="site-info">
        <h3>+ Add New Site</h3>
      </div>
    `;
    addButton.addEventListener("click", () => this.showAddSiteModal());
    container.appendChild(addButton);
  }

  async addGroup(name) {
    const group = {
      id: Date.now().toString(),
      name: name,
      sites: [],
    };
    this.groups.push(group);
    await this.saveToStorage();
    this.currentGroup = group.id;
    this.renderGroups();

    // Update context menu
    await this.setupContextMenu();
  }

  showSettingsModal() {
    const modal = document.getElementById("settingsModal");
    // Update inputs with current settings
    document.getElementById("columnSize").value = this.settings.columnSize;
    document.getElementById("thumbnailHeight").value =
      this.settings.thumbnailHeight;
    document.getElementById(
      "thumbnailHeightValue"
    ).textContent = `${this.settings.thumbnailHeight}px`;
    document.getElementById("showThumbnails").checked =
      this.settings.showThumbnails;
    document.getElementById("showUrls").checked = this.settings.showUrls;
    modal.style.display = "block";
  }

  hideSettingsModal() {
    document.getElementById("settingsModal").style.display = "none";
    // Revert to saved settings
    this.applySettings();
  }

  async saveSettings() {
    await this.saveToStorage();
    this.hideSettingsModal();
  }

  applySettings() {
    const container = document.getElementById("speedDialContainer");
    // Apply column size
    container.style.gridTemplateColumns = `repeat(auto-fill, minmax(${this.settings.columnSize}px, 1fr))`;

    // Apply thumbnail height
    document.documentElement.style.setProperty(
      "--thumbnail-height",
      `${this.settings.thumbnailHeight}px`
    );

    // Toggle thumbnails
    document.body.classList.toggle(
      "hide-thumbnails",
      !this.settings.showThumbnails
    );

    // Toggle URLs
    document.body.classList.toggle("hide-urls", !this.settings.showUrls);
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.speedDial = new SpeedDial();
});
