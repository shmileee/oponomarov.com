import type { APIRoute, GetStaticPaths } from "astro";
import { ogCards, renderOgCard, type OgCard } from "../../lib/og";

/* One 1200×630 PNG per canonical page, at the path og-path.ts derives from
   the page's own path, so a new study, note, topic or manual gets its card
   the moment it exists. */
export const getStaticPaths = (async () => {
  const cards = await ogCards();
  return [...cards].map(([slug, card]) => ({ params: { slug }, props: { card } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ card: OgCard }> = async ({ props }) => {
  const png = await renderOgCard(props.card);
  return new Response(png, { headers: { "Content-Type": "image/png" } });
};
