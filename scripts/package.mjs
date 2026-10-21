import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, "..", "Cadence-Dashboard.zip");
const folders = ["src", "tests", "docs", "scripts", "google-apps-script"];
const names = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next-env.d.ts",
  "next.config.ts",
  "postcss.config.mjs",
  "vitest.config.ts",
  "playwright.config.ts",
  "vercel.json",
  "README.md",
  ".env.example",
  ".gitignore",
  "AGENTS.md",
];
async function walk(folder) {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, folder), {
    withFileTypes: true,
  })) {
    const name = `${folder}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await walk(name)));
    else result.push(name);
  }
  return result;
}
for (const folder of folders) names.push(...(await walk(folder)));
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let b = 0; b < 8; b++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let value = 0xffffffff;
  for (const b of buffer) value = crcTable[(value ^ b) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
const local = [],
  central = [];
const stamp = new Date();
const dosDate = ((stamp.getUTCFullYear() - 1980) << 9) | ((stamp.getUTCMonth() + 1) << 5) | stamp.getUTCDate();
let offset = 0;
for (const name of names.sort()) {
  const data = await fs.readFile(path.join(root, name));
  const compressed = zlib.deflateRawSync(data, { level: 9 });
  const filename = Buffer.from(`cadence-dashboard/${name}`, "utf8"),
    crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(filename.length, 26);
  local.push(header, filename, compressed);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50, 0);
  directory.writeUInt16LE(20, 4);
  directory.writeUInt16LE(20, 6);
  directory.writeUInt16LE(0x800, 8);
  directory.writeUInt16LE(8, 10);
  directory.writeUInt16LE(dosDate, 14);
  directory.writeUInt32LE(crc, 16);
  directory.writeUInt32LE(compressed.length, 20);
  directory.writeUInt32LE(data.length, 24);
  directory.writeUInt16LE(filename.length, 28);
  directory.writeUInt32LE(offset, 42);
  central.push(directory, filename);
  offset += header.length + filename.length + compressed.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(names.length, 8);
end.writeUInt16LE(names.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
await fs.writeFile(output, Buffer.concat([...local, directory, end]));
console.log(
  `${output}\n${names.length} files. Source, configuration, docs and tests only; no credentials or installed dependencies.`,
);
