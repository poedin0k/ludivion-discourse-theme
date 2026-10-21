import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { parseDocument } from "yaml";

const locales = new Map(
  readdirSync(new URL("../locales/", import.meta.url)).map((file) => {
    const locale = file.replace(/\.yml$/, "");
    const document = parseDocument(
      readFileSync(new URL(`../locales/${file}`, import.meta.url), "utf8"),
      { uniqueKeys: true },
    );
    assert.deepEqual(document.errors, [], `${file}: invalid YAML`);
    const data = document.toJS();
    assert.deepEqual(Object.keys(data), [locale], `${file}: incorrect root`);
    return [locale, data[locale]];
  }),
);

function strings(data, prefix = "") {
  return Object.fromEntries(
    Object.entries(data).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "object"
        ? Object.entries(strings(value, path))
        : [[path, value]];
    }),
  );
}

function placeholders(text) {
  return [...new Set([...text.matchAll(/%\{([^}]+)\}/g)].map((m) => m[1]))].sort();
}

const english = strings(locales.get("en"));
const nonPluralKeys = Object.keys(english).filter(
  (key) => !key.startsWith("halls.topic_count."),
);

test("catalogs cover every requested Discourse locale and both Portuguese variants", () => {
  assert.deepEqual([...locales.keys()].sort(), [
    "de", "en", "es", "fr", "it", "ja", "ko", "pt", "pt_BR", "ru", "tr_TR", "zh_CN",
  ].sort());
});

for (const [locale, data] of locales) {
  test(`${locale}: complete strings, interpolation and plural forms`, () => {
    const translations = strings(data);
    assert.deepEqual(
      Object.keys(translations).filter((key) => !key.startsWith("halls.topic_count.")).sort(),
      [...nonPluralKeys].sort(),
    );
    for (const [key, text] of Object.entries(translations)) {
      assert.equal(typeof text, "string", `${locale}.${key}`);
      assert(text.trim(), `${locale}.${key}: empty text`);
      assert.deepEqual(
        placeholders(text),
        placeholders(english[key] ?? english["halls.topic_count.other"]),
        `${locale}.${key}: interpolation parameters differ`,
      );
    }
    const pluralForms = new Intl.PluralRules(locale.replaceAll("_", "-"))
      .resolvedOptions().pluralCategories;
    for (const form of pluralForms) {
      assert(data.halls.topic_count[form], `${locale}: missing ${form} plural`);
    }
    assert.equal(Object.keys(translations).some((key) => key.includes("theme_metadata")), false);
  });
}

test("all UI translation keys used by the components exist in the base catalog", () => {
  const files = ["api-initializers/ludivion-theme.gjs", "components/forum-music.gjs"];
  const source = files.map((file) => readFileSync(
    new URL(`../javascripts/${file}`, import.meta.url), "utf8",
  )).join("\n");
  const keys = new Set([...source.matchAll(
    /["']((?:brand|hero|archive|social|halls|latest|music)\.[a-z_.]+)["']/g,
  )].map((match) => match[1]));
  for (const identity of ["oracle", "journey", "seekers", "technical", "commons"]) {
    for (const field of ["code", "title", "description", "subtitle"]) {
      keys.add(`halls.${identity}.${field}`);
    }
  }
  for (const key of keys) {
    assert(english[key] || key === "halls.topic_count", `Missing UI translation: ${key}`);
  }
  for (const key of nonPluralKeys) {
    assert(keys.has(key), `Unused translation: ${key}`);
  }
});
