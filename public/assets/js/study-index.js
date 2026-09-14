/* Homepage case-study index: topic filtering, the see-more toggle, and the
   reader bootstrap.
   Formerly public/assets/js/site.js, which also carried a theme toggle and a
   scroll-progress handler. SiteHeader owns both of those now, so this module
   is homepage-only and is loaded only by src/pages/index.astro. */

const readerUrl = new URL("./reader.js", import.meta.url);
const assetVersion = new URL(import.meta.url).searchParams.get("v");
if (assetVersion) readerUrl.searchParams.set("v", assetVersion);

function setupStudyIndex() {
  const grid = document.querySelector("[data-case-grid]");
  const toggle = document.querySelector("[data-grid-toggle]");
  const status = document.querySelector("[data-filter-status]");
  const filters = [...document.querySelectorAll("[data-topic-filter]")];
  if (!grid || !toggle || !status || filters.length === 0) return;

  const cards = [...grid.querySelectorAll("[data-case-card]")];
  let activeTopic = "all";
  let expanded = false;

  const render = () => {
    let visibleCount = 0;
    for (const card of cards) {
      const topics = (card.dataset.topics || "").split("|");
      const matches = activeTopic === "all" || topics.includes(activeTopic);
      const collapsed = card.dataset.initiallyHidden === "true";
      const visible = matches && (activeTopic !== "all" || expanded || !collapsed);
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    }

    for (const filter of filters) {
      filter.setAttribute("aria-pressed", String(filter.dataset.topicFilter === activeTopic));
    }
    toggle.hidden = activeTopic !== "all";
    toggle.textContent = expanded ? "see less ↑" : "see more →";
    status.textContent = `${visibleCount} case ${visibleCount === 1 ? "study" : "studies"} shown`;
  };

  for (const filter of filters) {
    filter.addEventListener("click", () => {
      activeTopic = filter.dataset.topicFilter || "all";
      render();
    });
  }
  toggle.addEventListener("click", () => {
    expanded = !expanded;
    render();
    if (!expanded) document.querySelector("#index")?.scrollIntoView({ block: "start" });
  });
  render();
}

setupStudyIndex();
const { setupReader } = await import(readerUrl);
setupReader();
