/**
 * momoriri 由来の簡易バッチ（解体再利用）。
 * 使い方: プロジェクトルートで node tools/momoriri_phrase_batch.js
 * 出力: data/generated_phrases.json
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const outFile = path.join(dataDir, "generated_phrases.json");

const templates = {
  hotel: [
    "Check-in, please.",
    "Where is the breakfast venue?",
    "I need an extra towel.",
    "Could I have a late checkout?",
    "The Wi‑Fi password, please.",
  ],
};

const scene = process.env.SCENE || "hotel";
const count = parseInt(process.env.COUNT || "8", 10);
const pool = templates[scene];
if (!pool) {
  console.error("Unknown scene:", scene);
  process.exit(1);
}

const output = [];
for (let i = 0; i < count; i++) {
  const text = pool[Math.floor(Math.random() * pool.length)];
  output.push({ id: i, text });
}

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf8");
console.log("Wrote", outFile);
