import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "public/favicon.svg"));

/* The two classic sizes, and the two the web app manifest lists (192 for
   home-screen icons, 512 for splash screens and "maskable" crops). */
await Promise.all([
  sharp(source).resize(32, 32).png().toFile(path.join(root, "public/favicon-32x32.png")),
  sharp(source).resize(180, 180).png().toFile(path.join(root, "public/apple-touch-icon.png")),
  sharp(source).resize(192, 192).png().toFile(path.join(root, "public/icon-192.png")),
  sharp(source).resize(512, 512).png().toFile(path.join(root, "public/icon-512.png")),
]);
