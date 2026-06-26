// Builds the root class string from settings: selects the color theme and
// dark/light mode. Keeps the className logic in one place across all views.
const THEME_IDS = ["a", "b", "c"];

export function rootClass(settings) {
  const theme = THEME_IDS.includes(settings?.theme) ? settings.theme : "a";
  return "sf-root theme-" + theme + (settings?.darkMode ? "" : " light");
}
