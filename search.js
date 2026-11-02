// Search index over wilayas and communes. Tolerant of case, accents,
// punctuation, Arabic letter variants and common Latin transliteration
// differences (dj/j, ou/u, kh/k, ch/sh, doubled letters…), plus small typos.
(function () {
  "use strict";

  function normalize(s) {
    return (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")         // Latin accents
      .replace(/[ً-ٟـ]/g, "")   // Arabic diacritics + tatweel
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ]+/g, " ")
      .trim();
  }

  // Phonetic key: collapses spelling variants into one form, without spaces.
  function phonetic(s) {
    let k = normalize(s).replace(/\b(el|al|le|la|les)\b/g, "").replace(/\s+/g, "");
    k = k
      .replace(/dj/g, "j").replace(/dz/g, "z")
      .replace(/ou/g, "u").replace(/w/g, "u")
      .replace(/kh/g, "k").replace(/gh/g, "g").replace(/q/g, "k").replace(/c(?=[aou]|$)/g, "k")
      .replace(/sh|ch/g, "s").replace(/tch/g, "s")
      .replace(/ph/g, "f").replace(/th/g, "t")
      .replace(/y/g, "i").replace(/ee|ei|ai/g, "i").replace(/ae/g, "a")
      .replace(/h/g, "")
      .replace(/(.)\1+/g, "$1");
    return k;
  }

  // Optimal-string-alignment distance, capped for speed.
  function distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d = [];
    for (let i = 0; i <= a.length; i++) d[i] = [i];
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        rowMin = Math.min(rowMin, d[i][j]);
      }
      if (rowMin > max) return max + 1;
    }
    return d[a.length][b.length];
  }

  function makeTerm(text) {
    return { n: normalize(text), p: phonetic(text) };
  }

  function scoreTerm(q, t) {
    if (!t.n) return 0;
    if (t.n === q.n) return 100;
    if (t.n.startsWith(q.n)) return 90;
    if ((" " + t.n).includes(" " + q.n)) return 80;
    if (q.n.length >= 3 && t.n.replace(/ /g, "").startsWith(q.n.replace(/ /g, ""))) return 68;
    if (q.n.length >= 3 && t.n.includes(q.n)) return 65;
    if (q.p.length >= 2) {
      if (t.p === q.p) return 75;
      if (t.p.startsWith(q.p)) return 70;
      if (q.p.length >= 4 && t.p.includes(q.p)) return 55;
    }
    // Typo tolerance: compare with the same-length prefix of the term.
    if (q.p.length >= 4) {
      const max = q.p.length >= 8 ? 2 : 1;
      const dFull = distance(q.p, t.p, max);
      if (dFull <= max) return 50 - dFull * 5;
      const dPre = distance(q.p, t.p.slice(0, q.p.length), max);
      if (dPre <= max) return 42 - dPre * 5;
    }
    return 0;
  }

  function buildIndex(wilayas) {
    const entries = [];
    for (const w of wilayas) {
      const code = String(w.code);
      const terms = [w.name, w.ar, ...(w.aliases || [])].filter(Boolean).map(makeTerm);
      entries.push({ type: "wilaya", wilaya: w, label: w.name, terms, code });
      const bureauCities = new Set(w.cities.map(normalize));
      for (const c of w.communes) {
        // A commune with the same name as its wilaya is covered by the wilaya entry.
        if (normalize(c) === normalize(w.name)) continue;
        entries.push({
          type: "city", wilaya: w, label: c, terms: [makeTerm(c)],
          hasBureau: bureauCities.has(normalize(c)),
        });
      }
    }
    return entries;
  }

  function search(index, query, limit) {
    const raw = query.trim();
    if (!raw) return [];
    const q = makeTerm(raw);
    if (!q.n) return [];
    const results = [];
    for (const e of index) {
      let s = 0;
      if (e.type === "wilaya" && /^\d{1,2}$/.test(raw) && Number(raw) === e.wilaya.code) s = 110;
      for (const t of e.terms) s = Math.max(s, scoreTerm(q, t));
      if (!s) continue;
      if (e.type === "wilaya") s += 6;
      else if (e.hasBureau) s += 3;
      results.push({ entry: e, score: s });
    }
    results.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));
    // Hide weak fuzzy matches when there is a clearly better one.
    const floor = results.length ? results[0].score - 45 : 0;
    return results.filter((r) => r.score >= floor).slice(0, limit || 8).map((r) => r.entry);
  }

  window.BureauSearch = { buildIndex, search, normalize };
})();
