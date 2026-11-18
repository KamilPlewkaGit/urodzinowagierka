import type { TheFloorDuel } from "@/lib/types";

export const THE_FLOOR_TITLE = "The Floor";
export const THE_FLOOR_DUEL_SECONDS = 45;
export const THE_FLOOR_PASS_PENALTY_SECONDS = 3;
export const THE_FLOOR_BET_STAKE = "2.0000";

export type TheFloorCategoryId =
  | "znajome-twarze"
  | "lokalne-miejsca"
  | "loga"
  | "od-tylu"
  | "dzialania"
  | "znane-kobiety";

export interface TheFloorItem {
  id: number;
  answer: string;
  imageUrl: string;
  fallbackImageUrl?: string;
}

export interface TheFloorCategory {
  id: TheFloorCategoryId;
  name: string;
  instructions: string;
  items: TheFloorItem[];
}

function svgCard(lines: string[], accent = "#d8b66c") {
  const text = lines.map((line, index) => `<text x="600" y="${330 + index * 115}" text-anchor="middle" fill="#f8f3e7" font-family="Arial, sans-serif" font-size="${index === 0 ? 58 : 34}" font-weight="700">${line}</text>`).join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#101116"/><rect x="32" y="32" width="1136" height="736" rx="30" fill="#17181f" stroke="${accent}" stroke-width="4"/><circle cx="600" cy="190" r="54" fill="${accent}" opacity=".18"/><path d="M570 190h60M600 160v60" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>${text}</svg>`)}`;
}

function sourceItems(category: TheFloorCategoryId, answers: readonly string[]) {
  return answers.map((answer, index) => ({
    id: index + 1,
    answer,
    imageUrl: `/floor/${category}/${String(index + 1).padStart(2, "0")}.webp`,
    fallbackImageUrl: svgCard(["GRAFIKA KATEGORII", `${String(index + 1).padStart(2, "0")} / 50`]),
  }));
}

function textItems(values: readonly string[], answerFromValue: (value: string, index: number) => string) {
  return values.map((value, index) => ({ id: index + 1, answer: answerFromValue(value, index), imageUrl: svgCard([value], "#59ce97") }));
}

const familiarFaces = [
  "Robert Lewandowski", "Lionel Messi", "Cristiano Ronaldo", "Taylor Swift", "Donald Tusk", "Iga Świątek", "Kamil Stoch", "Julia Roberts", "Leonardo DiCaprio", "Dwayne Johnson",
  "Barack Obama", "Donald Trump", "Beyoncé", "Rihanna", "Lady Gaga", "Ariana Grande", "Ed Sheeran", "Elton John", "Freddie Mercury", "Krzysztof Ibisz",
  "Robert Makłowicz", "Quebonafide", "Mata", "Sanah", "Dawid Podsiadło", "Mikołaj Kopernik", "Albert Einstein", "Stephen Hawking", "Papież Franciszek", "Król Karol III",
  "Keanu Reeves", "Johnny Depp", "Tom Hanks", "Margot Robbie", "Zendaya", "Cillian Murphy", "Billie Eilish", "Snoop Dogg", "Eminem", "Gordon Ramsay",
  "MrBeast", "Książulo", "Friz", "Blowek", "Michał Probierz", "Adam Małysz", "Janusz Korwin-Mikke", "Mariusz Pudzianowski", "Michał Szpak", "Ralph Kaminski",
] as const;

