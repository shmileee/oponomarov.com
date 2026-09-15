import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import expressiveCode from "astro-expressive-code";
import remarkAdmonitions from "./src/lib/remark-admonitions.mjs";
import rehypeImages from "./src/lib/rehype-images.mjs";
import rehypeInlineCode from "./src/lib/rehype-inline-code.mjs";
import rehypeTableScroll from "./src/lib/rehype-table-scroll.mjs";

export default defineConfig({
  site: "https://oponomarov.com",
  output: "static",
  devToolbar: { enabled: false },
  vite: {
    define: {
      /* Where the Open Graph renderer (src/lib/og.ts) reads its font files.
         The prerender bundle runs from dist/, where import.meta.url no
         longer points into the source tree, so the source path is fixed
         here, relative to this config file rather than to the cwd. */
      "import.meta.env.OG_FONTS_DIR": JSON.stringify(fileURLToPath(new URL("./src/assets/og/", import.meta.url))),
    },
  },
  markdown: {
    // Astro 7 moved remark/rehype configuration into the unified processor.
    // Astro already parses authored HTML, so no rehype-raw pass is needed;
    // adding one re-parses Expressive Code's output and drops code titles.
    processor: unified({
      remarkPlugins: [remarkAdmonitions],
      rehypePlugins: [rehypeTableScroll, rehypeImages, rehypeInlineCode],
    }),
  },
  integrations: [expressiveCode({
    themes: ["github-dark", "github-light"],
    customizeTheme: (t) => { t.name = t.type; },
    useDarkModeMediaQuery: false,
    cascadeLayer: "expressive-code",
    /* Long lines scroll inside the frame rather than wrapping: a wrapped
       command reads as two commands, a wrapped YAML key as a broken document.
       prose.css draws the always-visible thin scrollbar and the edge fade
       that say "more to the right"; QA S4 requires every overflowing block to
       be its own scroll container. */
    defaultProps: { wrap: false, preserveIndent: true },
    useThemedScrollbars: false,
    styleOverrides: {
      codeFontFamily: "var(--font-mono)",
      codeFontSize: "var(--code-font-size)",
      codeLineHeight: "var(--leading-code)",
      codePaddingBlock: "var(--space-4)",
      codePaddingInline: "var(--space-5)",
      borderRadius: "var(--radius-md)",
      borderColor: "var(--code-border)",
      codeBackground: "var(--code-bg)",
      frames: {
        editorTabBarBackground: "var(--code-toolbar-bg)",
        terminalTitlebarBackground: "var(--code-toolbar-bg)",
        /* The copy confirmation is a live region EC also paints. Left alone
           it lands on the toolbar in EC's own green, a colour this palette
           does not contain. The inline-code pairing is the site's code
           accent and is already contrast-checked in both themes. */
        tooltipSuccessBackground: "var(--color-accent-surface)",
        tooltipSuccessForeground: "var(--code-inline-text)",
      },
    },
  })],
});
