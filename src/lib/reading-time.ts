/** Minutes to read a Markdown body at 220 words a minute, never below one. */
export const readingMinutes = (body: string | undefined) => Math.floor((body ?? "").split(/\s+/).filter(Boolean).length / 220) + 1;
