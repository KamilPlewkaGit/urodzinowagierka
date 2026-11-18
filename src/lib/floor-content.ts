import "server-only";

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { z } from "zod";

import { THE_FLOOR_CATEGORY_IDS, THE_FLOOR_CATEGORY_META } from "@/lib/floor";
import type { TheFloorContent, TheFloorPrompt } from "@/lib/types";

const floorDirectory = join(process.cwd(), "public", "the floor");
const imageExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const imageMimes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const optionalText = z.string().trim().nullish();
const itemSchema = z.object({
  display: optionalText,
  expression: optionalText,
  image: optionalText,
  photo: optionalText,
  source: optionalText,
  provider: optionalText,
  answer: z.union([optionalText, z.number().transform(String)]),
  name: optionalText,
});
const orderedItems = z.array(z.unknown()).max(32_768);
const categorySchema = z.union([orderedItems, z.object({ items: orderedItems }).transform((data) => data.items)]);

type CategoryId = keyof typeof THE_FLOOR_CATEGORY_META;
type FloorItem = z.infer<typeof itemSchema>;
type EmbeddedImage = { mime: string; base64: string };
type ItemPrompt = TheFloorPrompt | { kind: "embedded"; image: EmbeddedImage } | { kind: "remote"; url: string };
type Deck = { items: { prompt: ItemPrompt; answer: string | null }[]; error: string | null };
type Catalog = Map<CategoryId, Deck>;

const categoryIds = THE_FLOOR_CATEGORY_IDS;
const imageNotFound = "Nie znaleziono obrazu. Sprawdź nazwę pliku i ścieżkę w JSON-ie.";
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

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
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
  return "/the%20floor/" + encodePath(path);
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
      return { kind: "embedded", image: { mime, base64 } };
    }
    return { kind: "error", message: "Osadzony obraz jest uszkodzony lub ma nieobsługiwany format." };
  }

  const localUrl = locateImage(reference, jsonFile, files);
  let url = localUrl;
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
  return { kind: localUrl ? "image" : "remote", url };
}

function normalizePrompt(item: FloorItem, id: CategoryId, jsonFile: string, files: Set<string>): ItemPrompt {
  if (id === "dzialania" && item.expression) {
    return { kind: "text", text: item.expression.replace(/\s*[*/]\s*/g, (operator) => operator.includes("*") ? " × " : " ÷ ") };
  }
  if (id === "od-tylu" && item.display) return { kind: "text", text: item.display.toLocaleUpperCase("pl-PL") };
  const reference = item.image || item.photo;
  if (reference) return imageItem(reference, item, jsonFile, files);
  const text = item.display || item.expression;
  if (text) return { kind: "text", text };
  return { kind: "error", message: "W tej pozycji brakuje obrazu lub tekstu do wyświetlenia." };
}

function normalizeItem(value: unknown, id: CategoryId, file: string, files: Set<string>, index: number) {
  const parsed = itemSchema.safeParse(value);
  const prompt = parsed.success ? normalizePrompt(parsed.data, id, file, files)
    : { kind: "error" as const, message: "Pozycja w pliku JSON ma nieprawidłowe dane." };
  const answer = parsed.success ? parsed.data.answer || parsed.data.name || null : null;
  if (prompt.kind === "error" || !answer) {
    console.warn("[The Floor] Problem z pozycją", { file, item: index + 1, error: prompt.kind === "error" ? prompt.message : undefined, missingAnswer: !answer });
  }
  return { prompt, answer };
}

async function loadCatalog(): Promise<Catalog> {
  let paths: string[];
  try {
    paths = await listFiles();
  } catch (error) {
    console.error("[The Floor] Nie można odczytać katalogu", error);
    return new Map(categoryIds.map((id) => [id, { items: [], error: "Nie można odczytać folderu z materiałami The Floor." }]));
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
      return { id, items: parsed.data.map((item, index) => normalizeItem(item, categoryId, file, files, index)), error: null };
    } catch (error) {
      console.error("[The Floor] Nie można odczytać JSON-u", { file, error: error instanceof Error ? error.name : "Nieznany błąd" });
      return id ? { id, items: [], error: "Nie można odczytać pliku JSON kategorii. Sprawdź składnię i dostępność pliku." } : null;
    }
  }));

  const catalog: Catalog = new Map();
  for (const source of sources) {
    if (!source) continue;
    const { id, items, error } = source;
    const deck = catalog.has(id) ? { items: [], error: "Znaleziono kilka plików JSON dla tej kategorii. Pozostaw jeden." } : { items, error };
    if (deck.error) console.warn("[The Floor] Problem z kategorią", { id, error: deck.error });
    catalog.set(id, deck);
  }
  return catalog;
}

function getCatalog() {
  return catalogPromise ??= loadCatalog();
}

function getCategoryId(id: string): CategoryId | undefined {
  return categoryIds.find((candidate) => candidate === id);
}

export async function getTheFloorContent(categoryId: string, itemIndex: number | null, isAdmin: boolean): Promise<TheFloorContent> {
  const id = getCategoryId(categoryId);
  const meta = id ? THE_FLOOR_CATEGORY_META[id] : { name: "Nieznana kategoria", instructions: "" };
  const deck = id ? (await getCatalog()).get(id) : undefined;
  const itemCount = deck?.items.length ?? 0;
  const categoryError = deck?.error ?? (deck ? null : "Brak pliku JSON dla tej kategorii.");
  const item = itemIndex === null ? null : deck?.items[itemIndex];
  let prompt: TheFloorPrompt | null = null;
  if (itemIndex !== null && !categoryError) {
    prompt = item?.prompt.kind === "embedded" || item?.prompt.kind === "remote"
      ? { kind: "image", url: `/api/segment/floor/image?category=${categoryId}&item=${itemIndex}` }
      : item?.prompt ?? { kind: "error", message: "Ta pozycja jest niedostępna. Przejdź do następnej." };
  }
  return { name: meta.name, instructions: meta.instructions, itemCount, categoryError, prompt, ...(isAdmin && itemIndex !== null ? { adminAnswer: item?.answer ?? null } : {}) };
}

export async function getTheFloorCatalogStatus() {
  const catalog = await getCatalog();
  const available = categoryIds.filter((id) => Boolean(catalog.get(id)?.items.length));
  const errors = categoryIds.flatMap((id) => {
    const deck = catalog.get(id);
    const message = deck ? deck.error : "Brak pliku JSON dla tej kategorii.";
    return message ? [`${THE_FLOOR_CATEGORY_META[id].name} – ${message}`] : [];
  });
  return { available, errors };
}

export async function getTheFloorItemCounts() {
  const catalog = await getCatalog();
  return Object.fromEntries([...catalog].map(([id, deck]) => [id, deck.items.length]));
}

export async function getTheFloorImage(categoryId: string, itemIndex: number) {
  const id = getCategoryId(categoryId);
  const prompt = id ? (await getCatalog()).get(id)?.items[itemIndex]?.prompt : undefined;
  return prompt?.kind === "embedded" || prompt?.kind === "remote" ? prompt : null;
}
