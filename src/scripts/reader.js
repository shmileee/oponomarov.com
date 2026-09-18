import { isGuardedArrowTarget, visibleFocusables } from "./reader-focus.js";
import { createContentLoader, createManifestIndex, isPrimarySameTab, isReaderState, STUDY_HASH } from "./reader-model.js";

/* `signal` (an AbortSignal) releases every listener this call binds; the
   homepage module aborts it before the client router swaps the document and
   calls setupReader again against the new one. */
export function setupReader({ signal } = {}) {
  const dialog = document.querySelector("[data-reader]");
  if (!(dialog instanceof HTMLDialogElement)) return;
  const portfolioDocumentTitle = document.title;
  /* Under the client router the reader keeps out of the history stack: it
     shows the open study in the URL with replaceState and clears it on close,
     so Back leaves the homepage the way it does everywhere else, and never
     lands on an entry the router would answer by re-rendering the page under
     the open dialog. Without the router (a plain load) it keeps the published
     behaviour: opening pushes an entry and Back closes the dialog. */
  const routed = Boolean(document.querySelector('meta[name="astro-view-transitions-enabled"]'));

  const manifestNode = dialog.querySelector("[data-reader-manifest]");
  const study = dialog.querySelector("[data-reader-study]");
  const title = dialog.querySelector("[data-reader-title]");
  const dek = dialog.querySelector("[data-reader-dek]");
  const prose = dialog.querySelector("[data-reader-prose]");
  const status = dialog.querySelector("[data-reader-status]");
  const metaNumber = dialog.querySelector("[data-reader-meta-number]");
  const metaTopics = dialog.querySelector("[data-reader-meta-topics]");
  const permalink = dialog.querySelector("[data-reader-permalink]");
  const closeButton = dialog.querySelector("[data-reader-close]");
  const previousButton = dialog.querySelector('[data-reader-direction="previous"]');
  const nextButton = dialog.querySelector('[data-reader-direction="next"]');
  const previousKicker = previousButton?.querySelector("[data-reader-direction-kicker]");
  const previousNumber = previousButton?.querySelector("[data-reader-case-number]");
  const previousTitle = previousButton?.querySelector("[data-reader-case-title]");
  const nextKicker = nextButton?.querySelector("[data-reader-direction-kicker]");
  const nextNumber = nextButton?.querySelector("[data-reader-case-number]");
  const nextTitle = nextButton?.querySelector("[data-reader-case-title]");
  if (
    !manifestNode || !study || !title || !prose || !status || !metaNumber || !metaTopics || !closeButton ||
    !previousButton || !previousKicker || !previousNumber || !previousTitle ||
    !nextButton || !nextKicker || !nextNumber || !nextTitle
  ) return;

  const manifest = createManifestIndex(manifestNode);
  const loadContent = createContentLoader();
  let activeId = "";
  let intentGeneration = 0;
  let returnFocus = null;
  let closingMarkedEntry = false;

  const entryForHash = (hash) => {
    const match = hash.match(STUDY_HASH);
    if (!match) return undefined;
    return manifest.byId.get(match[1]) ?? manifest.byAlias.get(match[1]) ?? manifest.byAlias.get(String(Number.parseInt(match[1], 10)));
  };
  const entryFromHash = () => entryForHash(window.location.hash);

  const hideReader = () => {
    const focusTarget = returnFocus;
    const wasOpen = dialog.open;
    returnFocus = null;
    intentGeneration += 1;
    study.removeAttribute("aria-busy");
    if (wasOpen) dialog.close();
    document.body.classList.remove("reader-open");
    document.title = portfolioDocumentTitle;
    if (focusTarget?.isConnected) focusTarget.focus();
    else if (wasOpen) document.querySelector("#main-content")?.focus();
  };

  const closeReader = () => {
    if (!routed && isReaderState(history.state)) {
      if (closingMarkedEntry) return;
      closingMarkedEntry = true;
      hideReader();
      history.back();
      return;
    }
    if (STUDY_HASH.test(window.location.hash)) {
      history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}`);
    }
    hideReader();
  };

  const updateHistory = (entry, mode) => {
    const hash = `#study-${entry.id}`;
    if (mode === "none") return;
    if (routed || mode === "replace") {
      const state = !routed && isReaderState(history.state)
        ? { portfolioReader: true, id: entry.id }
        : history.state;
      history.replaceState(state, "", hash);
    } else if (mode === "push") {
      history.pushState({ portfolioReader: true, id: entry.id }, "", hash);
    }
  };

  const renderStudy = (entry, content) => {
    const current = manifest.ids.indexOf(entry.id);
    const previous = manifest.byId.get(manifest.ids[(current - 1 + manifest.ids.length) % manifest.ids.length]);
    const next = manifest.byId.get(manifest.ids[(current + 1) % manifest.ids.length]);
    activeId = entry.id;
    metaNumber.textContent = `Case study ${String(entry.number).padStart(2, "0")}`;
    /* One span per topic, the dot inside it with a no-break space: a line
       can break only before a topic, never between a dot and its tag or at
       the hyphen inside "developer-experience". */
    metaTopics.replaceChildren(
      ...entry.topics.flatMap((topic) => {
        const item = document.createElement("span");
        item.className = "reader-meta-topic";
        item.textContent = `\u00B7\u00A0${topic}`;
        return [document.createTextNode(" "), item];
      }),
    );
    title.textContent = entry.title;
    if (permalink) {
      permalink.href = entry.url;
      permalink.setAttribute("aria-label", `Open “${entry.title}” as its own page`);
    }
    /* The manifest's summaryHtml is the engine's own rendering of the
       frontmatter (escaped, backticks to <code>), the same string the study
       page prints as its dek. */
    if (dek) {
      dek.innerHTML = entry.summaryHtml ?? "";
      dek.hidden = !entry.summaryHtml;
    }
    document.title = `${entry.title} - ${portfolioDocumentTitle}`;
    prose.innerHTML = content;
    document.dispatchEvent(new CustomEvent("oponomarov:content-updated", { detail: { root: prose } }));
    previousKicker.textContent = "Previous";
    previousNumber.textContent = `Case study ${String(previous.number).padStart(2, "0")}`;
    previousTitle.textContent = previous.title;
    previousButton.setAttribute("aria-label", `Previous case study: ${previousNumber.textContent} — ${previous.title}`);
    nextKicker.textContent = "Next";
    nextNumber.textContent = `Case study ${String(next.number).padStart(2, "0")}`;
    nextTitle.textContent = next.title;
    nextButton.setAttribute("aria-label", `Next case study: ${nextNumber.textContent} — ${next.title}`);
    study.removeAttribute("aria-busy");
    status.textContent = `${entry.title} loaded.`;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("reader-open");
    dialog.scrollTop = 0;
    closeButton.focus();
  };

  const showStudy = async (entry, historyMode) => {
    const intent = ++intentGeneration;
    study.setAttribute("aria-busy", "true");
    status.textContent = `Loading ${entry.title}.`;
    try {
      const content = await loadContent(entry);
      if (intent !== intentGeneration) return;
      renderStudy(entry, content);
      updateHistory(entry, historyMode);
    } catch {
      if (intent !== intentGeneration) return;
      study.removeAttribute("aria-busy");
      window.location.assign(entry.url);
    }
  };

  const navigate = (direction) => {
    const current = manifest.ids.indexOf(activeId);
    if (current < 0) return false;
    const offset = direction === "next" ? 1 : -1;
    const id = manifest.ids[(current + offset + manifest.ids.length) % manifest.ids.length];
    const entry = manifest.byId.get(id);
    if (!entry) return false;
    showStudy(entry, "replace");
    return true;
  };

  const handleLocation = () => {
    closingMarkedEntry = false;
    const entry = entryFromHash();
    if (entry) showStudy(entry, "none");
    else hideReader();
  };

  /* Capture phase: the client router's own document click listener was
     registered first and would otherwise navigate to the study page before
     this handler could claim the click for the dialog. Capturing runs first
     and preventDefault() tells the router to stand down. */
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a");
    if (!anchor || !isPrimarySameTab(event, anchor)) return;

    const url = new URL(anchor.href);
    const hashEntry = entryForHash(url.hash);
    const sameDocument = url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search;
    if (!dialog.open && sameDocument && hashEntry) {
      returnFocus = anchor;
      return;
    }

    let entry;
    if (anchor.matches("[data-open-study]")) {
      entry = manifest.byId.get(anchor.dataset.openStudy);
    } else if (dialog.open && prose.contains(anchor)) {
      if (url.origin === window.location.origin) entry = manifest.byPath.get(url.pathname);
    }
    if (!entry) return;
    event.preventDefault();
    if (!dialog.open) returnFocus = anchor;
    showStudy(entry, dialog.open ? "replace" : "push");
  }, { capture: true, signal });
  closeButton?.addEventListener("click", closeReader, { signal });
  previousButton?.addEventListener("click", () => navigate("previous"), { signal });
  nextButton?.addEventListener("click", () => navigate("next"), { signal });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeReader();
  }, { signal });
  /* Escape by hand as well as through the dialog's cancel event: a browser
     may withhold cancel without recent user activation, and the search
     dialog closes on the key, so this one does too. */
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dialog.open) {
      event.preventDefault();
      closeReader();
    }
  }, { signal });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeReader();
  }, { signal });
  dialog.addEventListener("keydown", (event) => {
    const isArrow = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const isModified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (dialog.open && isArrow && !isModified && !isGuardedArrowTarget(event.target)) {
      if (navigate(event.key === "ArrowRight" ? "next" : "previous")) event.preventDefault();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = visibleFocusables(dialog);
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && (document.activeElement === first || !focusables.includes(document.activeElement))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !focusables.includes(document.activeElement))) {
      event.preventDefault();
      first?.focus();
    }
  }, { signal });
  if (!routed) window.addEventListener("popstate", handleLocation, { signal });
  window.addEventListener("hashchange", handleLocation, { signal });
  handleLocation();
}
