import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const source = fs.readFileSync(path.join(root, "index.html"), "utf8");
const body = source.match(/<body>([\s\S]*?)<script src="app\.js[^>]*><\/script>\s*<\/body>/)?.[1];

if (!body) throw new Error("Could not extract landing body from index.html");

const assetBase = "https://rudenkods.github.io/-zapovedny-quiz-/";
const html = [
  `<link rel="stylesheet" href="${assetBase}styles.css?v=comic-002">`,
  body.replaceAll('src="assets/', `src="${assetBase}assets/`),
  `<script src="${assetBase}app.js?v=comic-002"><\/script>`
].join("\n");

fs.writeFileSync(path.join(root, "tilda-embed.html"), html);
console.log(`Generated tilda-embed.html (${Buffer.byteLength(html)} bytes)`);
