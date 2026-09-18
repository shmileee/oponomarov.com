/**
 * Series links between case studies.
 *
 * A study declares the folder it continues in (`sequel`) or the folder it
 * continues from (`prequel`); declaring one side is enough, the other is
 * derived. Both sides may be declared, but they must agree: a study that
 * names one sequel while another study names it as its own prequel is a
 * build error, not a page that links two ways. A folder that does not exist
 * fails the build naming the study that referenced it.
 *
 * @typedef {{ readonly folder: string, readonly prequel?: string, readonly sequel?: string }} SeriesInput
 * @typedef {{ prequel?: string, sequel?: string }} SeriesLink
 */

/**
 * @param {readonly SeriesInput[]} studies
 * @returns {Map<string, SeriesLink>} links by folder, only for studies that have one
 */
export const seriesLinks = (studies) => {
  const folders = new Set(studies.map((study) => study.folder));
  /** @type {Map<string, SeriesLink>} */
  const links = new Map();
  const link = (folder) => {
    if (!links.has(folder)) links.set(folder, {});
    return links.get(folder);
  };
  const claim = (from, side, to) => {
    if (!folders.has(to)) {
      throw new Error(`Case study "${from}" declares ${side} "${to}", which has no folder under content/case-studies/.`);
    }
    if (to === from) {
      throw new Error(`Case study "${from}" declares itself as its own ${side}.`);
    }
    const other = side === "sequel" ? "prequel" : "sequel";
    const mine = link(from);
    if (mine[side] && mine[side] !== to) {
      throw new Error(`Case study "${from}" has two ${side}s: "${mine[side]}" and "${to}".`);
    }
    const theirs = link(to);
    if (theirs[other] && theirs[other] !== from) {
      throw new Error(`Case study "${to}" cannot be the ${side} of both "${theirs[other]}" and "${from}".`);
    }
    mine[side] = to;
    theirs[other] = from;
  };
  for (const study of studies) {
    if (study.sequel) claim(study.folder, "sequel", study.sequel);
    if (study.prequel) claim(study.folder, "prequel", study.prequel);
  }
  return links;
};
