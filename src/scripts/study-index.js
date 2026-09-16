/* Homepage case-study index: topic filtering, the see-more toggle, and the
   reader bootstrap. Loaded only by src/pages/index.astro and bundled with
   the page (Vite minifies and hashes it; the reader below is a separate
   chunk fetched on demand, so a visit that opens no study never loads it).

   The module runs once per tab; the client router swaps the document under
   it. Every navigation onto the homepage (including the first) re-runs the
   setup against the fresh DOM, and the previous run's listeners are dropped
   through an AbortController before the swap. */

function setupStudyIndex(signal) {
  const grid = document.querySelector("[data-case-grid]");
  const toggle = document.querySelector("[data-grid-toggle]");
  const status = document.querySelector("[data-filter-status]");
  const filters = [...document.querySelectorAll("[data-topic-filter]")];
  if (!grid || !status || filters.length === 0) return;

  const cards = [...grid.querySelectorAll("[data-case-card]")];
  let activeTopic = "all";
  let expanded = false;

  const render = () => {
    let visibleCount = 0;
    for (const card of cards) {
      const topics = (card.dataset.topics || "").split("|");
      const matches = activeTopic === "all" || topics.includes(activeTopic);
      const collapsed = card.dataset.initiallyHidden === "true";
      const visible = matches && (activeTopic !== "all" || expanded || !collapsed || !toggle);
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    }

    for (const filter of filters) {
      filter.setAttribute("aria-pressed", String(filter.dataset.topicFilter === activeTopic));
    }
    if (toggle) {
      toggle.hidden = activeTopic !== "all";
      toggle.textContent = expanded ? "see less ↑" : "see more →";
    }
    const total = cards.length;
    /* The pressed chip's label, not its filter key: "on AI", not "on ai". */
    const activeLabel = filters.find((filter) => filter.dataset.topicFilter === activeTopic)?.textContent?.trim() ?? activeTopic;
    status.textContent = visibleCount === total
      ? `All ${total} case studies`
      : `Showing ${visibleCount} of ${total} case ${total === 1 ? "study" : "studies"}${activeTopic === "all" ? "" : ` on ${activeLabel}`}`;
  };

  for (const filter of filters) {
    filter.addEventListener("click", () => {
      activeTopic = filter.dataset.topicFilter || "all";
      render();
    }, { signal });
  }
  toggle?.addEventListener("click", () => {
    expanded = !expanded;
    render();
    if (!expanded) document.querySelector("#index")?.scrollIntoView({ block: "start" });
  }, { signal });
  render();
}

const { setupReader } = await import("./reader.js");

let controller;
let boundBody;
const init = () => {
  /* astro:page-load also fires for the initial load, after this module has
     already run: the same body is not set up twice. A router swap installs a
     new body element, which is what marks a new page. */
  if (boundBody === document.body) return;
  controller?.abort();
  boundBody = document.body;
  if (!document.querySelector("[data-case-grid]")) return;
  controller = new AbortController();
  setupStudyIndex(controller.signal);
  setupReader({ signal: controller.signal });
};

init();
document.addEventListener("astro:page-load", init);
document.addEventListener("astro:before-swap", () => controller?.abort());
