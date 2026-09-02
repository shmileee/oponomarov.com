export const STUDY_HASH = /^#study-([a-z0-9-]+)$/;

export function createManifestIndex(manifestNode) {
  const entries = JSON.parse(manifestNode.textContent || "[]");
  return {
    entries,
    ids: entries.map(({ id }) => id),
    byId: new Map(entries.map((entry) => [entry.id, entry])),
    byLegacyNumber: new Map(
      entries
        .filter(({ legacyNumber }) => Number.isInteger(legacyNumber))
        .map((entry) => [entry.legacyNumber, entry]),
    ),
    byPath: new Map(
      entries.map((entry) => [new URL(entry.url, window.location.origin).pathname, entry]),
    ),
  };
}

function normalizeProse(prose, responseUrl) {
  for (const element of prose.querySelectorAll("[src], [poster], [href]")) {
    for (const attribute of ["src", "poster", "href"]) {
      const value = element.getAttribute(attribute);
      if (value?.trim()) element.setAttribute(attribute, new URL(value, responseUrl).href);
    }
  }
  for (const heading of prose.querySelectorAll("h2")) {
    const replacement = prose.ownerDocument.createElement("h3");
    for (const attribute of heading.attributes) replacement.setAttribute(attribute.name, attribute.value);
    replacement.append(...heading.childNodes);
    heading.replaceWith(replacement);
  }
  return prose.innerHTML;
}

export function createContentLoader() {
  const cache = new Map();
  return (entry) => {
    const cached = cache.get(entry.id);
    if (cached) return cached;

    const pending = fetch(entry.url).then(async (response) => {
      if (!response.ok) throw new Error(`Study request failed with ${response.status}`);
      const source = new DOMParser().parseFromString(await response.text(), "text/html");
      const prose = source.querySelector(".case-detail-prose");
      if (!prose) throw new Error("Study response has no canonical prose");
      return normalizeProse(prose, response.url);
    });
    cache.set(entry.id, pending);
    pending.catch(() => {
      if (cache.get(entry.id) === pending) cache.delete(entry.id);
    });
    return pending;
  };
}

export function isPrimarySameTab(event, anchor) {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !anchor.hasAttribute("target") &&
    !anchor.hasAttribute("download")
  );
}

export function isReaderState(state) {
  return state?.portfolioReader === true && typeof state.id === "string";
}
