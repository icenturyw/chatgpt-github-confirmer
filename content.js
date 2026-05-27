(function () {
const BAR_ID = "chatgpt-github-confirmer-bar";
const HIGHLIGHT_ATTR = "data-chatgpt-github-confirmer";
  const CONFIRM_LABELS = ["\u786e\u8ba4", "Confirm", "Update", "Save", "Continue", "Allow"];
  const DENY_LABELS = ["\u62d2\u7edd", "Cancel", "Deny"];
  const DETAILS_LABELS = ["\u8be6\u7ec6\u4fe1\u606f", "Details", "Show details"];

  let lastMatch = null;
  let observer = null;
  let stopped = false;
  const clickedDialogs = new WeakSet();
  const pendingClicks = new WeakSet();

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function includesFolded(haystack, needle) {
    return normalizeText(haystack).toLowerCase().includes(normalizeText(needle).toLowerCase());
  }

  function isExtensionContextError(error) {
    return String(error?.message || error).includes("Extension context invalidated");
  }

  function stopIfContextInvalidated(error) {
    if (!isExtensionContextError(error)) throw error;
    stopped = true;
    observer?.disconnect();
    removeBar();
  }

  async function storageGet(area, keys, fallback) {
    if (stopped) return fallback;
    try {
      return await chrome.storage[area].get(keys);
    } catch (error) {
      stopIfContextInvalidated(error);
      return fallback;
    }
  }

  async function storageSet(area, value) {
    if (stopped) return;
    try {
      await chrome.storage[area].set(value);
    } catch (error) {
      stopIfContextInvalidated(error);
    }
  }

  async function getRules() {
    const { rules = [], autoConfig } = await storageGet("sync", ["rules", "autoConfig"], { rules: [], autoConfig: null });
    const configRules = getAutoConfigRules(autoConfig);
    return [
      ...configRules,
      ...rules.filter((rule) => rule && rule.enabled !== false)
    ];
  }

  async function ensureRepoWideRule() {
    const { rules = [], autoConfig } = await storageGet("sync", ["rules", "autoConfig"], { rules: [], autoConfig: null });
    const normalizedConfigRepos = normalizeRepoList(autoConfig?.repos || []);
    const hasDefaultConfigRepo = normalizedConfigRepos.includes("icenturyw/video2subtitles-desktop");
    if (!hasDefaultConfigRepo) {
      await storageSet("sync", {
        autoConfig: {
          allowAllRepos: Boolean(autoConfig?.allowAllRepos),
          repos: [...normalizedConfigRepos, "icenturyw/video2subtitles-desktop"]
        }
      });
    }

    const hasRepoWideRule = rules.some((rule) =>
      rule?.repo === "icenturyw/video2subtitles-desktop"
      && isWildcard(rule.branch)
      && isWildcard(rule.file)
    );

    if (hasRepoWideRule) return;

    await storageSet("sync", {
      rules: [
        ...rules,
        {
          enabled: true,
          repo: "icenturyw/video2subtitles-desktop",
          branch: "",
          file: "*"
        }
      ]
    });
  }

  function normalizeRepo(value) {
    return normalizeText(value)
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/^github\.com\//i, "")
      .replace(/\/+$/g, "")
      .toLowerCase();
  }

  function normalizeRepoList(values) {
    return Array.from(new Set((values || [])
      .map(normalizeRepo)
      .filter((repo) => /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repo))));
  }

  function getAutoConfigRules(autoConfig) {
    const rules = normalizeRepoList(autoConfig?.repos || []).map((repo) => ({
      enabled: true,
      repo,
      branch: "",
      file: "*",
      autoConfigured: true
    }));

    if (autoConfig?.allowAllRepos) {
      rules.unshift({
        enabled: true,
        repo: "*",
        branch: "",
        file: "*",
        autoConfigured: true,
        allowAllRepos: true
      });
    }

    return rules;
  }

  async function getTrustedRules() {
    const { trustedRules = {} } = await storageGet("local", "trustedRules", { trustedRules: {} });
    return migrateTrustedRules(trustedRules || {});
  }

  async function trustRule(rule) {
    const trustedRules = await getTrustedRules();
    const trustedRule = {
      repo: rule.repo || "",
      branch: "",
      file: "*",
      trustedAt: Date.now()
    };
    trustedRules[ruleKey(rule)] = trustedRule;
    trustedRules[repoKey(rule.repo)] = trustedRule;
    await storageSet("local", { trustedRules });
  }

  async function untrustRule(rule) {
    const trustedRules = await getTrustedRules();
    delete trustedRules[ruleKey(rule)];
    delete trustedRules[repoKey(rule.repo)];
    await storageSet("local", { trustedRules });
  }

  function ruleKey(rule) {
    return [rule.repo || "", rule.branch || "", rule.file || ""]
      .map((part) => normalizeText(part).toLowerCase())
      .join("|");
  }

  function repoKey(repo) {
    return `${normalizeText(repo).toLowerCase()}||*`;
  }

  function trustedMatchesRule(trustedRule, rule) {
    if (!trustedRule?.repo || normalizeText(trustedRule.repo).toLowerCase() !== normalizeText(rule.repo).toLowerCase()) {
      return false;
    }

    const trustedBranchCovers = isWildcard(rule.branch)
      || isWildcard(trustedRule.branch)
      || normalizeText(trustedRule.branch).toLowerCase() === normalizeText(rule.branch).toLowerCase();
    const trustedFileCovers = isWildcard(rule.file)
      || isWildcard(trustedRule.file)
      || normalizeText(trustedRule.file).toLowerCase() === normalizeText(rule.file).toLowerCase();
    return trustedBranchCovers && trustedFileCovers;
  }

  function isTrustedRule(rule, trustedRules) {
    return Boolean(trustedRules[ruleKey(rule)])
      || Boolean(trustedRules[repoKey(rule.repo)])
      || Object.values(trustedRules).some((trustedRule) => trustedMatchesRule(trustedRule, rule));
  }

  function migrateTrustedRules(trustedRules) {
    let changed = false;

    for (const trustedRule of Object.values(trustedRules)) {
      if (!trustedRule?.repo) continue;

      const key = repoKey(trustedRule.repo);
      if (trustedRules[key]) continue;

      trustedRules[key] = {
        repo: trustedRule.repo,
        branch: "",
        file: "*",
        trustedAt: trustedRule.trustedAt || Date.now()
      };
      changed = true;
    }

    if (changed) {
      storageSet("local", { trustedRules });
    }

    return trustedRules;
  }

  function isWildcard(value) {
    const normalized = normalizeText(value);
    return !normalized || normalized === "*";
  }

  function getDialogCandidates() {
    const selectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[data-radix-dialog-content]',
      "div.fixed",
      "[data-testid]",
      "body > div"
    ];
    const seen = new Set();
    const candidates = [
      ...Array.from(document.querySelectorAll(selectors.join(","))),
      ...getButtonDerivedDialogCandidates()
    ];

    return candidates
      .filter((node) => {
        if (seen.has(node)) return false;
        seen.add(node);
        if (!isVisibleElement(node)) return false;
        const text = normalizeText(node.innerText);
        return looksLikeGithubConfirmationText(text);
      })
      .sort((a, b) => scoreDialogCandidate(b) - scoreDialogCandidate(a));
  }

  function getButtonDerivedDialogCandidates() {
    const candidates = [];
    for (const button of getButtons(document)) {
      const text = buttonText(button);
      const isConfirmOrDeny = CONFIRM_LABELS.some((label) => text === label || includesFolded(text, label))
        || DENY_LABELS.some((label) => text === label || includesFolded(text, label));
      if (!isConfirmOrDeny) continue;

      let node = button.parentElement;
      let depth = 0;
      while (node && node !== document.body && depth < 8) {
        const nodeText = normalizeText(node.innerText);
        if (looksLikeGithubConfirmationText(nodeText) && findConfirmButton(node)) {
          candidates.push(node);
          break;
        }
        node = node.parentElement;
        depth += 1;
      }
    }
    return candidates;
  }

  function looksLikeGithubConfirmationText(text) {
    return text.length > 20
      && includesFolded(text, "GitHub")
      && (
        includesFolded(text, "Update GitHub file")
        || includesFolded(text, "Create")
        || includesFolded(text, "repository")
        || includesFolded(text, "\u5171\u4eab\u6570\u636e\u5305\u62ec")
        || includesFolded(text, "\u4f7f\u7528\u5de5\u5177\u5b58\u5728\u98ce\u9669")
        || includesFolded(text, "AccessTokens")
        || includesFolded(text, "APIKeys")
      );
  }

  function buttonText(button) {
    return normalizeText(button.innerText || button.textContent || button.getAttribute("aria-label"));
  }

  function isVisibleButton(button) {
    if (!button) return false;
    return isVisibleElement(button);
  }

  function isVisibleElement(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.display !== "none"
      && style.visibility !== "hidden"
      && style.pointerEvents !== "none";
  }

  function scoreDialogCandidate(node) {
    const text = normalizeText(node.innerText);
    let score = 0;
    if (node.getAttribute("role") === "dialog") score += 100;
    if (node.getAttribute("aria-modal") === "true") score += 80;
    if (node.matches?.("[data-radix-dialog-content]")) score += 80;
    if (includesFolded(text, "repository")) score += 30;
    if (includesFolded(text, "\u786e\u8ba4") || includesFolded(text, "Confirm")) score += 20;
    const rect = node.getBoundingClientRect();
    score += Math.max(0, 1000 - Math.round(rect.width * rect.height / 10000));
    return score;
  }

  function isClickableButton(button) {
    return isVisibleButton(button)
      && !button.disabled
      && button.getAttribute("aria-disabled") !== "true"
      && button.getAttribute("data-disabled") !== "true";
  }

  function getButtons(container) {
    return Array.from(container.querySelectorAll('button, [role="button"]'))
      .filter(isVisibleButton);
  }

  function findButton(container, labels) {
    const buttons = getButtons(container);
    return buttons.find((button) => labels.some((label) => buttonText(button) === label))
      || buttons.find((button) => labels.some((label) => includesFolded(buttonText(button), label)));
  }

  function findConfirmButton(container) {
    const explicit = findButton(container, CONFIRM_LABELS);
    if (explicit) return explicit;

    const buttons = getButtons(container);
    const nonDenyButtons = buttons.filter((button) => {
      const text = buttonText(button);
      return !DENY_LABELS.some((label) => text === label || includesFolded(text, label));
    });

    return nonDenyButtons.at(-1) || null;
  }

  function findDetailsButton(container) {
    return findButton(container, DETAILS_LABELS);
  }

  function activateElement(element) {
    const rect = element.getBoundingClientRect();
    const clientX = Math.round(rect.left + rect.width / 2);
    const clientY = Math.round(rect.top + rect.height / 2);
    element.scrollIntoView({ block: "center", inline: "center" });
    element.focus();

    const common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY
    };

    if (window.PointerEvent) {
      element.dispatchEvent(new PointerEvent("pointerdown", { ...common, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    }
    element.dispatchEvent(new MouseEvent("mousedown", common));
    element.dispatchEvent(new MouseEvent("mouseup", common));
    if (window.PointerEvent) {
      element.dispatchEvent(new PointerEvent("pointerup", { ...common, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    }
    element.dispatchEvent(new MouseEvent("click", common));
    element.click();
  }

  function ruleMatches(text, rule) {
    if (rule?.allowAllRepos) {
      return Boolean(extractRepository(text));
    }
    if (!rule?.repo || !includesFolded(text, rule.repo)) return false;
    if (!isWildcard(rule.branch) && !includesFolded(text, rule.branch)) return false;
    if (!isWildcard(rule.file) && !includesFolded(text, rule.file)) return false;
    return true;
  }

  function extractRepository(text) {
    const normalized = normalizeText(text);
    const patterns = [
      /repository\s+['"]?([a-z0-9_.-]+\/[a-z0-9_.-]+)/i,
      /repo\s+['"]?([a-z0-9_.-]+\/[a-z0-9_.-]+)/i,
      /github\.com\/([a-z0-9_.-]+\/[a-z0-9_.-]+)/i,
      /\b([a-z0-9_.-]+\/[a-z0-9_.-]+)\b/i
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match?.[1]) return normalizeRepo(match[1]);
    }

    return "";
  }

  function styleDialog(dialog, matched) {
    document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).forEach((node) => {
      node.style.outline = "";
      node.removeAttribute(HIGHLIGHT_ATTR);
    });

    if (!matched) return;
    dialog.setAttribute(HIGHLIGHT_ATTR, "matched");
    dialog.style.outline = "3px solid #16a34a";
    dialog.style.outlineOffset = "3px";
  }

  function removeBar() {
    document.getElementById(BAR_ID)?.remove();
  }

  function renderBar(match) {
    removeBar();
    if (!match) return;

    const trusted = Boolean(match.trusted);
    const managedByPanel = Boolean(match.rule.autoConfigured);
    const bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.innerHTML = `
      <div class="gch-title">${trusted ? "Auto-confirm is ON" : "GitHub write matched allowlist"}</div>
      <div class="gch-meta">${escapeHtml(match.repo || match.rule.repo)} / ${escapeHtml(match.rule.branch || "any branch")} / ${escapeHtml(match.rule.file || "any file")}</div>
      <button type="button" class="gch-confirm">${managedByPanel ? "Configured in extension panel" : trusted ? "Stop auto-confirm for this rule" : "Confirm and remember this rule"}</button>
      <button type="button" class="gch-close" aria-label="Close">x</button>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #${BAR_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: min(380px, calc(100vw - 36px));
        padding: 14px;
        border: 1px solid rgba(22, 163, 74, 0.42);
        border-radius: 8px;
        background: #0f172a;
        color: #f8fafc;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.32);
        font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${BAR_ID} .gch-title {
        margin: 0 28px 4px 0;
        font-weight: 700;
      }
      #${BAR_ID} .gch-meta {
        margin-bottom: 12px;
        color: #cbd5e1;
        word-break: break-word;
      }
      #${BAR_ID} .gch-confirm {
        width: 100%;
        border: 0;
        border-radius: 6px;
        padding: 10px 12px;
        background: ${trusted ? "#dc2626" : "#16a34a"};
        color: white;
        cursor: pointer;
        font-weight: 700;
      }
      #${BAR_ID} .gch-confirm:hover {
        filter: brightness(0.92);
      }
      #${BAR_ID} .gch-close {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 26px;
        height: 26px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #cbd5e1;
        cursor: pointer;
        font-size: 18px;
        line-height: 18px;
      }
      #${BAR_ID} .gch-close:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    `;

    bar.appendChild(style);
    bar.querySelector(".gch-confirm").addEventListener("click", async () => {
      if (managedByPanel) {
        removeBar();
        return;
      }
      if (trusted) {
        await untrustRule(match.rule);
        removeBar();
      } else {
        confirmMatch({ remember: true });
      }
    });
    bar.querySelector(".gch-close").addEventListener("click", () => removeBar());
    document.documentElement.appendChild(bar);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function scan() {
    if (stopped) return;
    const rules = await getRules();
    const trustedRules = await getTrustedRules();
    let match = null;

    for (const dialog of getDialogCandidates()) {
      const text = normalizeText(dialog.innerText);
      if (!includesFolded(text, "GitHub")) continue;

      const rule = rules.find((candidate) => ruleMatches(text, candidate));
      if (!rule) continue;
      const repo = rule.allowAllRepos ? extractRepository(text) : normalizeRepo(rule.repo);

      const confirmButton = findConfirmButton(dialog);
      if (!confirmButton) continue;

      if (buttonText(confirmButton) === "x") continue;

      if (rule) {
        match = {
          dialog,
          confirmButton,
          repo,
          rule,
          trusted: rule.autoConfigured || isTrustedRule(rule, trustedRules)
        };
        break;
      }
    }

    lastMatch = match;
    styleDialog(match?.dialog, Boolean(match));
    renderBar(match);

    if (match?.trusted && !clickedDialogs.has(match.dialog) && !pendingClicks.has(match.dialog)) {
      waitAndClickConfirm(match);
    }
  }

  async function confirmMatch(options = {}) {
    if (!lastMatch?.dialog?.isConnected) {
      scan();
      return;
    }

    if (options.remember) {
      await trustRule(lastMatch.rule);
    }

    waitAndClickConfirm(lastMatch);
  }

  function waitAndClickConfirm(match) {
    if (!match?.dialog?.isConnected || pendingClicks.has(match.dialog)) return;

    pendingClicks.add(match.dialog);
    const startedAt = Date.now();
    const timeoutMs = 12000;
    let detailsClicked = false;

    const tryClick = () => {
      if (!match.dialog.isConnected || clickedDialogs.has(match.dialog)) {
        pendingClicks.delete(match.dialog);
        return;
      }

      const latestButton = findConfirmButton(match.dialog);
      if (latestButton && buttonText(latestButton) !== "x" && isClickableButton(latestButton)) {
        clickedDialogs.add(match.dialog);
        pendingClicks.delete(match.dialog);
        activateElement(latestButton);
        removeBar();
        return;
      }

      if (!detailsClicked && Date.now() - startedAt > 600) {
        const detailsButton = findDetailsButton(match.dialog);
        if (detailsButton && isClickableButton(detailsButton)) {
          detailsClicked = true;
          activateElement(detailsButton);
        }
      }

      if (Date.now() - startedAt >= timeoutMs) {
        pendingClicks.delete(match.dialog);
        renderBar({
          ...match,
          trusted: false
        });
        return;
      }

      setTimeout(tryClick, 300);
    };

    setTimeout(tryClick, 150);
  }

  function runScan() {
    scan().catch(stopIfContextInvalidated);
  }

  observer = new MutationObserver(() => {
    clearTimeout(observer._timer);
    observer._timer = setTimeout(runScan, 250);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "CONFIRM_ALLOWED_GITHUB_ACTION") confirmMatch({ remember: true });
  });

  ensureRepoWideRule().then(runScan).catch(stopIfContextInvalidated);
})();
