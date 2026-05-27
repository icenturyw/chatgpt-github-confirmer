(function (global) {
  const DEFAULT_REPO = "icenturyw/chatgpt-github-confirmer";
  const REPO_PATTERN = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeRepo(value) {
    return normalizeText(value)
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/^github\.com\//i, "")
      .replace(/\/+$/g, "")
      .toLowerCase();
  }

  function isValidRepo(value) {
    return REPO_PATTERN.test(value);
  }

  function uniqueRepos(values) {
    return Array.from(new Set((values || [])
      .map(normalizeRepo)
      .filter(isValidRepo)))
      .sort();
  }

  function normalizeRule(rule) {
    const repo = normalizeRepo(rule?.repo);
    if (!repo || !isValidRepo(repo)) return null;

    return {
      enabled: rule.enabled !== false,
      repo,
      branch: normalizeText(rule.branch),
      file: normalizeText(rule.file) || "*"
    };
  }

  function defaultRule() {
    return {
      enabled: true,
      repo: DEFAULT_REPO,
      branch: "",
      file: "*"
    };
  }

  global.GHC = Object.freeze({
    DEFAULT_REPO,
    REPO_PATTERN,
    normalizeText,
    normalizeRepo,
    isValidRepo,
    uniqueRepos,
    normalizeRule,
    defaultRule
  });
})(globalThis);
