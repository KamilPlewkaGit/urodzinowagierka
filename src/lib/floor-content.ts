import "server-only";

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { z } from "zod";

import { THE_FLOOR_CATEGORY_IDS, THE_FLOOR_CATEGORY_META } from "@/lib/floor";
import type { TheFloorContent, TheFloorPreloadManifest, TheFloorPrompt } from "@/lib/types";

const floorDirectory = join(process.cwd(), "public", "the floor");
const imageExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const imageMimes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const optionalText = z.string().trim().nullish();
const itemSchema = z.object({
  id: z.union([z.string().trim().min(1).max(100), z.number().int().positive()]).optional(),
  n: z.number().int().positive().optional(),
  display: optionalText,
  expression: optionalText,
  image: optionalText,
  photo: optionalText,
  source: optionalText,
  provider: optionalText,
  imageLookup: z.object({ article: z.string() }).optional(),
  answer: z.union([optionalText, z.number().transform(String)]),
  name: optionalText,
});
const orderedItems = z.array(z.unknown()).max(32_768);
const categorySchema = z.union([orderedItems, z.object({ items: orderedItems }).transform((data) => data.items)]);

type CategoryId = keyof typeof THE_FLOOR_CATEGORY_META;
type FloorItem = z.infer<typeof itemSchema>;
type RasterSource = { kind: "embedded"; mime: string; base64: string } | { kind: "remote"; url: string } | { kind: "local"; path: string; mime: string };
type ItemPrompt = Exclude<TheFloorPrompt, { kind: "image" }> | RasterSource;
type CatalogItem = { key: string; prompt: TheFloorPrompt; answer: string | null };
type Deck = { items: CatalogItem[]; error: string | null };
type Catalog = { decks: Map<CategoryId, Deck>; assets: Map<string, RasterSource>; manifest: TheFloorPreloadManifest };

const categoryIds = THE_FLOOR_CATEGORY_IDS;
const imageNotFound = "Nie znaleziono obrazu. Sprawdź nazwę pliku i ścieżkę w JSON-ie.";
const rasterMimes = new Map([
  [".avif", "image/avif"], [".gif", "image/gif"], [".jpeg", "image/jpeg"], [".jpg", "image/jpeg"],
  [".png", "image/png"], [".webp", "image/webp"],
]);
let catalogPromise: Promise<Catalog> | undefined;

async function listFiles(directory = ""): Promise<string[]> {
  const entries = await readdir(join(floorDirectory, directory), { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = posix.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return entry.isFile() ? [path] : [];
  }));
  return files.flat();
}

