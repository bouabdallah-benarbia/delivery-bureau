// Builds site/data.js from data/communes.csv (wilaya ↔ commune ↔ bureau cities)
// and data/desks.json (a saved response of the Ecotrack "get/desks" API).
//
// Usage: node tools/build-data.js
// To refresh desks.json, download the API response yourself and save it to
// data/desks.json. The API token is never written into the website.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CSV_PATH = path.join(ROOT, "data", "communes.csv");
const DESKS_PATH = path.join(ROOT, "data", "desks.json");
const OUT_PATH = path.join(ROOT, "site", "data.js");

// Official Arabic names of the 58 wilayas, used only to make search work in Arabic.
const WILAYA_AR = {
  1: "أدرار", 2: "الشلف", 3: "الأغواط", 4: "أم البواقي", 5: "باتنة", 6: "بجاية",
  7: "بسكرة", 8: "بشار", 9: "البليدة", 10: "البويرة", 11: "تمنراست", 12: "تبسة",
  13: "تلمسان", 14: "تيارت", 15: "تيزي وزو", 16: "الجزائر", 17: "الجلفة", 18: "جيجل",
  19: "سطيف", 20: "سعيدة", 21: "سكيكدة", 22: "سيدي بلعباس", 23: "عنابة", 24: "قالمة",
  25: "قسنطينة", 26: "المدية", 27: "مستغانم", 28: "المسيلة", 29: "معسكر", 30: "ورقلة",
  31: "وهران", 32: "البيض", 33: "إليزي", 34: "برج بوعريريج", 35: "بومرداس", 36: "الطارف",
  37: "تندوف", 38: "تيسمسيلت", 39: "الوادي", 40: "خنشلة", 41: "سوق أهراس", 42: "تيبازة",
  43: "ميلة", 44: "عين الدفلى", 45: "النعامة", 46: "عين تموشنت", 47: "غرداية", 48: "غليزان",
  49: "تيميمون", 50: "برج باجي مختار", 51: "أولاد جلال", 52: "بني عباس", 53: "عين صالح",
  54: "عين قزام", 55: "تقرت", 56: "جانت", 57: "المغير", 58: "المنيعة",
};

// Common alternative names (French / English / old names / abbreviations).
const WILAYA_ALIASES = {
  6: ["Bougie", "Bgayet"], 16: ["Algiers", "Alger", "Algeria capital", "Dzayer", "Djazair"],
  22: ["SBA", "Sidi Bel Abbes"], 23: ["Bone"], 25: ["Qacentina", "Ksentina"],
  31: ["Wahran"], 34: ["BBA"], 42: ["Tipasa"], 46: ["Temouchent"], 15: ["Tizi"],
};

const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim();

// A placeholder link such as https://maps.app.goo.gl/xxxxx is not a real location.
function cleanMapUrl(url) {
  if (!url || typeof url !== "string") return null;
  const u = url.trim().replace(/[.,;]+$/, "");
  if (!/^https?:\/\//i.test(u)) return null;
  if (/\/x{3,}\/?$/i.test(u)) return null;
  return u;
}

// --- CSV --------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}

const wilayas = new Map(); // code -> wilaya
const [, ...csvRows] = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
for (const [commune, wilayaField, bureau, home, stopdesk] of csvRows) {
  const m = /^(\d+)\s*-\s*(.+)$/.exec(wilayaField || "");
  if (!m) continue;
  const code = Number(m[1]);
  if (!wilayas.has(code)) {
    wilayas.set(code, {
      code, name: m[2], ar: WILAYA_AR[code] || null, aliases: WILAYA_ALIASES[code] || [],
      tarifHome: null, tarifStopdesk: null, communes: [], cities: [], desks: [],
    });
  }
  const w = wilayas.get(code);
  if (home && !w.tarifHome) w.tarifHome = Number(home);
  if (stopdesk && !w.tarifStopdesk) w.tarifStopdesk = Number(stopdesk);
  if (commune) w.communes.push(commune);
  if (bureau && !w.cities.includes(bureau)) w.cities.push(bureau);
}

// --- API desks --------------------------------------------------------------
const api = JSON.parse(fs.readFileSync(DESKS_PATH, "utf8"));
const desks = [...(api.other_desks || [])];
if (api.my_desk && api.my_desk.location) {
  const d = api.my_desk;
  desks.push({
    name: d.hub_name, phone: d.location.phone, phone2: d.location.phone2,
    code_wilaya: (/^(\d+)/.exec(d.hub_name) || [])[1], wilaya: d.location.wilaya,
    commune: d.location.commune, adresse: d.location.adresse, map: d.location.map,
  });
}

const wilayaByName = new Map([...wilayas.values()].map((w) => [norm(w.name), w]));
const containsWord = (hay, needle) => needle && ` ${hay} `.includes(` ${needle} `);

const unmatched = [];
for (const d of desks) {
  const w = wilayas.get(Number(d.code_wilaya)) || wilayaByName.get(norm(d.wilaya));
  if (!w) { unmatched.push(d.name); continue; }

  const nName = norm(d.name.replace(/^\s*\d+\s*-?\s*/, ""));
  const nCommune = norm(d.commune);
  const wName = norm(w.name);
  const cities = w.cities.map((c) => ({ c, n: norm(c) }));

  // 1. Station name mentions a specific bureau city (e.g. "Station Azazga (tizi ouzou)").
  let city = cities.find((x) => x.n !== wName && containsWord(nName, x.n))?.c;
  // 2. API commune is one of the bureau cities.
  if (!city) city = cities.find((x) => x.n === nCommune)?.c;
  // 3. Station name mentions the wilaya's main city (e.g. "Station Constantine-Sidi Mebrouk").
  if (!city) city = cities.find((x) => containsWord(nName, x.n))?.c;

  w.desks.push({
    city: city || null,
    apiCommune: d.commune || null,
    name: d.name.replace(/\s+/g, " ").trim(),
    address: d.adresse && d.adresse.trim() ? d.adresse.trim() : null,
    phone: d.phone || null,
    phone2: d.phone2 || null,
    map: cleanMapUrl(d.map),
  });
}

const out = [...wilayas.values()].sort((a, b) => a.code - b.code);
const generated = new Date().toISOString();
fs.writeFileSync(
  OUT_PATH,
  "// Generated by tools/build-data.js — do not edit by hand.\n" +
    `window.BUREAU_DATA = ${JSON.stringify({ generated, wilayas: out })};\n`
);

// Report for the person maintaining the data.
let total = 0, noMap = 0, noCity = 0;
for (const w of out) for (const d of w.desks) {
  total++;
  if (!d.map) noMap++;
  if (!d.city) { noCity++; console.log(`  desk without CSV city: ${w.name} — ${d.name} (API commune: ${d.apiCommune})`); }
}
for (const w of out) for (const c of w.cities)
  if (!w.desks.some((d) => d.city === c)) console.log(`  CSV city without API desk: ${w.name} — ${c}`);
console.log(`wilayas: ${out.length}, desks: ${total}, without map: ${noMap}, without city: ${noCity}, unmatched wilaya: ${unmatched.length}`);
