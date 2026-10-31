import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────
// PATCH 1: CUSTOM NODES OVERRIDE
// zapo-js secara default hanya menumpuk node (content.push).
// Patch ini memastikan jika node dengan tag yang sama sudah ada,
// node lama akan digantikan (override), bukan ditumpuk ganda.
// ─────────────────────────────────────────────────────────────

const targetBuilders = [
  path.join(__dirname, "node_modules/zapo-js/dist/esm/transport/node/builders/message.js"),
  path.join(__dirname, "node_modules/zapo-js/dist/transport/node/builders/message.js"),
];

const MARKER = "/* OVERRIDE_CUSTOM_NODES_PATCH */";

const regex =
  /if\s*\(\s*input\.customNodes\s*\)\s*\{\s*for\s*\(\s*const\s+node\s+of\s+input\.customNodes\s*\)\s*\{\s*content\.push\(\s*node\s*\);\s*\}\s*\}/;

const patchReplacement = `${MARKER}
    if (input.customNodes) {
        for (const node of input.customNodes) {
            if (!node || !node.tag) continue;

            const existingIndex = content.findIndex(
                item => item && item.tag === node.tag
            );

            if (existingIndex !== -1) {
                content[existingIndex] = node;
            } else {
                content.push(node);
            }
        }
    }`;

let patchedCount = 0;
let skippedCount = 0;

for (const file of targetBuilders) {
  const relativePath = path.relative(__dirname, file);

  if (!fs.existsSync(file)) {
    continue;
  }

  let content = fs.readFileSync(file, "utf8");

  if (content.includes(MARKER)) {
    skippedCount++;
    continue;
  }

  if (regex.test(content)) {
    content = content.replace(regex, patchReplacement);
    fs.writeFileSync(file, content, "utf8");
    patchedCount++;
    console.log(`[patch] berhasil patch customNodes: ${relativePath}`);
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH 2: ALBUM COLLECTION MEDIATYPE
// Menambahkan tipe collection agar zapo-js mendukung albumMessage.
// ─────────────────────────────────────────────────────────────

const albumTargets = [
  ...["dist", "dist/esm"].flatMap((base) => [
    path.join(__dirname, `node_modules/zapo-js/${base}/protocol/message.js`),
    path.join(__dirname, `node_modules/zapo-js/${base}/message/encode/content.js`),
  ]),
];

const ALBUM_MARKER = "/* OVERRIDE_ALBUM_COLLECTION_PATCH */";

let albumPatched = 0;

for (const file of albumTargets) {
  const relativePath = path.relative(__dirname, file);

  if (!fs.existsSync(file)) {
    continue;
  }

  let content = fs.readFileSync(file, "utf8");

  if (content.includes(ALBUM_MARKER)) {
    continue;
  }

  const isEsm = file.includes("/esm/");
  const nsPrefix = isEsm ? "" : "constants_1.";

  if (file.endsWith("protocol/message.js")) {
    const oldConstant = "GROUP_HISTORY: 'group_history'\n})";
    const newConstant = `GROUP_HISTORY: 'group_history',
    ${ALBUM_MARKER}
    COLLECTION: 'collection'
})`;

    if (content.includes(oldConstant)) {
      content = content.replace(oldConstant, newConstant);
      fs.writeFileSync(file, content, "utf8");
      albumPatched++;
      console.log(`[patch] berhasil patch album constants: ${relativePath}`);
    }
  } else {
    const oldResolver = `if (msg.messageHistoryBundle)\n        return ${nsPrefix}WA_ENC_MEDIA_TYPES.GROUP_HISTORY;`;
    const newResolver = `${ALBUM_MARKER}\n` +
      `    if (msg.albumMessage)\n        return ${nsPrefix}WA_ENC_MEDIA_TYPES.COLLECTION;\n    ` +
      oldResolver;

    if (content.includes(oldResolver)) {
      content = content.replace(oldResolver, newResolver);
      fs.writeFileSync(file, content, "utf8");
      albumPatched++;
      console.log(`[patch] berhasil patch album resolver: ${relativePath}`);
    }
  }
}

console.log(`[patch] selesai: ${patchedCount} customNodes patched (${skippedCount} skipped), ${albumPatched} album patches applied.`);
