const { DEFAULT_REPO, normalizeRepo, isValidRepo, uniqueRepos } = GHC;

const allowAllNode = document.getElementById("allow-all");
const repoInput = document.getElementById("repo-input");
const repoListNode = document.getElementById("repo-list");
const statusNode = document.getElementById("status");

let repos = [];
let originalAllowAllRepos = false;
let statusTimer = null;

async function getConfig() {
  const { autoConfig } = await chrome.storage.sync.get("autoConfig");
  const hasStoredRepos = Array.isArray(autoConfig?.repos);
  return {
    allowAllRepos: Boolean(autoConfig?.allowAllRepos),
    repos: uniqueRepos(hasStoredRepos ? autoConfig.repos : [DEFAULT_REPO])
  };
}

function renderRepos() {
  repoListNode.replaceChildren(...repos.map((repo) => {
    const li = document.createElement("li");
    li.innerHTML = `<code>${escapeHtml(repo)}</code><button type="button" class="danger-button">Remove</button>`;
    li.querySelector("button").addEventListener("click", () => {
      repos = repos.filter((candidate) => candidate !== repo);
      renderRepos();
    });
    return li;
  }));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showStatus(message) {
  statusNode.textContent = message;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusNode.textContent = "";
  }, 1800);
}

function confirmAllowAllIfNeeded() {
  if (!allowAllNode.checked || originalAllowAllRepos) return true;
  return window.confirm("Auto-allow all repositories will automatically approve every detected ChatGPT GitHub confirmation. Continue?");
}

async function save() {
  if (!confirmAllowAllIfNeeded()) {
    allowAllNode.checked = originalAllowAllRepos;
    showStatus("Auto-allow all was not enabled");
    return;
  }

  repos = uniqueRepos(repos);
  await chrome.storage.sync.set({
    autoConfig: {
      allowAllRepos: allowAllNode.checked,
      repos
    }
  });
  originalAllowAllRepos = allowAllNode.checked;
  renderRepos();
  showStatus("Saved");
}

document.getElementById("add-repo").addEventListener("click", () => {
  const repo = normalizeRepo(repoInput.value);
  if (!isValidRepo(repo)) {
    showStatus("Use owner/repository format");
    return;
  }
  repos = uniqueRepos([...repos, repo]);
  repoInput.value = "";
  renderRepos();
});

repoInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    document.getElementById("add-repo").click();
  }
});

document.getElementById("save").addEventListener("click", save);

document.getElementById("clear-trust").addEventListener("click", async () => {
  if (!window.confirm("Clear all remembered approvals? This cannot be undone.")) return;
  await chrome.storage.local.set({ trustedRules: {} });
  showStatus("Remembered approvals cleared");
});

getConfig().then((config) => {
  allowAllNode.checked = config.allowAllRepos;
  originalAllowAllRepos = config.allowAllRepos;
  repos = config.repos;
  renderRepos();
});
