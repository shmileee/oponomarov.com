/**
 * Two date voices, site-wide. `display` is the full date a page header, a
 * card or an Open Graph card carries ("28 December 2024"); `list` is the
 * compact form a row in a list carries ("28 Dec 2024"); `dayMonth` is the
 * row form under a year heading that already says the year ("04 Mar").
 * Nothing else formats a date, so a note shows the same date wherever it
 * is named. Dates are formatted in UTC, as the frontmatter states them.
 */
export const dateFormats = {
  display: { day: "2-digit", month: "long", year: "numeric" },
  list: { day: "2-digit", month: "short", year: "numeric" },
  dayMonth: { day: "2-digit", month: "short" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateVoice = keyof typeof dateFormats;

export const formatDate = (date: Date, voice: DateVoice = "list") =>
  new Intl.DateTimeFormat("en-GB", { ...dateFormats[voice], timeZone: "UTC" }).format(date);