const localPlaces = [
  "Rynek w Wejherowie", "Kalwaria Wejherowska", "Pałac Przebendowskich", "Park Miejski w Wejherowie", "Filharmonia Kaszubska", "Dworzec Wejherowo", "Piaśnica", "Puszcza Darżlubska", "Ratusz w Wejherowie", "Kościół św. Anny",
  "Molo w Sopocie", "Krzywy Domek", "Monciak", "Opera Leśna", "Latarnia morska Sopot", "Stare Miasto Gdańsk", "Fontanna Neptuna", "Żuraw Gdański", "Bazylika Mariacka", "Ulica Długa",
  "Europejskie Centrum Solidarności", "Stocznia Gdańska", "Muzeum II Wojny Światowej", "Westerplatte", "Polsat Plus Arena Gdańsk", "Molo w Orłowie", "Klif Orłowski", "Skwer Kościuszki", "Dar Pomorza", "ORP Błyskawica",
  "Akwarium Gdyńskie", "Kamienna Góra", "Molo w Brzeźnie", "Jelitkowo", "Plaża w Rewie", "Cypel Rewski", "Mechelinki", "Molo w Mechelinkach", "Kępa Redłowska", "Rezerwat Beka",
  "Wieża widokowa w Kolibkach", "Sopot Kamienny Potok", "Gdańsk Oliwa", "Archikatedra Oliwska", "Park Oliwski", "Muzeum Emigracji", "Góra Gradowa", "Twierdza Wisłoujście", "Latarnia w Nowym Porcie", "Mewia Łacha",
] as const;

const logos = [
  "Nike", "Apple", "McDonald's", "Coca-Cola", "Adidas", "Google", "YouTube", "Netflix", "Facebook", "Instagram",
  "Lego", "Pepsi", "Starbucks", "Amazon", "Mercedes-Benz", "BMW", "Audi", "Porsche", "Ferrari", "PlayStation",
  "Nintendo", "Microsoft", "Samsung", "IKEA", "Lidl", "KFC", "Burger King", "Shell", "Visa", "Mastercard",
  "Spotify", "TikTok", "Snapchat", "Xiaomi", "Huawei", "Puma", "Reebok", "New Balance", "Prada", "Chanel",
  "Rolex", "Lamborghini", "Harley-Davidson", "Red Bull", "Fanta", "Subway", "Airbnb", "Dropbox", "Slack", "Patagonia",
] as const;

const backwardsWords = [
  "tac", "mod", "tak", "ret", "kot", "nos", "dom", "las", "oko", "mama",
  "tata", "ryba", "kawa", "mleko", "chleb", "buty", "zegarek", "telefon", "komputer", "samochód",
  "szkoła", "książka", "wakacje", "czekolada", "lodówka", "poduszka", "parasolka", "kalendarz", "rowerzysta", "biblioteka",
  "przyjaciel", "urodziny", "restauracja", "krokodyl", "mikrofon", "fotografia", "wyobraźnia", "mieszkanie", "przedstawienie", "skrzyżowanie",
  "odpowiedzialność", "przedsiębiorstwo", "charakterystyka", "niepodległość", "równoległobok", "prawdopodobieństwo", "elektrownia", "niedźwiedź", "wieloznaczność", "antybiotyk",
] as const;

const expressions = [
  "2 × 2", "3 + 4", "10 − 3", "5 × 3", "12 ÷ 3", "8 + 7", "20 − 9", "6 × 4", "18 ÷ 2", "9 + 8",
  "15 − 6", "7 × 7", "36 ÷ 6", "14 + 19", "50 − 23", "8 × 9", "72 ÷ 8", "25 + 17", "100 − 48", "12 × 6",
  "81 ÷ 9", "45 + 38", "90 − 37", "11 × 11", "96 ÷ 12", "125 − 67", "24 × 4", "144 ÷ 12", "39 + 56", "200 − 85",
  "15 × 8", "225 ÷ 15", "78 + 49", "300 − 127", "18 × 7", "196 ÷ 14", "125 + 88", "400 − 176", "25 × 12", "324 ÷ 18",
  "(12 + 8) × 3", "144 ÷ (8 + 4)", "17 × 9 − 20", "250 − 12 × 11", "(45 + 15) ÷ 5", "19 × 19", "500 ÷ 25", "(72 − 24) ÷ 6", "125 × 4 − 73", "(36 ÷ 3) × 14",
] as const;