function slug(value: string) {
  return value.normalize("NFD").toLowerCase().replace(/\p{M}/gu, "").replaceAll("ł", "l")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function resolveCategory(value: string, allowSuffix = false) {
  const name = slug(value);
  return categoryIds.find((id) => [id, ...THE_FLOOR_CATEGORY_META[id].aliases]
    .some((alias) => name === alias || (allowSuffix && name.startsWith(alias + "-"))));
}

function categoryFromPath(file: string) {
  const parts = file.split("/");
  const filename = parts.pop()!;
  return parts.reverse().map((part) => resolveCategory(part)).find(Boolean)
    ?? resolveCategory(posix.basename(filename, posix.extname(filename)), true);
}

function categoryFromData(data: unknown) {
  if (typeof data === "object" && data !== null && "category" in data && typeof data.category === "string") {
    return resolveCategory(data.category);
  }
  return undefined;
}

function locateImage(reference: string, jsonFile: string, files: Set<string>) {
  let decoded = reference;
  try { decoded = decodeURIComponent(reference); } catch { /* A filename can contain a literal percent sign. */ }
  const normalized = decoded.replaceAll("\\", "/");
  if (/^(?:\/\/|[a-z][a-z\d+.-]*:)/i.test(normalized)) return null;
  const rooted = normalized.match(/^(?:\/?public\/)?\/?the floor\/(.*)$/i);
  if (!rooted && normalized.startsWith("/")) return null;
  const path = posix.normalize(rooted ? rooted[1] : posix.join(posix.dirname(jsonFile), normalized));
  if (path.startsWith("../") || !files.has(path)) return null;
  return path;
}

function commonsImage(item: FloorItem) {
  if (item.provider !== "Wikimedia Commons" || !item.source || !item.photo) return null;
  try {
    const source = new URL(item.source);
    if (source.origin !== "https://commons.wikimedia.org" || !source.pathname.startsWith("/wiki/File:")) return null;
    const title = decodeURIComponent(source.pathname.slice("/wiki/File:".length)).replaceAll(" ", "_");
    if (!title || title.includes("/") || title.includes("\\")) return null;
    const hash = createHash("md5").update(title).digest("hex");
    return `https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(title)}`;
  } catch {
    return null;
  }
}

function imageItem(reference: string, item: FloorItem, jsonFile: string, files: Set<string>): ItemPrompt {
  if (reference.startsWith("data:")) {
    const match = /^data:([^;,]+);base64,([a-z\d+/]+={0,2})$/i.exec(reference);
    const mime = match?.[1].toLowerCase();
    const base64 = match?.[2];
    if (mime && imageMimes.has(mime) && base64 && base64.length % 4 === 0) {
      return { kind: "embedded", mime, base64 };
    }
    return { kind: "error", message: "Osadzony obraz jest uszkodzony lub ma nieobsługiwany format." };
  }

  const localPath = locateImage(reference, jsonFile, files);
  if (localPath) {
    const mime = rasterMimes.get(posix.extname(localPath).toLowerCase());
    if (mime) return { kind: "local", path: localPath, mime };
  }
  let url: string | null = null;
  if (!url) {
    if (/^https:\/\//i.test(reference)) {
      try {
        const remote = new URL(reference);
        if (remote.username || remote.password) return { kind: "error", message: imageNotFound };
        url = remote.href;
      } catch {
        return { kind: "error", message: imageNotFound };
      }
    } else if (!item.image) {
      url = commonsImage(item);
    }
  }
  if (!url) return { kind: "error", message: imageNotFound };
  const path = new URL(url, "https://floor.invalid").pathname;
  if (!imageExtensions.has(posix.extname(path).toLowerCase())) {
    return { kind: "error", message: "Nieobsługiwany format obrazu. Użyj PNG, JPG, WebP, AVIF lub GIF." };
  }
  return { kind: "remote", url };
}

function normalizePrompt(item: FloorItem, id: CategoryId, jsonFile: string, files: Set<string>): ItemPrompt {
  if (id === "dzialania" && item.expression) {
    return { kind: "text", text: item.expression.replace(/\s*[*/]\s*/g, (operator) => operator.includes("*") ? " × " : " ÷ ") };
  }
  if (id === "od-tylu" && item.display) return { kind: "text", text: item.display.toLocaleUpperCase("pl-PL") };
  const reference = item.image || item.photo;
  if (reference) return imageItem(reference, item, jsonFile, files);
  if (item.imageLookup) return { kind: "error", message: "Brakuje przygotowanego zdjęcia z Wikipedii. Uzupełnij pole obrazu w pliku kategorii." };
  const text = item.display || item.expression;
  if (text) return { kind: "text", text };
  return { kind: "error", message: "W tej pozycji brakuje obrazu lub tekstu do wyświetlenia." };
}

async function normalizeItem(
  value: unknown, id: CategoryId, file: string, files: Set<string>, assets: Map<string, RasterSource>, index: number,
): Promise<CatalogItem> {
  const parsed = itemSchema.safeParse(value);
  const item = parsed.success ? parsed.data : null;
  const key = item?.id ?? item?.n;
  const answer = item?.answer || item?.name || null;
  const source = item ? normalizePrompt(item, id, file, files)
    : { kind: "error" as const, message: "Pozycja w pliku JSON ma nieprawidłowe dane." };
  let prompt: TheFloorPrompt;
  if (source.kind === "error" || source.kind === "text") {
    prompt = source;
  } else {
    try {
      const hash = createHash("sha256");
      if (source.kind === "local") hash.update(await readFile(join(floorDirectory, source.path)));
      else hash.update(source.kind === "remote" ? source.url : source.base64);
      const asset = hash.digest("hex");
      assets.set(asset, source);
      prompt = { kind: "image", url: "/api/segment/floor/image?asset=" + asset };
    } catch {
      prompt = { kind: "error", message: imageNotFound };
    }
  }
  return { key: key === undefined ? "pozycja-" + (index + 1) : String(key), prompt, answer };
}

async function loadCatalog(): Promise<Catalog> {
  const assets = new Map<string, RasterSource>();
  const decks = new Map<CategoryId, Deck>();
  let paths: string[];
  try {
    paths = await listFiles();
  } catch (error) {
    console.error("[The Floor] Nie można odczytać katalogu", error);
    for (const id of categoryIds) decks.set(id, { items: [], error: "Nie można odczytać folderu z materiałami The Floor." });
    return { decks, assets, manifest: makeManifest(decks) };
  }
  const files = new Set(paths);
  const jsonFiles = paths.filter((path) => posix.extname(path).toLowerCase() === ".json").sort();
  const sources = await Promise.all(jsonFiles.map(async (file) => {
    let id = categoryFromPath(file);
    try {
      const contents = await readFile(join(floorDirectory, file), "utf8");
      const data: unknown = JSON.parse(contents.replace(/^\uFEFF/, ""));
      id ??= categoryFromData(data);
      if (!id) return null;
      const parsed = categorySchema.safeParse(data);
      if (!parsed.success) return { id, items: [], error: "Plik JSON kategorii ma nieprawidłową strukturę." };
      if (!parsed.data.length) return { id, items: [], error: "Kategoria jest pusta. Dodaj pozycje do pliku JSON." };
      const categoryId = id;
      const items = await Promise.all(parsed.data.map((item, index) => normalizeItem(item, categoryId, file, files, assets, index)));
      if (new Set(items.map(({ key }) => key)).size !== items.length) return { id, items: [], error: "Powtarzające się identyfikatory pozycji w pliku JSON." };
      return { id, items, error: null };
    } catch (error) {
      console.error("[The Floor] Nie można odczytać JSON-u", { file, error: error instanceof Error ? error.name : "Nieznany błąd" });
      return id ? { id, items: [], error: "Nie można odczytać pliku JSON kategorii. Sprawdź składnię i dostępność pliku." } : null;
    }
  }));

  for (const source of sources) {
    if (!source) continue;
    const { id, items, error } = source;
    const deck = decks.has(id) ? { items: [], error: "Znaleziono kilka plików JSON dla tej kategorii. Pozostaw jeden." } : { items, error };
    if (deck.error) console.warn("[The Floor] Problem z kategorią", { id, error: deck.error });
    decks.set(id, deck);
  }
  return { decks, assets, manifest: makeManifest(decks) };
}

function makeManifest(decks: Catalog["decks"]): TheFloorPreloadManifest {
  const urls = new Set<string>();
  const labels: Record<string, string> = {};
  const issues: string[] = [];
  for (const id of categoryIds) {
    const name = THE_FLOOR_CATEGORY_META[id].name;
    const deck = decks.get(id);
    if (!deck || deck.error) {
      issues.push(name + " – " + (deck?.error ?? "Brak pliku JSON dla tej kategorii."));
      continue;
    }
    for (const item of deck.items) {
      if (item.prompt.kind === "image") {
        urls.add(item.prompt.url);
        labels[item.prompt.url] ??= name + ", ID " + item.key;
      }
      if (item.prompt.kind === "error") issues.push(name + ", ID " + item.key + " – " + item.prompt.message);
      if (!item.answer) issues.push(name + ", ID " + item.key + " – Brak odpowiedzi w pliku JSON.");
    }
  }
  const uniqueUrls = [...urls].sort();
  const version = createHash("sha256").update(JSON.stringify([uniqueUrls, issues])).digest("hex");
  return { version, urls: uniqueUrls, labels, issues };
}

function getCatalog() {
  return catalogPromise ??= loadCatalog();
}

function getCategoryId(id: string): CategoryId | undefined {
  return categoryIds.find((candidate) => candidate === id);
}

export async function getTheFloorContent(
  categoryId: string, itemIndex: number | null, isAdmin: boolean, itemKey?: string,
): Promise<TheFloorContent> {
  const id = getCategoryId(categoryId);
  const meta = id ? THE_FLOOR_CATEGORY_META[id] : { name: "Nieznana kategoria", instructions: "" };
  const deck = id ? (await getCatalog()).decks.get(id) : undefined;
  const itemCount = deck?.items.length ?? 0;
  const categoryError = deck?.error ?? (deck ? null : "Brak pliku JSON dla tej kategorii.");
  const item = itemIndex === null ? null : itemKey === undefined
    ? deck?.items[itemIndex] : deck?.items.find(({ key }) => key === itemKey);
  const prompt = itemIndex === null || categoryError ? null
    : item?.prompt ?? { kind: "error" as const, message: "Ta pozycja jest niedostępna. Przejdź do następnej." };
  return { name: meta.name, instructions: meta.instructions, itemCount, categoryError, prompt, ...(isAdmin && itemIndex !== null ? { adminAnswer: item?.answer ?? null } : {}) };
}

export async function getTheFloorCatalogStatus() {
  const { decks, manifest } = await getCatalog();
  return { available: categoryIds.filter((id) => Boolean(decks.get(id)?.items.length)), errors: manifest.issues };
}

export async function getTheFloorPreloadManifest() {
  return (await getCatalog()).manifest;
}

export async function getTheFloorItemCounts() {
  const { decks } = await getCatalog();
  return Object.fromEntries([...decks].map(([id, deck]) => [id, deck.items.length]));
}

export async function getTheFloorDeckKeys() {
  const { decks } = await getCatalog();
  return Object.fromEntries([...decks].map(([id, deck]) => [id, deck.items.map(({ key }) => key)]));
}

export async function getTheFloorImage(asset: string) {
  const source = (await getCatalog()).assets.get(asset);
  if (source?.kind === "local") return { kind: "bytes" as const, mime: source.mime, bytes: await readFile(join(floorDirectory, source.path)) };
  if (source?.kind === "embedded") return { kind: "bytes" as const, mime: source.mime, bytes: Buffer.from(source.base64, "base64") };
  return source ?? null;
}
