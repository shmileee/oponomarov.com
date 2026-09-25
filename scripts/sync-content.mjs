import { copyFileSync, cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import sharp from "sharp";

const projectRoot = resolve(import.meta.dirname, "..");

const PF_ROOT = resolve(projectRoot, process.env.PORTFOLIO_DIR ?? "./content/portfolio");
const BL_ROOT = resolve(projectRoot, process.env.BLOG_DIR ?? "./content/blog");
const DF_ROOT = resolve(projectRoot, process.env.DOTFILES_DIR ?? "./content/dotfiles");

const requiredDirectories = [
  join(PF_ROOT, "content/case-studies"),
  join(PF_ROOT, "content/home"),
  join(PF_ROOT, "content/arc"),
  join(PF_ROOT, "content/principles"),
  join(BL_ROOT, "content/posts"),
  join(BL_ROOT, "content/static"),
  join(DF_ROOT, "docs/content"),
];

const isDirectory = (path) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;

for (const path of requiredDirectories) {
  if (!isDirectory(path)) {
    console.error(`Content root missing: ${path}`);
    process.exit(1);
  }
}

const caseStudiesSource = join(PF_ROOT, "content/case-studies");
const caseStudiesTarget = join(projectRoot, "public/case-studies");
rmSync(caseStudiesTarget, { recursive: true, force: true });
let caseStudyAssetCount = 0;
for (const folder of readdirSync(caseStudiesSource, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  const folderSource = join(caseStudiesSource, folder.name);
  /* Ship study media and downloadable JSON evidence beside each article. */
  const assets = readdirSync(folderSource, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:mp4|png|jpe?g|webp|svg|json)$/i.test(entry.name));
  if (assets.length === 0) continue;
  const folderTarget = join(caseStudiesTarget, folder.name);
  mkdirSync(folderTarget, { recursive: true });
  for (const asset of assets) {
    copyFileSync(join(folderSource, asset.name), join(folderTarget, asset.name));
  }
  caseStudyAssetCount += assets.length;
}

const blogStaticSource = join(BL_ROOT, "content/static");
const blogStaticTarget = join(projectRoot, "public/blog-static");
rmSync(blogStaticTarget, { recursive: true, force: true });
mkdirSync(blogStaticTarget, { recursive: true });
cpSync(blogStaticSource, blogStaticTarget, { recursive: true, dereference: true });

/* Responsive variants and a manifest. Content images arrive as authored
   (a 1654px PNG for a 700px slot), so every raster copied above gets WebP
   renditions at the widths the column can use and its own dimensions
   recorded. rehype-images (src/lib/rehype-images.mjs) reads the manifest to
   give every <img> width, height, srcset and sizes without the author
   writing any of them; the original stays as the src fallback and the
   lightbox's full-size view. Renditions sit next to the original under
   public/ (rebuilt with it on every sync; a handful of screenshots convert
   in well under a second) and are skipped when already newer than it. */
const RASTER = /\.(?:png|jpe?g|webp)$/i;
const WIDTHS = [640, 960, 1440];
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : entry.isFile() && RASTER.test(entry.name) ? [join(dir, entry.name)] : []));
const manifest = {};
let renditionCount = 0;
for (const file of [...walk(caseStudiesTarget), ...walk(blogStaticTarget)]) {
  if (/\.\d+\.webp$/i.test(file)) continue; // a rendition from an earlier run, copied along
  const { width, height } = await sharp(file).metadata();
  if (!width || !height) continue;
  const url = `/${relative(join(projectRoot, "public"), file).split("\\").join("/")}`;
  const targets = [...WIDTHS.filter((candidate) => candidate < width * 0.9), width];
  for (const target of targets) {
    const rendition = file.replace(RASTER, `.${target}.webp`);
    const stale = (statSync(rendition, { throwIfNoEntry: false })?.mtimeMs ?? 0) < statSync(file).mtimeMs;
    if (!stale) continue;
    await sharp(file).resize({ width: target, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(rendition);
    renditionCount += 1;
  }
  manifest[url] = { width, height, variants: targets.map((target) => ({ src: url.replace(RASTER, `.${target}.webp`), width: target })) };
}
mkdirSync(join(projectRoot, "src/lib/generated"), { recursive: true });
writeFileSync(join(projectRoot, "src/lib/generated/image-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Synced ${caseStudyAssetCount} case-study assets into public/case-studies and blog static files into public/blog-static; ${Object.keys(manifest).length} images in the manifest, ${renditionCount} WebP renditions written.`);
