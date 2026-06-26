// Minimal, safe-by-default markdown renderer for task titles and notes. We
// escape HTML first, then apply a small set of inline transformations — bold,
// italic, inline code, [text](url) links, bare URLs, and newlines. Output is
// fed to dangerouslySetInnerHTML, so every replacement must be either applied
// to already-escaped text or produce values that are safe by construction
// (only http/https URLs are linkified; the URL becomes an attribute value of a
// tag whose other attributes are fixed).
export const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderTitle(text, highlight) {
  if (!text) return "";
  let s = escapeHtml(text);
  // Mark highlights with safe placeholders so markdown processing below can't
  // mangle the <mark> tags or split them across link boundaries. The actual
  // <mark> insertion happens at the very end.
  if (highlight && highlight.trim()) {
    const h = escapeHtml(highlight.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(h, "gi");
    s = s.replace(re, (m) => `xHLSx${m}xHLEx`);
  }
  // Inline code (run first so other rules don't touch its contents)
  s = s.replace(/`([^`]+)`/g, (_m, body) => `<code>${body}</code>`);
  // Markdown link [text](url) — restrict scheme to http(s) to avoid javascript:
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label, url) => `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`
  );
  // Bare URLs (skip ones already inside an href="…")
  s = s.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    (_m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`
  );
  // Bold then italic (order matters so **x** isn't mangled by the * rule)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  // Resolve highlight placeholders into <mark> tags (done after markdown so
  // matches can survive being wrapped by other inline spans).
  s = s.replace(/xHLSx([\s\S]*?)xHLEx/g, "<mark>$1</mark>");
  // Preserve newlines (CSS also has white-space:pre-wrap, but explicit <br>
  // keeps copy-paste and screen readers happy)
  s = s.replace(/\n/g, "<br>");
  return s;
}
