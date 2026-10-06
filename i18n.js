/* Tiny i18n layer. Dictionaries live in i18n/<lang>.js (SG.I18N_DICT.<lang>), English is the fallback.
   Markup: data-i18n (text), data-i18n-html (HTML), data-i18n-title, data-i18n-placeholder.
   Changing language fires a "sg:lang" event so the game can redraw its dynamic text. */
(function () {
  "use strict";
  const SG = (window.SG = window.SG || {});
  const DICT = SG.I18N_DICT || (SG.I18N_DICT = {});
  const LANGS = {
    en: { name: "English", dir: "ltr", html: "en" },
    fr: { name: "Français", dir: "ltr", html: "fr" },
    zh: { name: "中文", dir: "ltr", html: "zh-Hans" },
    ar: { name: "العربية", dir: "rtl", html: "ar" },
  };

  function detect() {
    try { const s = localStorage.getItem("sg.lang"); if (s && LANGS[s]) return s; } catch (e) { /* storage blocked */ }
    const n = ((navigator.languages && navigator.languages[0]) || navigator.language || "en").slice(0, 2).toLowerCase();
    return LANGS[n] ? n : "en";
  }

  const I = SG.I18N = {
    langs: LANGS,
    lang: "en",
    t(key, params) {
      let s = DICT[I.lang] && DICT[I.lang][key];
      if (s == null) s = DICT.en && DICT.en[key];
      if (s == null) return key;
      if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
      return s;
    },
    apply(root) {
      root = root || document;
      root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = I.t(el.dataset.i18n); });
      root.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = I.t(el.dataset.i18nHtml); });
      root.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = I.t(el.dataset.i18nTitle); });
      root.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = I.t(el.dataset.i18nPlaceholder); });
      document.title = I.t("doc.title");
    },
    setLang(lang, persist) {
      if (!LANGS[lang]) lang = "en";
      I.lang = lang;
      const html = document.documentElement;
      html.lang = LANGS[lang].html;
      html.dir = LANGS[lang].dir;
      if (persist) { try { localStorage.setItem("sg.lang", lang); } catch (e) { /* storage blocked */ } }
      I.apply();
      document.querySelectorAll("select.lang-select").forEach(sel => { sel.value = lang; });
      window.dispatchEvent(new CustomEvent("sg:lang", { detail: lang }));
    },
  };

  // Fill every language picker with the native language names, then wire it.
  document.querySelectorAll("select.lang-select").forEach(sel => {
    sel.innerHTML = "";
    for (const [code, meta] of Object.entries(LANGS)) {
      const o = document.createElement("option");
      o.value = code; o.textContent = meta.name; o.lang = meta.html; o.dir = meta.dir;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => I.setLang(sel.value, true));
  });

  I.setLang(detect(), false);
})();