const famousWomen = [
  "Maria Skłodowska-Curie", "Taylor Swift", "Beyoncé", "Rihanna", "Angelina Jolie", "Emma Watson", "Iga Świątek", "Serena Williams", "Adele", "Lady Gaga",
  "Oprah Winfrey", "Greta Thunberg", "Frida Kahlo", "Marilyn Monroe", "Audrey Hepburn", "Natalie Portman", "Jennifer Aniston", "Margot Robbie", "Zendaya", "Billie Eilish",
  "Dua Lipa", "Shakira", "Madonna", "Britney Spears", "Celine Dion", "Wisława Szymborska", "Olga Tokarczuk", "Anna Lewandowska", "Martyna Wojciechowska", "Ewa Chodakowska",
  "Maja Włoszczowska", "Justyna Kowalczyk", "Agnieszka Radwańska", "Simone Biles", "Marta", "Malala Yousafzai", "Rosa Parks", "Amelia Earhart", "Jane Goodall", "Ada Lovelace",
  "Katherine Johnson", "Hedy Lamarr", "Marie Kondo", "Meryl Streep", "Viola Davis", "Sofia Vergara", "Yoko Ono", "Jadwiga Andegaweńska", "Królowa Elżbieta II", "Virginia Woolf",
] as const;

export const THE_FLOOR_CATEGORIES: readonly TheFloorCategory[] = [
  {
    id: "znajome-twarze",
    name: "Znajome twarze",
    instructions: "Na grafikach zobaczycie zdjęcia znanych postaci – zarówno pochodzących z Wejherowa i okolic (znanych lokalnie), jak i globalnie. Podajcie ich nazwiska (lub pseudonimy). W przypadku gdy na zdjęciu pojawią się dwie osoby, wystarczy podać nazwisko jednej z nich.",
    items: sourceItems("znajome-twarze", familiarFaces),
  },
  { id: "lokalne-miejsca", name: "Lokalne miejsca", instructions: "Rozpoznajcie miejsce pokazane na grafice. Podajcie jego nazwę lub lokalizację.", items: sourceItems("lokalne-miejsca", localPlaces) },
  { id: "loga", name: "Loga", instructions: "Rozpoznajcie markę wyłącznie po jej logotypie.", items: sourceItems("loga", logos) },
  { id: "od-tylu", name: "Od tyłu", instructions: "Odczytajcie wyraz zapisany od tyłu.", items: textItems(backwardsWords.map((word) => [...word].reverse().join("")), (_, index) => backwardsWords[index] ?? "") },
  { id: "dzialania", name: "Działania", instructions: "Policzcie działanie i podajcie wynik.", items: textItems(expressions, (expression) => expression) },
  { id: "znane-kobiety", name: "Znane kobiety", instructions: "Rozpoznajcie znaną kobietę pokazaną na grafice.", items: sourceItems("znane-kobiety", famousWomen) },
];

export const THE_FLOOR_CATEGORY_COUNT = THE_FLOOR_CATEGORIES.length;

export function getTheFloorCategory(categoryId: string) {
  return THE_FLOOR_CATEGORIES.find((category) => category.id === categoryId) ?? null;
}

export function getTheFloorItem(categoryId: string, itemIndex: number) {
  return getTheFloorCategory(categoryId)?.items[itemIndex] ?? null;
}

export function getTheFloorTimes(duel: TheFloorDuel, now = Date.now()) {
  let teamA = duel.teamATimeSeconds;
  let teamB = duel.teamBTimeSeconds;
  if (duel.stage === "live" && duel.activeTeamId !== null && duel.turnStartedAt) {
    const elapsed = Math.max(0, Math.floor((now - new Date(duel.turnStartedAt).getTime()) / 1000));
    if (duel.activeTeamId === duel.teamAId) teamA = Math.max(0, teamA - elapsed);
    if (duel.activeTeamId === duel.teamBId) teamB = Math.max(0, teamB - elapsed);
  }
  return { teamA, teamB };
}
