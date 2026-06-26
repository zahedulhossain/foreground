// Detecting Jira issue references inside free text (task titles).

// Match a JIRA issue key — uppercase letters + numbers, dash, digits.
const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;
// Match a browse URL like https://acme.atlassian.net/browse/PROJ-123
const JIRA_URL_RE = /https?:\/\/[^\s]+\/browse\/([A-Z][A-Z0-9]+-\d+)/;

export function detectJira(text) {
  if (!text) return null;
  const urlM = text.match(JIRA_URL_RE);
  if (urlM) return { key: urlM[1], url: urlM[0] };
  const keyM = text.match(JIRA_KEY_RE);
  if (keyM) return { key: keyM[1], url: null };
  return null;
}
