const readerUrl = new URL("./reader.js", import.meta.url);
const assetVersion = new URL(import.meta.url).searchParams.get("v");
if (assetVersion) readerUrl.searchParams.set("v", assetVersion);

const root = document.documentElement;

function setupTheme() {
  const button = document.querySelector("[data-theme-toggle]");
  if (!button) return;

  const render = () => {
    const theme = root.dataset.theme === "light" ? "light" : "dark";
    button.textContent = theme === "dark" ? "light" : "dark";
    button.setAttribute("aria-label", `Switch to ${button.textContent} color scheme`);
  };

  button.addEventListener("click", () => {
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = theme;
    localStorage.setItem("om-theme", theme);
    render();
  });
  render();
}

function setupScrollUI() {
  const progress = document.querySelector("[data-reading-progress]");
  const toTop = document.querySelector("[data-back-to-top]");
  if (!progress || !toTop) return;

  let scheduled = false;
  const render = () => {
    const available = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = available > 0 ? Math.min(window.scrollY / available, 1) : 0;
    progress.style.transform = `scaleX(${ratio})`;
    toTop.dataset.visible = String(window.scrollY > 640);
    scheduled = false;
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  if (toTop.dataset.bound !== "true") {
    toTop.dataset.bound = "true";
    toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }
  render();
}

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

setupTheme();
setupScrollUI();
setupStudyIndex();
const { setupReader } = await import(readerUrl);
setupReader();
