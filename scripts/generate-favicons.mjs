import { readFile, writeFile } from "node:fs/promises";
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

/* /favicon.ico: no page links it, but browsers, feed readers and crawlers
   ask for it by name and log a 404 when it is missing. An ICO file is a
   directory of images, and every current reader accepts PNG entries, so it
   is the three small sizes as PNG behind a 6-byte header and one 16-byte
   entry each (sharp writes no ICO itself). */
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => sharp(source).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
  const entry = 6 + 16 * index;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
});
await writeFile(path.join(root, "public/favicon.ico"), Buffer.concat([header, ...images]));
