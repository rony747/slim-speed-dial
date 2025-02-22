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

    // Bind methods to this instance
    this.saveSite = this.saveSite.bind(this);
  }

  async init() {
    await this.loadFromStorage();
    this.setupEventListeners();
    this.setupContextMenu();
    this.renderGroups();

    let useThumbnails = false;

    // Load the thumbnail preference
    chrome.storage.sync.get(["useThumbnails"], (result) => {
      useThumbnails = result.useThumbnails || false;
      document.getElementById("useThumbnails").checked = useThumbnails;
    });

    // Listen for changes to the thumbnail setting
    document.getElementById("useThumbnails").addEventListener("change", (e) => {
      useThumbnails = e.target.checked;
      chrome.storage.sync.set({ useThumbnails });
      this.refreshSpeedDial(); // Refresh your speed dial display
    });
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
    const modal = document.getElementById("addSiteModal");
    const nameInput = document.getElementById("siteName");
    const urlInput = document.getElementById("siteUrl");
    const saveBtn = document.getElementById("saveSiteBtn");

    // Reset modal
    modal.querySelector("h2").textContent = "Add New Site";
    saveBtn.textContent = "Add Site";
    nameInput.value = "";
    urlInput.value = "";

    // Show modal
    modal.style.display = "block";
    urlInput.focus();

    // Remove any existing click handlers
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    // Add the add site handler
    newSaveBtn.addEventListener("click", () => {
      this.saveSite();
      this.hideModal();
    });
  }

  hideModal() {
    document.getElementById("addSiteModal").style.display = "none";
  }

  async saveSite() {
    const nameInput = document.getElementById("siteName");
    const urlInput = document.getElementById("siteUrl");
    let url = urlInput.value.trim();
    const saveBtn = document.getElementById("saveSiteBtn");

    try {
      // Validate inputs
      if (!url) {
        throw new Error("Please enter the URL");
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
        // Generate thumbnail and fetch title in parallel
        const [thumbnail, title] = await Promise.all([
          this.generateThumbnail(url),
          this.fetchSiteTitle(url),
        ]);

        // Add the site
        group.sites.push({
          id: Date.now().toString(),
          name: nameInput.value.trim() || title,
          url: url,
          thumbnail: thumbnail,
        });

        // Save to storage
        await this.saveToStorage();

        // Update UI
        this.renderSites();

        // Reset modal
        const modal = document.getElementById("addSiteModal");
        modal.style.display = "none";
        nameInput.value = "";
        urlInput.value = "";
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
      alert(error.message || "Error saving site. Please try again.");
    }
  }

  async generateThumbnail(url) {
    try {
      // Check if we should use website thumbnails
      const result = await chrome.storage.sync.get(["useThumbnails"]);
      const useThumbnails = result.useThumbnails || false;

      if (!useThumbnails) {
        // Use favicon if thumbnails are disabled
        const domain = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(
          domain
        )}`;
      }

      // Use background script to capture thumbnail
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: "captureThumbnail", url },
          (response) => {
            if (response && response.thumbnail) {
              resolve(response);
            } else {
              reject(new Error("Failed to capture thumbnail"));
            }
          }
        );
      });

      return response.thumbnail;
    } catch (error) {
      console.error("Error generating thumbnail:", error);
      // Fallback to favicon on error
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(
        domain
      )}`;
    }
  }

  async fetchSiteTitle(url) {
    try {
      // Create a temporary tab to get the page title
      const tab = await new Promise((resolve) => {
        chrome.tabs.create({ url, active: false }, (tab) => resolve(tab));
      });

      // Wait for the tab to load
      await new Promise((resolve) => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
          if (tabId === tab.id && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        });
      });

      // Get the tab info to get the title
      const tabInfo = await new Promise((resolve) => {
        chrome.tabs.get(tab.id, (tab) => resolve(tab));
      });

      // Clean up the temporary tab
      chrome.tabs.remove(tab.id);

      return tabInfo.title || new URL(url).hostname;
    } catch (error) {
      console.error("Error fetching title:", error);
      return new URL(url).hostname;
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

      // Create wrapper for group name and menu
      tab.innerHTML = `
        <span class="group-name">${group.name}</span>
        <button class="group-menu-btn">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"/>
          </svg>
        </button>
        <div class="group-menu-dropdown">
          <button class="remove-group">Remove Group</button>
        </div>
      `;

      // Click handler for the group name
      const groupName = tab.querySelector(".group-name");
      groupName.addEventListener("click", () => {
        this.currentGroup = group.id;
        this.renderGroups();
        this.renderSites();
      });

      // Menu button click handler
      const menuBtn = tab.querySelector(".group-menu-btn");
      const menuDropdown = tab.querySelector(".group-menu-dropdown");
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Close all other dropdowns first
        document
          .querySelectorAll(".group-menu-dropdown.show")
          .forEach((dropdown) => {
            if (dropdown !== menuDropdown) {
              dropdown.classList.remove("show");
            }
          });
        menuDropdown.classList.toggle("show");
      });

      // Remove group handler
      tab
        .querySelector(".remove-group")
        .addEventListener("click", async (e) => {
          e.stopPropagation();
          menuDropdown.classList.remove("show");

          if (this.groups.length === 1) {
            alert(
              "Cannot remove the last group. At least one group is required."
            );
            return;
          }

          if (
            confirm(
              `Are you sure you want to remove "${group.name}" and all its sites?`
            )
          ) {
            // Remove the group
            this.groups = this.groups.filter((g) => g.id !== group.id);

            // If we removed the current group, switch to the first available group
            if (this.currentGroup === group.id) {
              this.currentGroup = this.groups[0]?.id || null;
            }

            await this.saveToStorage();
            this.renderGroups();
          }
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
          <div class="site-menu">
            <button class="menu-btn">
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"/>
              </svg>
            </button>
            <div class="menu-dropdown">
              <button class="edit-dial">Edit</button>
              <button class="move-dial">Move to Group</button>
              <button class="refresh-thumb">Refresh Thumbnail</button>
              <button class="remove-dial">Remove</button>
            </div>
          </div>
        </div>
        <div class="site-info">
          ${
            this.settings.showThumbnails
              ? `
            <img class="site-icon" src="https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(
              new URL(site.url).hostname
            )}" />
          `
              : ""
          }
          <h3>${site.name}</h3>
          <span class="site-url">${new URL(site.url).hostname}</span>
        </div>
      `;

      // Add click handler for the site
      const thumbnail = item.querySelector(".site-thumbnail");
      thumbnail.addEventListener("click", (e) => {
        // Only open the site if we didn't click the menu
        if (!e.target.closest(".site-menu")) {
          window.open(site.url, "_blank");
        }
      });

      // Menu button click handler
      const menuBtn = item.querySelector(".menu-btn");
      const menuDropdown = item.querySelector(".menu-dropdown");
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        menuDropdown.classList.toggle("show");
      });

      // Close dropdown when clicking outside
      document.addEventListener("click", () => {
        menuDropdown.classList.remove("show");
      });

      // Refresh thumbnail handler
      item
        .querySelector(".refresh-thumb")
        .addEventListener("click", async (e) => {
          e.stopPropagation();
          menuDropdown.classList.remove("show");
          try {
            const thumbnail = await this.generateThumbnail(site.url);
            site.thumbnail = thumbnail;
            await this.saveToStorage();
            this.renderSites();
          } catch (error) {
            console.error("Error refreshing thumbnail:", error);
            alert("Failed to refresh thumbnail. Please try again.");
          }
        });

      // Edit dial handler
      item.querySelector(".edit-dial").addEventListener("click", async (e) => {
        e.stopPropagation();
        menuDropdown.classList.remove("show");
        this.showEditSiteModal(site);
      });

      // Move dial handler
      item.querySelector(".move-dial").addEventListener("click", async (e) => {
        e.stopPropagation();
        menuDropdown.classList.remove("show");
        this.showMoveToGroupModal(site, group);
      });

      // Remove dial handler
      item
        .querySelector(".remove-dial")
        .addEventListener("click", async (e) => {
          e.stopPropagation();
          menuDropdown.classList.remove("show");
          if (confirm(`Are you sure you want to remove ${site.name}?`)) {
            group.sites = group.sites.filter((s) => s.id !== site.id);
            await this.saveToStorage();
            this.renderSites();
          }
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

  async refreshSpeedDial() {
    await this.loadFromStorage();
    this.renderGroups();
  }

  showEditSiteModal(site) {
    const modal = document.getElementById("addSiteModal");
    const nameInput = document.getElementById("siteName");
    const urlInput = document.getElementById("siteUrl");
    const saveBtn = document.getElementById("saveSiteBtn");

    // Update modal for edit mode
    modal.querySelector("h2").textContent = "Edit Site";
    saveBtn.textContent = "Save Changes";

    // Fill in existing values
    nameInput.value = site.name;
    urlInput.value = site.url;

    // Show modal
    modal.style.display = "block";
    urlInput.focus();

    // Find the group containing this site
    const group = this.groups.find((g) =>
      g.sites.some((s) => s.id === site.id)
    );
    if (!group) {
      alert("Error: Site's group not found");
      return;
    }

    // Create a new save handler for edit mode
    const saveHandler = async (e) => {
      e.preventDefault();
      try {
        let url = urlInput.value.trim();

        if (!url) {
          throw new Error("Please enter the URL");
        }

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }

        // Validate URL
        new URL(url);

        // Show loading state
        saveBtn.textContent = "Saving...";
        saveBtn.disabled = true;

        // Find the site in the group
        const siteIndex = group.sites.findIndex((s) => s.id === site.id);
        if (siteIndex === -1) {
          throw new Error("Site not found in group");
        }

        // If URL changed, update thumbnail and fetch new title
        if (url !== site.url) {
          const [newThumbnail, newTitle] = await Promise.all([
            this.generateThumbnail(url),
            this.fetchSiteTitle(url),
          ]);

          // Update the site in the group
          group.sites[siteIndex] = {
            ...site,
            url: url,
            thumbnail: newThumbnail,
            name: nameInput.value.trim() || newTitle,
          };
        } else {
          // Just update the name if URL hasn't changed
          group.sites[siteIndex] = {
            ...site,
            name: nameInput.value.trim() || site.name,
          };
        }

        // Save changes
        await this.saveToStorage();
        this.renderSites();

        // Reset and close modal
        modal.style.display = "none";
        nameInput.value = "";
        urlInput.value = "";
        modal.querySelector("h2").textContent = "Add New Site";
        saveBtn.textContent = "Add Site";
        saveBtn.disabled = false;
      } catch (error) {
        saveBtn.textContent = "Save Changes";
        saveBtn.disabled = false;
        alert(error.message || "Error saving changes. Please try again.");
      }
    };

    // Remove any existing click handlers
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    // Add the edit handler
    newSaveBtn.addEventListener("click", saveHandler);
  }

  showMoveToGroupModal(site, currentGroup) {
    // Create move to group modal if it doesn't exist
    let modal = document.getElementById("moveToGroupModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "moveToGroupModal";
      modal.className = "modal";
      modal.innerHTML = `
        <div class="modal-content">
          <h2>Move to Group</h2>
          <div class="group-list"></div>
          <div class="modal-buttons">
            <button id="cancelMoveBtn">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const groupList = modal.querySelector(".group-list");
    groupList.innerHTML = "";

    // Create buttons for each group except current
    this.groups.forEach((group) => {
      if (group.id !== currentGroup.id) {
        const button = document.createElement("button");
        button.className = "group-option";
        button.textContent = group.name;
        button.addEventListener("click", async () => {
          // Move site to selected group
          currentGroup.sites = currentGroup.sites.filter(
            (s) => s.id !== site.id
          );
          group.sites.push(site);

          await this.saveToStorage();
          this.renderSites();
          modal.style.display = "none";
        });
        groupList.appendChild(button);
      }
    });

    // Show modal
    modal.style.display = "block";

    // Handle cancel
    document.getElementById("cancelMoveBtn").onclick = () => {
      modal.style.display = "none";
    };
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.speedDial = new SpeedDial();
});
