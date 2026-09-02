import { copyFileSync, cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

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
  const assets = readdirSync(folderSource, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:mp4|png|svg)$/i.test(entry.name));
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

console.log(`Synced ${caseStudyAssetCount} case-study assets into public/case-studies and blog static files into public/blog-static.`);
