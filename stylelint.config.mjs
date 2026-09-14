/* Stylelint enforces the token policy that makes the design system hard to
   break by accident. verify-design.mjs checks the same invariants against the
   built output; this catches them in the editor, before a build exists.

   Scope is deliberate: this lints the token contract, not formatting. Rules
   from stylelint-config-standard that only express a formatting opinion are
   switched off rather than reformatting 4,700 lines to satisfy them.
   Spec: docs/design-system.md sections 3 and 15. */

/* Values any property may use regardless of the token policy. */
const universal = ["inherit", "initial", "unset", "revert", "currentcolor", "transparent", "none", "auto", "0"];

/* A token reference, a calc() derived from tokens, or a universal keyword. */
const fromTokens = (prefix) => [`/^var\\(${prefix}/`, "/^calc\\(/", ...universal];

export default {
  extends: ["stylelint-config-standard"],
  rules: {
    /* The nine-layer order exists so nothing needs to shout. */
    "declaration-no-important": true,

    /* Colour, type and spacing come from semantic tokens. tokens.css is the
       single exception and is carved out in overrides below. */
    "declaration-property-value-allowed-list": {
      "color": fromTokens("--color-|--code-|--w"),
      "background-color": fromTokens("--color-|--code-|--kbd-|--table-|--frame-"),
      "border-color": fromTokens("--color-|--code-|--kbd-|--table-"),
      "font-size": fromTokens("--text-|--code-"),
      "border-radius": fromTokens("--radius-"),
      /* The three family names exist only in @font-face, which has to name
         them literally; everywhere else must go through a token. */
      "font-family": [...fromTokens("--font-"), '/^"(Bricolage Grotesque|Public Sans|IBM Plex Mono)"/'],
      /* Unitless 1 is glyph alignment for icons and kbd, not body rhythm. */
      "line-height": [...fromTokens("--leading-"), "1"],
      /* Single digits are local stacking inside one component; the --z-*
         tokens own cross-component order. */
      "z-index": [...fromTokens("--z-"), "/^-?[0-9]$/"],
    },

    /* Tier 1 primitives are an implementation detail of tokens.css. A component
       reaching for --p-* bypasses the semantic layer and breaks theming. */
    "declaration-property-value-disallowed-list": { "/.*/": ["/var\\(--p-/"] },

    /* Theme branching belongs in exactly one file, so light and dark cannot
       drift apart component by component. */
    "selector-disallowed-list": ["/\\[data-theme/"],

    /* Formatting opinions that conflict with the existing house style. */
    "comment-empty-line-before": null,
    "custom-property-empty-line-before": null,
    "number-max-precision": null,
    "lightness-notation": null,
    "hue-degree-notation": null,
    "alpha-value-notation": null,
    "import-notation": null,
    "value-keyword-case": null,
    "selector-class-pattern": null,
    "no-descending-specificity": null,
    "property-no-vendor-prefix": null,
    "media-feature-range-notation": "context",
    "custom-property-pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
  },

  overrides: [
    {
      /* The token file is where literal values are allowed to exist at all. */
      files: ["src/styles/tokens.css"],
      rules: {
        "declaration-property-value-allowed-list": null,
        "declaration-property-value-disallowed-list": null,
        "selector-disallowed-list": null,
        "custom-property-pattern": null,
      },
    },
  ],
};
