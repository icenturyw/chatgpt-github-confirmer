const DEFAULT_REPO = "icenturyw/chatgpt-github-confirmer";
const REPO_PATTERN = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;

const tbody = document.getElementById("rules");
const statusNode = document.getElementById("status");
let statusTimer = null;

function rowTemplate(rule = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="enabled" type="checkbox" ${rule.enabled === false ? "" : "checked"}></td>
    <td><input class="repo" type="text" placeholder="owner/repo" value="${escapeAttr(rule.repo || "")}"></td>
    <td><input class="branch" type="text" placeholder="blank or * = any" value="${escapeAttr(rule.branch || "")}"></td>
    <td><input class="file" type="text" placeholder="* = any file" value="${escapeAttr(rule.file || "")}"></td>
    <td><button class="danger remove" type="button">Remove</button></td>
  `;
  tr.querySelector(".remove").addEventListener("click", () => tr.remove());
  return tr;
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeRepo(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function showStatus(message) {
  statusNode.textContent = message;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusNode.textContent = "";
  }, 1800);
}

function defaultRule() {
  return {
    enabled: true,
    repo: DEFAULT_REPO,
    branch: "",
    file: "*"
  };
}

function normalizeRule(rule) {
  const repo = normalizeRepo(rule?.repo);
  if (!repo || !REPO_PATTERN.test(repo)) return null;

  return {
    enabled: rule.enabled !== false,
    repo,
    branch: String(rule.branch || "").trim(),
    file: String(rule.file || "*").trim() || "*"
  };
}

async function load() {
  const { rules } = await chrome.storage.sync.get("rules");
  const normalizedRules = Array.isArray(rules)
    ? rules.map(normalizeRule).filter(Boolean)
    : [defaultRule()];
  tbody.replaceChildren(...normalizedRules.map(rowTemplate));
}

function collectRules() {
  const rows = Array.from(tbody.querySelectorAll("tr"));
  const rules = rows
    .map((tr) => normalizeRule({
      enabled: tr.querySelector(".enabled").checked,
      repo: tr.querySelector(".repo").value,
      branch: tr.querySelector(".branch").value,
      file: tr.querySelector(".file").value
    }))
    .filter(Boolean);

  return {
    rules,
    skipped: rows.length - rules.length
  };
}

document.getElementById("add").addEventListener("click", () => {
  tbody.appendChild(rowTemplate(defaultRule()));
});

document.getElementById("save").addEventListener("click", async () => {
  const { rules, skipped } = collectRules();
  await chrome.storage.sync.set({ rules });
  tbody.replaceChildren(...rules.map(rowTemplate));
  showStatus(skipped ? `Saved, skipped ${skipped} invalid rule${skipped > 1 ? "s" : ""}` : "Saved");
});

document.getElementById("clear-trust").addEventListener("click", async () => {
  await chrome.storage.local.set({ trustedRules: {} });
  showStatus("Remembered approvals cleared");
});

load();
