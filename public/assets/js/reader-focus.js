const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  ".code-exhibit pre",
  ".diagram-exhibit",
].join(",");

const ARROW_GUARD_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "[contenteditable]",
  "audio",
  "video",
  ".code-exhibit pre",
  ".diagram-exhibit",
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
  '[role="slider"]',
].join(",");

export function visibleFocusables(dialog) {
  return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
  });
}

export function isGuardedArrowTarget(target) {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return Boolean(element?.closest(ARROW_GUARD_SELECTOR));
}
