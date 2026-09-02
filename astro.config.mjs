import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import expressiveCode from "astro-expressive-code";
import remarkAdmonitions from "./src/lib/remark-admonitions.mjs";

export default defineConfig({
  site: "https://oponomarov.com",
  output: "static",
  devToolbar: { enabled: false },
  markdown: { processor: unified({ remarkPlugins: [remarkAdmonitions] }) },
  integrations: [expressiveCode({
    themes: ["github-dark", "github-light"],
    useDarkModeMediaQuery: false,
    customizeTheme(theme) {
      theme.name = theme.type;
    },
  })],
});
