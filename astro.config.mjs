import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import expressiveCode from "astro-expressive-code";
import rehypeRaw from "rehype-raw";
import remarkAdmonitions from "./src/lib/remark-admonitions.mjs";
import rehypeTableScroll from "./src/lib/rehype-table-scroll.mjs";

export default defineConfig({
  site: "https://oponomarov.com",
  output: "static",
  devToolbar: { enabled: false },
  markdown: {
    syntaxHighlight: false,
    // Astro 7 moved remark/rehype configuration into the unified processor.
    processor: unified({
      remarkPlugins: [remarkAdmonitions],
      // Parse authored HTML first so captions and existing ancestors are visible.
      rehypePlugins: [rehypeRaw, rehypeTableScroll],
    }),
  },
  integrations: [expressiveCode({
    themes: ["github-dark", "github-light"],
    customizeTheme: (t) => { t.name = t.type; },
    useDarkModeMediaQuery: false,
    cascadeLayer: "expressive-code",
    defaultProps: { wrap: true, preserveIndent: true },
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
      },
    },
  })],
});
