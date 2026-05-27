(() => {
  const {
    DEFAULT_REPO,
    normalizeText,
    normalizeRepo,
    isValidRepo,
    uniqueRepos: normalizeRepoList,
    normalizeRule: normalizeStoredRule,
    defaultRule
  } = GHC;

  const BAR_ID = "chatgpt-github-confirmer-bar";
  const HIGHLIGHT_ATTR = "data-chatgpt-github-confirmer";
  const CONFIRM_LABELS = ["确认", "Confirm", "Update", "Save", "Continue", "Allow"];
  const DENY_LABELS = ["拒绝", "Cancel", "Deny"];
  const DETAILS_LABELS = ["详细信息", "Details", "Show details"];

  let lastMatch = null;
  let observer = null;
  let stopped = false;
  let scanTimer = null;
  const clickedDialogs = new WeakSet();
  const pendingClicks = new WeakSet();

  function includesFolded(haystack, needle) {
    return normalizeText(haystack).toLowerCase().includes(normalizeText(needle).toLowerCase());
  }

  function isWildcard(value) {
    const normalized = normalizeText(value);
    return !normalized || normalized === "*";
  }

  function normalizeRule(rule) {
    if (rule?.allowAllRepos || normalizeText(rule?.repo) === "*") {
      return {
        enabled: rule.enabled !== false,
        repo: "*",
        branch: "",
        file: "*",
        autoConfigured: Boolean(rule.autoConfigured),
        allowAllRepos: true
      };
    }

    const normalizedRule = normalizeStoredRule(rule);
    if (!normalizedRule) return null;

    return {
      ...normalizedRule,
      autoConfigured: Boolean(rule.autoConfigured),
      allowAllRepos: Boolean(rule.allowAllRepos)
    };
  }

  function isExtensionContextError(error) {
    return String(error?.message || error).includes("Extension context invalidated");
  }

  function stopIfContextInvalidated(error) {
    if (!isExtensionContextError(error)) throw error;
    stopped = true;
    observer?.disconnect();
    if (scanTimer) clearTimeout(scanTimer);
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

  async function ensureInitialStorage() {
    const { rules, autoConfig } = await storageGet("sync", ["rules", "autoConfig"], {});
    const updates = {};

    if (!autoConfig) {
      updates.autoConfig = {
        allowAllRepos: false,
        repos: [DEFAULT_REPO]
      };
    }

    if (!Array.isArray(rules)) {
      updates.rules = [defaultRule()];
    }

    if (Object.keys(updates).length) {
      await storageSet("sync", updates);
    }
  }

  async function getRules() {
    const { rules = [], autoConfig } = await storageGet("sync", ["rules", "autoConfig"], { rules: [], autoConfig: null });
    const configRules = getAutoConfigRules(autoConfig);
    const storedRules = Array.isArray(rules)
      ? rules.map(normalizeRule).filter((rule) => rule && rule.enabled !== false)
      : [];

    return [
      ...configRules,
      ...storedRules
    ];
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
    const normalizedRule = normalizeRule(rule);
    if (!normalizedRule || normalizedRule.repo === "*") return;

    const trustedRules = await getTrustedRules();
    const trustedRule = {
      repo: normalizedRule.repo,
      branch: normalizedRule.branch,
      file: normalizedRule.file,
      trustedAt: Date.now()
    };
    trustedRules[ruleKey(trustedRule)] = trustedRule;
    if (isWildcard(trustedRule.branch) && isWildcard(trustedRule.file)) {
      trustedRules[repoKey(trustedRule.repo)] = trustedRule;
    }
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
    return `${normalizeRepo(repo)}||*`;
  }

  function trustedMatchesRule(trustedRule, rule) {
    const normalizedRule = normalizeRule(rule);
    if (!normalizedRule || !trustedRule?.repo || normalizeRepo(trustedRule.repo) !== normalizedRule.repo) {
      return false;
    }

    const trustedBranchCovers = isWildcard(trustedRule.branch)
      || normalizeText(trustedRule.branch).toLowerCase() === normalizeText(normalizedRule.branch).toLowerCase();
    const trustedFileCovers = isWildcard(trustedRule.file)
      || normalizeText(trustedRule.file).toLowerCase() === normalizeText(normalizedRule.file).toLowerCase();
    return trustedBranchCovers && trustedFileCovers;
  }

  function isTrustedRule(rule, trustedRules) {
    const normalizedRule = normalizeRule(rule);
    if (!normalizedRule) return false;
    return Boolean(trustedRules[ruleKey(normalizedRule)])
      || Boolean(trustedRules[repoKey(normalizedRule.repo)])
      || Object.values(trustedRules).some((trustedRule) => trustedMatchesRule(trustedRule, normalizedRule));
  }

  function migrateTrustedRules(trustedRules) {
    const migrated = {};

    for (const trustedRule of Object.values(trustedRules)) {
      const normalizedRepo = normalizeRepo(trustedRule?.repo);
      if (!isValidRepo(normalizedRepo)) continue;

      const cleanRule = {
        repo: normalizedRepo,
        branch: normalizeText(trustedRule.branch),
        file: normalizeText(trustedRule.file) || "*",
        trustedAt: trustedRule.trustedAt || Date.now()
      };
      migrated[ruleKey(cleanRule)] = cleanRule;
      if (isWildcard(cleanRule.branch) && isWildcard(cleanRule.file)) {
        migrated[repoKey(cleanRule.repo)] = cleanRule;
      }
    }

    if (Object.keys(migrated).length !== Object.keys(trustedRules).length) {
      storageSet("local", { trustedRules: migrated });
    }

    return migrated;
  }

  function getDialogCandidates() {
    const selectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[data-radix-dialog-content]',
      "div.fixed"
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
        if (!isLikelyDialogCandidate(node)) return false;
        const text = normalizeText(node.innerText);
        return looksLikeGithubConfirmationText(text) && findConfirmButton(node);
      })
      .sort((a, b) => scoreDialogCandidate(b) - scoreDialogCandidate(a));
  }

  function getButtonDerivedDialogCandidates() {
    const candidates = [];
    for (const button of getButtons(document)) {
      if (isInsideSidebar(button)) continue;

      const text = buttonText(button);
      const isConfirmOrDeny = CONFIRM_LABELS.some((label) => text === label || includesFolded(text, label))
        || DENY_LABELS.some((label) => text === label || includesFolded(text, label));
      if (!isConfirmOrDeny) continue;

      let node = button.parentElement;
      let depth = 0;
      while (node && node !== document.body && depth < 8) {
        const nodeText = normalizeText(node.innerText);
        if (isLikelyDialogCandidate(node) && looksLikeGithubConfirmationText(nodeText) && findConfirmButton(node, { allowFallback: false })) {
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
        || includesFolded(text, "共享数据包括")
        || includesFolded(text, "使用工具存在风险")
        || includesFolded(text, "AccessTokens")
        || includesFolded(text, "APIKeys")
      );
  }

  function buttonText(button) {
    return normalizeText(button?.innerText || button?.textContent || button?.getAttribute("aria-label"));
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

  function isExplicitDialogElement(element) {
    return Boolean(element?.matches?.('[role="dialog"], [aria-modal="true"], [data-radix-dialog-content]'));
  }

  function isInsideSidebar(element) {
    return Boolean(element?.closest?.('nav, aside, [role="navigation"], [data-testid*="sidebar" i]'));
  }

  function isSidebarShapedElement(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return false;

    const isLeftRail = rect.left <= 4
      && rect.width <= Math.min(460, viewportWidth * 0.42)
      && rect.height >= viewportHeight * 0.65;
    const isRightRail = rect.right >= viewportWidth - 4
      && rect.width <= Math.min(460, viewportWidth * 0.42)
      && rect.height >= viewportHeight * 0.65;

    return isLeftRail || isRightRail;
  }

  function isLikelyDialogCandidate(element) {
    if (!isVisibleElement(element)) return false;
    if (element === document.body || element === document.documentElement) return false;
    if (element.closest?.(`#${BAR_ID}`)) return false;
    if (isInsideSidebar(element) || isSidebarShapedElement(element)) return false;

    if (isExplicitDialogElement(element)) return true;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return false;

    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    const coversViewportCenter = rect.left <= centerX
      && rect.right >= centerX
      && rect.top <= centerY
      && rect.bottom >= centerY;
    const hasDialogSize = rect.width >= 280
      && rect.height >= 120
      && rect.width <= viewportWidth * 0.95
      && rect.height <= viewportHeight * 0.95;
    const isAppShell = rect.width >= viewportWidth * 0.95 && rect.height >= viewportHeight * 0.95;

    return style.position === "fixed"
      && coversViewportCenter
      && hasDialogSize
      && !isAppShell;
  }

  function scoreDialogCandidate(node) {
    const text = normalizeText(node.innerText);
    let score = 0;
    if (node.getAttribute("role") === "dialog") score += 100;
    if (node.getAttribute("aria-modal") === "true") score += 80;
    if (node.matches?.("[data-radix-dialog-content]")) score += 80;
    if (includesFolded(text, "repository")) score += 30;
    if (includesFolded(text, "确认") || includesFolded(text, "Confirm")) score += 20;
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

  function findConfirmButton(container, options = {}) {
    const { allowFallback = true } = options;
    const explicit = findButton(container, CONFIRM_LABELS);
    if (explicit) return explicit;
    if (!allowFallback) return null;

    const buttons = getButtons(container);
    const hasDialogActionEvidence = buttons.length <= 6
      && (Boolean(findButton(container, DENY_LABELS)) || Boolean(findButton(container, DETAILS_LABELS)));
    if (!hasDialogActionEvidence) return null;

    const nonDenyButtons = buttons.filter((button) => {
      const text = buttonText(button);
      return !DENY_LABELS.some((label) => text === label || includesFolded(text, label))
        && !DETAILS_LABELS.some((label) => text === label || includesFolded(text, label));
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
    const normalizedRule = normalizeRule(rule);
    if (!normalizedRule) return false;
    if (normalizedRule.allowAllRepos) {
      return Boolean(extractRepository(text));
    }
    if (!includesFolded(text, normalizedRule.repo)) return false;
    if (!isWildcard(normalizedRule.branch) && !includesFolded(text, normalizedRule.branch)) return false;
    if (!isWildcard(normalizedRule.file) && !includesFolded(text, normalizedRule.file)) return false;
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
      <button type="button" class="gch-close" aria-label="Close">×</button>
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

      const confirmText = buttonText(confirmButton).toLowerCase();
      if (confirmText === "x" || confirmText === "×") continue;

      match = {
        dialog,
        confirmButton,
        repo,
        rule,
        trusted: rule.autoConfigured || isTrustedRule(rule, trustedRules)
      };
      break;
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
      const latestText = buttonText(latestButton).toLowerCase();
      if (latestButton && latestText !== "x" && latestText !== "×" && isClickableButton(latestButton)) {
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
    clearTimeout(scanTimer);
    scanTimer = setTimeout(runScan, 250);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "CONFIRM_ALLOWED_GITHUB_ACTION") confirmMatch({ remember: true });
  });

  ensureInitialStorage().then(runScan).catch(stopIfContextInvalidated);
})();
