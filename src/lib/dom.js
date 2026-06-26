// Grow a textarea to fit its content, capped at 240px.
export function autoSize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 240) + "px";
}
