const DEFAULT_REPO = "icenturyw/video2subtitles-desktop";

const allowAllNode = document.getElementById("allow-all");
const repoInput = document.getElementById("repo-input");
const repoListNode = document.getElementById("repo-list");
const statusNode = document.getElementById("status");

let repos = [];

function normalizeRepo(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function isValidRepo(value) {
  return /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(value);
}

function uniqueRepos(values) {
  return Array.from(new Set(values.map(normalizeRepo).filter(isValidRepo))).sort();
}

async function getConfig() {
  const { autoConfig } = await chrome.storage.sync.get("autoConfig");
  return {
    allowAllRepos: Boolean(autoConfig?.allowAllRepos),
    repos: uniqueRepos(autoConfig?.repos?.length ? autoConfig.repos : [DEFAULT_REPO])
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
    .replaceAll('"', "&quot;");
}

function showStatus(message) {
  statusNode.textContent = message;
  setTimeout(() => {
    statusNode.textContent = "";
  }, 1800);
}

async function save() {
  await chrome.storage.sync.set({
    autoConfig: {
      allowAllRepos: allowAllNode.checked,
      repos: uniqueRepos(repos)
    }
  });
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
  await chrome.storage.local.set({ trustedRules: {} });
  showStatus("Remembered approvals cleared");
});

getConfig().then((config) => {
  allowAllNode.checked = config.allowAllRepos;
  repos = config.repos;
  renderRepos();
});
