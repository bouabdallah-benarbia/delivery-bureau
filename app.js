(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    input: $("search"), list: $("suggestions"), select: $("wilaya-select"),
    status: $("status"), results: $("results"),
    citiesTitle: $("cities-title"), citiesCount: $("cities-count"), cityList: $("city-list"),
    copyBtn: $("copy-btn"), copyLocationsBtn: $("copy-locations-btn"), tarifs: $("tarifs"),
    bureausTitle: $("bureaus-title"), bureauGroups: $("bureau-groups"),
    toast: $("toast"), dataNote: $("data-note"),
  };

  const SITE_TITLE = "دليل مكاتب التوصيل";

  const data = window.BUREAU_DATA;
  if (!data || !Array.isArray(data.wilayas) || !data.wilayas.length) {
    els.status.innerHTML = '<div class="notice error">تعذّر تحميل بيانات المكاتب. تأكد من وجود الملف <code>data.js</code> بجانب <code>index.html</code>.</div>';
    els.input.disabled = true;
    return;
  }

  const wilayas = data.wilayas;
  const byCode = new Map(wilayas.map((w) => [w.code, w]));
  const index = BureauSearch.buildIndex(wilayas);
  const pad = (n) => String(n).padStart(2, "0");
  const wName = (w) => w.ar || w.name;
  const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
  let current = null;
  let suggestions = [];
  let active = -1;

  // Arabic number agreement: [one, two, 3–10, 11+].
  function count(n, [one, two, few, many]) {
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return `${n} ${few}`;
    return `${n} ${many}`;
  }
  const citiesWord = ["مدينة واحدة", "مدينتان", "مدن", "مدينة"];
  const bureausWord = ["مكتب واحد", "مكتبان", "مكاتب", "مكتبًا"];
  const locationsWord = ["موقع واحد", "موقعان", "مواقع", "موقعًا"];

  // --- helpers ---------------------------------------------------------------
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2400);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for file:// pages and older browsers.
      const ta = el("textarea", { readonly: "", style: "position:fixed;opacity:0" });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }
  const COPY_FAILED = "تعذّر النسخ — يرجى النسخ يدويًا";

  // --- browse select -----------------------------------------------------------
  for (const w of wilayas) {
    els.select.append(el("option", { value: w.code, text: `${pad(w.code)} — ${wName(w)} · ${w.name}` }));
  }
  els.select.addEventListener("change", () => {
    if (els.select.value) selectWilaya(Number(els.select.value));
  });

  // --- autocomplete ----------------------------------------------------------
  function renderSuggestions() {
    els.list.innerHTML = "";
    const q = els.input.value.trim();
    if (!q) return closeSuggestions();
    if (!suggestions.length) {
      els.list.append(el("li", { class: "s-empty", text: `لا توجد ولاية أو بلدية تطابق «${q}».` }));
    }
    suggestions.forEach((s, i) => {
      const main = el("span", null,
        el("bdi", { class: "s-main", text: s.type === "city" ? s.label : wName(s.wilaya) }),
        s.type === "city"
          ? el("span", { class: "s-sub", text: ` — ${wName(s.wilaya)}` })
          : el("span", { class: "s-sub" }, " · ", el("bdi", { text: `${pad(s.wilaya.code)} · ${s.wilaya.name}` }))
      );
      const tag = s.type === "wilaya"
        ? el("span", { class: "s-tag has", text: "ولاية" })
        : el("span", { class: "s-tag" + (s.hasBureau ? " has" : ""), text: s.hasBureau ? "يوجد مكتب" : "لا يوجد مكتب" });
      const noBureau = s.type === "city" && !s.hasBureau;
      const li = el("li", { role: "option", id: `opt-${i}`, class: noBureau ? "no-bureau" : null, "aria-selected": i === active ? "true" : "false" }, main, tag);
      li.addEventListener("mousedown", (e) => { e.preventDefault(); choose(i); });
      els.list.append(li);
    });
    els.list.hidden = false;
    els.input.setAttribute("aria-expanded", "true");
    els.input.setAttribute("aria-activedescendant", active >= 0 ? `opt-${active}` : "");
  }

  function closeSuggestions() {
    els.list.hidden = true;
    els.input.setAttribute("aria-expanded", "false");
    els.input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function choose(i) {
    const s = suggestions[i];
    if (!s) return;
    els.input.value = s.type === "city" ? `${s.label} — ${wName(s.wilaya)}` : wName(s.wilaya);
    closeSuggestions();
    selectWilaya(s.wilaya.code, s.type === "city" ? s.label : null);
    els.input.blur();
  }

  els.input.addEventListener("input", () => {
    suggestions = BureauSearch.search(index, els.input.value, 8);
    active = suggestions.length ? 0 : -1;
    renderSuggestions();
  });
  els.input.addEventListener("focus", () => {
    if (els.input.value.trim() && suggestions.length) renderSuggestions();
  });
  els.input.addEventListener("blur", () => setTimeout(closeSuggestions, 100));
  els.input.addEventListener("keydown", (e) => {
    const open = !els.list.hidden && suggestions.length;
    if (e.key === "ArrowDown" && open) { e.preventDefault(); active = (active + 1) % suggestions.length; renderSuggestions(); scrollActive(); }
    else if (e.key === "ArrowUp" && open) { e.preventDefault(); active = (active - 1 + suggestions.length) % suggestions.length; renderSuggestions(); scrollActive(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (!suggestions.length) suggestions = BureauSearch.search(index, els.input.value, 8);
      if (suggestions.length) choose(Math.max(active, 0));
    } else if (e.key === "Escape") closeSuggestions();
  });
  function scrollActive() {
    const node = document.getElementById(`opt-${active}`);
    if (node) node.scrollIntoView({ block: "nearest" });
  }

  // --- results ---------------------------------------------------------------
  function selectWilaya(code, fromCity, skipHistory) {
    const w = byCode.get(code);
    if (!w) return;
    current = w;
    els.select.value = String(code);
    if (!skipHistory) {
      const hash = `#w=${code}`;
      if (location.hash !== hash) history.pushState(null, "", hash);
    }
    document.title = `${wName(w)} — ${SITE_TITLE}`;
    renderCities(w, fromCity);
    renderBureaus(w);
    els.status.innerHTML = "";
    els.results.hidden = false;
  }

  function renderCities(w, fromCity) {
    els.citiesTitle.textContent = `${wName(w)} — المدن المتوفرة`;
    const n = w.cities.length;
    let text = n ? `${count(n, citiesWord)} بها مكاتب توصيل.` : "";
    if (fromCity && !w.cities.some((c) => BureauSearch.normalize(c) === BureauSearch.normalize(fromCity))) {
      text += ` لا يوجد مكتب في ${fromCity} — هذه أقرب الخيارات في ولاية ${wName(w)}.`;
    }
    els.citiesCount.textContent = text;
    els.cityList.innerHTML = "";
    if (!n) {
      els.cityList.append(el("li", { class: "muted", text: `لا توجد مدن بها مكاتب توصيل في ولاية ${wName(w)}.` }));
    }
    for (const c of w.cities) els.cityList.append(el("li", null, el("bdi", { text: c })));
    els.copyBtn.disabled = !n;

    const t = [];
    if (w.tarifStopdesk != null) t.push(`التوصيل إلى المكتب: ${w.tarifStopdesk} دج`);
    if (w.tarifHome != null) t.push(`التوصيل إلى المنزل: ${w.tarifHome} دج`);
    els.tarifs.textContent = t.join(" · ");
  }

  function bureauCard(d) {
    const rows = el("dl", null,
      el("dt", { text: "المكتب" }), el("dd", { dir: "auto", text: d.name }),
      el("dt", { text: "العنوان" }),
      d.address ? el("dd", { dir: "auto", text: d.address }) : el("dd", { class: "missing", text: "العنوان غير متوفر" }),
    );
    if (d.phone) rows.append(el("dt", { text: "الهاتف" }), el("dd", null, el("bdi", { dir: "ltr", text: [d.phone, d.phone2].filter(Boolean).join(" / ") })));

    const card = el("div", { class: "bureau" }, rows);
    if (d.map) {
      const a = el("a", { class: "map-link", href: d.map, target: "_blank", rel: "noopener noreferrer" });
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
      a.append("فتح في خرائط Google");
      const copy = el("button", { type: "button", class: "copy-link" });
      copy.innerHTML = COPY_ICON;
      copy.append("نسخ الموقع");
      copy.addEventListener("click", async () => {
        const ok = await copyText(d.map);
        toast(ok ? `تم نسخ موقع ${d.name}` : COPY_FAILED);
      });
      card.append(el("div", { class: "bureau-actions" }, a, copy));
    } else {
      card.append(el("span", { class: "map-missing", text: "الموقع على الخريطة غير متوفر" }));
    }
    return card;
  }

  function renderBureaus(w) {
    els.bureausTitle.textContent = `مواقع مكاتب التوصيل — ${wName(w)}`;
    els.bureauGroups.innerHTML = "";
    els.copyLocationsBtn.disabled = !w.desks.some((d) => d.map);

    if (!w.cities.length && !w.desks.length) {
      els.bureauGroups.append(el("div", { class: "notice", text: `لا توجد مواقع لمكاتب التوصيل في ولاية ${wName(w)}.` }));
      return;
    }

    for (const city of w.cities) {
      const desks = w.desks.filter((d) => d.city === city);
      const h = el("h3", null, el("bdi", { text: city }), el("span", { class: "count", text: desks.length ? count(desks.length, bureausWord) : "" }));
      const group = el("article", { class: "city-group" }, h);
      if (!desks.length) group.append(el("p", { class: "group-empty", text: "لم تُرجع واجهة البيانات أي موقع لمكتب في هذه المدينة." }));
      desks.forEach((d) => group.append(bureauCard(d)));
      els.bureauGroups.append(group);
    }

    // API bureaus that do not belong to any city in the cities file.
    const others = w.desks.filter((d) => !d.city);
    if (others.length) {
      const group = el("article", { class: "city-group" },
        el("h3", null, `مكاتب أخرى في ولاية ${wName(w)}`, el("span", { class: "group-note", text: "غير موجودة في قائمة المدن" })));
      for (const d of others) {
        const card = bureauCard(d);
        if (d.apiCommune) card.querySelector("dl").prepend(el("dt", { text: "البلدية" }), el("dd", { dir: "auto", text: d.apiCommune }));
        group.append(card);
      }
      els.bureauGroups.append(group);
    }
  }

  // One line per bureau with a verified map link: "City — Bureau: link".
  els.copyLocationsBtn.addEventListener("click", async () => {
    if (!current) return;
    const lines = current.desks
      .filter((d) => d.map)
      .sort((a, b) => current.cities.indexOf(a.city ?? "") - current.cities.indexOf(b.city ?? ""))
      .map((d) => `${d.city || d.apiCommune || current.name} — ${d.name}: ${d.map}`);
    if (!lines.length) return toast(`لا توجد مواقع على الخريطة في ولاية ${wName(current)}`);
    const ok = await copyText(lines.join("\n"));
    toast(ok ? `تم نسخ ${count(lines.length, locationsWord)} من ولاية ${wName(current)}` : COPY_FAILED);
  });

  els.copyBtn.addEventListener("click", async () => {
    if (!current || !current.cities.length) return;
    const ok = await copyText(current.cities.join("\n"));
    toast(ok ? `تم نسخ ${count(current.cities.length, citiesWord)} من ولاية ${wName(current)}` : COPY_FAILED);
  });

  // --- history ---------------------------------------------------------------
  function fromHash() {
    const m = /w=(\d+)/.exec(location.hash);
    if (m && byCode.has(Number(m[1]))) {
      const w = byCode.get(Number(m[1]));
      els.input.value = wName(w);
      selectWilaya(w.code, null, true);
    } else {
      current = null;
      els.results.hidden = true;
      els.select.value = "";
      els.input.value = "";
      document.title = SITE_TITLE;
      showIntro();
    }
  }
  function showIntro() {
    els.status.innerHTML = "";
    els.status.append(el("div", { class: "notice", text: "اكتب اسم ولاية أو بلدية في خانة البحث لمعرفة أماكن مكاتب التوصيل." }));
  }
  window.addEventListener("popstate", fromHash);

  const totalDesks = wilayas.reduce((s, w) => s + w.desks.length, 0);
  els.dataNote.textContent = `${wilayas.length} ولاية · ${totalDesks} مكتبًا · آخر تحديث للبيانات ${new Date(data.generated).toLocaleDateString("ar-DZ")}`;
  fromHash();
})();
