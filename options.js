const tbody = document.getElementById("rules");
const statusNode = document.getElementById("status");

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
    .replaceAll('"', "&quot;");
}

async function load() {
  const { rules = [] } = await chrome.storage.sync.get("rules");
  tbody.replaceChildren(...rules.map(rowTemplate));
}

function collectRules() {
  return Array.from(tbody.querySelectorAll("tr"))
    .map((tr) => ({
      enabled: tr.querySelector(".enabled").checked,
      repo: tr.querySelector(".repo").value.trim(),
      branch: tr.querySelector(".branch").value.trim(),
      file: tr.querySelector(".file").value.trim()
    }))
    .filter((rule) => rule.repo || rule.branch || rule.file);
}

document.getElementById("add").addEventListener("click", () => {
  tbody.appendChild(rowTemplate({
    enabled: true,
    repo: "icenturyw/video2subtitles-desktop",
    branch: "",
    file: "*"
  }));
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({ rules: collectRules() });
  statusNode.textContent = "Saved";
  setTimeout(() => {
    statusNode.textContent = "";
  }, 1800);
});

document.getElementById("clear-trust").addEventListener("click", async () => {
  await chrome.storage.local.set({ trustedRules: {} });
  statusNode.textContent = "Remembered approvals cleared";
  setTimeout(() => {
    statusNode.textContent = "";
  }, 1800);
});

load();
