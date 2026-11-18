# Materiały The Floor

| Kategoria | Obecny plik pod `public/the floor/` | Zawartość |
| --- | --- | --- |
| Znajome twarze | `znajome-twarze/znane_twarze_z_obrazami.json` | 29 osadzonych obrazów PNG |
| Lokalne miejsca | `lokalne-miejsca/miejsca.json` | 50 wpisów z odwołaniami do zdjęć |
| Loga | `loga/The_Floor_LOGOTYPY_BEZ_NAZWY_DO_WYSWIETLANIA.json` | 50 osadzonych obrazów PNG |
| Czytanie od tyłu | `od_tylu/od_tylu.json` | 48 zagadek tekstowych |
| Działania | `działania/The_Floor_DZIALANIA_100_z_obrazami.json` | 100 działań z tekstem i osadzonymi obrazami PNG |
| Rebusy | `rebus/rebusy.json` | 28 grafik PNG z tego samego folderu |

Grafiki Rebusów mają neutralne nazwy plików. Kolejność w tablicy JSON wyznacza przebieg pojedynku.

## Format

Plik może zawierać samą tablicę pozycji albo obiekt z polem `items` i opcjonalnym polem `category`. Serwer szuka rekurencyjnie i rozpoznaje kategorię po folderze, nazwie pliku lub polu `category`. Dla jednej kategorii użyj jednego pliku. Przykład dla JSON-u zapisanego obok `01.png`:

```json
{
  "category": "Rebusy",
  "items": [
    { "id": 1, "answer": "atlas", "image": "01.png" }
  ]
}
```

- `image` przyjmuje ścieżkę względną wobec JSON-u, publiczną ścieżkę `/the%20floor/…`, adres HTTPS z obsługiwanych źródeł zdjęć lub osadzone dane obrazu. Obsługiwane formaty to PNG, JPG/JPEG, WebP, AVIF i GIF.
- `photo` stosuje ten sam format. W zestawie **Lokalne miejsca** lokalna kopia zdjęcia obok pliku JSON ma pierwszeństwo. Dla wpisu z Wikimedia Commons pole `source` wskazuje stronę pliku, z której ładowarka wyznacza adres obrazu. Pozostałe istniejące wpisy wskazują bezpośredni adres HTTPS w polu `photo`.
- `display` i `expression` określają treść zagadek tekstowych. `answer` ma pierwszeństwo przed `name` w widoku prowadzącego. Indeks w tablicy wyznacza kolejność. Proxy Next.js blokuje bezpośrednie pobranie źródłowych JSON-ów. Pliki graficzne dostępne publicznie powinny mieć neutralne nazwy.

## Błędy i wdrożenie

Brak pliku, pusty zestaw, zły format JSON i duplikaty są zgłaszane po polsku. Błąd jednego obrazu zachowuje jego miejsce w kolejności. Prowadzący może użyć **Pas**, a zegar i pozostałe kontrolki pozostają dostępne. Zewnętrzne zdjęcia zależą od dostępności źródła. Gdy chcesz zastąpić niedostępne zdjęcie jego lokalną kopią, użyj wpisu `image` z poprawną ścieżką.

Po zmianie plików zrestartuj serwer lokalny lub wykonaj nowe wdrożenie Vercel. W trakcie rozgrywki zachowaj kolejność tablicy, ponieważ baza przechowuje indeks bieżącej zagadki.
