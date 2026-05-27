importScripts("shared.js");

const { DEFAULT_REPO, uniqueRepos, normalizeRule, defaultRule } = GHC;

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(["rules", "autoConfig"]);
  const hasAutoConfig = Boolean(existing.autoConfig);
  const hasRules = Array.isArray(existing.rules);
  const updates = {};

  updates.autoConfig = {
    allowAllRepos: Boolean(existing.autoConfig?.allowAllRepos),
    repos: hasAutoConfig ? uniqueRepos(existing.autoConfig?.repos || []) : [DEFAULT_REPO]
  };

  updates.rules = hasRules
    ? existing.rules.map(normalizeRule).filter(Boolean)
    : [defaultRule()];

  await chrome.storage.sync.set(updates);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "confirm_allowed_github_action") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "CONFIRM_ALLOWED_GITHUB_ACTION" });
  } catch (error) {
    const message = String(error?.message || error);
    if (!message.includes("Receiving end does not exist")) {
      console.warn("ChatGPT GitHub Confirmer command failed:", error);
    }
  }
});
