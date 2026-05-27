chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(["rules", "autoConfig"]);
  const repos = Array.from(new Set([
    ...((existing.autoConfig?.repos || []).map((repo) => String(repo).trim().toLowerCase()).filter(Boolean)),
    "icenturyw/video2subtitles-desktop"
  ]));

  await chrome.storage.sync.set({
    autoConfig: {
      allowAllRepos: Boolean(existing.autoConfig?.allowAllRepos),
      repos
    }
  });

  if (existing.rules) {
    const hasRepoWideRule = existing.rules.some((rule) =>
      rule?.repo === "icenturyw/video2subtitles-desktop"
      && !rule?.branch
      && (rule?.file === "*" || !rule?.file)
    );

    if (!hasRepoWideRule) {
      await chrome.storage.sync.set({
        rules: [
          ...existing.rules,
          {
            enabled: true,
            repo: "icenturyw/video2subtitles-desktop",
            branch: "",
            file: "*"
          }
        ]
      });
    }
    return;
  }

  await chrome.storage.sync.set({
    rules: [
      {
        enabled: true,
        repo: "icenturyw/video2subtitles-desktop",
        branch: "",
        file: "*"
      }
    ]
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "confirm_allowed_github_action") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "CONFIRM_ALLOWED_GITHUB_ACTION" });
});
