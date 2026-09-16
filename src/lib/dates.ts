/**
 * Two date voices, site-wide. `display` is the full date a page header, a
 * card or an Open Graph card carries ("28 December 2024"); `list` is the
 * compact form a row in a list carries ("28 Dec 2024"); `dayMonth` is the
 * row form under a year heading that already says the year ("04 Mar").
 * Nothing else formats a date, so a note shows the same date wherever it
 * is named. Dates are formatted in UTC, as the frontmatter states them.
 *
 * The short month is a fixed three letters. Intl's en-GB "short" month is
 * four for September ("Sept") and three for every other month, so the day
 * a September note is published the list's date column stops lining up.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const dateVoices = ["display", "list", "dayMonth"] as const;

export type DateVoice = (typeof dateVoices)[number];

export const formatDate = (date: Date, voice: DateVoice = "list") => {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = date.getUTCFullYear();
  if (voice === "display") return `${day} ${new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(date)} ${year}`;
  const month = MONTHS[date.getUTCMonth()];
  return voice === "list" ? `${day} ${month} ${year}` : `${day} ${month}`;
};
