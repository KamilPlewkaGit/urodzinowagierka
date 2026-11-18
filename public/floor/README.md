# Materiały The Floor

| Kategoria | Obecny plik pod `public/floor/` | Zawartość |
| --- | --- | --- |
| Znajome twarze | `znajome-twarze/znane_twarze_z_obrazami.json` | 29 osadzonych obrazów PNG |
| Lokalne miejsca | `lokalne-miejsca/miejsca.json` | 50 wpisów z odwołaniami do zdjęć |
| Loga | `loga/logotypy_z_obrazami.json` | 50 osadzonych obrazów PNG |
| Od tyłu | `od_tylu/od_tylu.json` | 48 zagadek tekstowych |
| Działania | `działania/The_Floor_DZIALANIA_100_z_obrazami.json` | 100 osadzonych obrazów PNG |
| Rebusy | `rebus/rebusy.json` | 28 grafik PNG z tego samego folderu |

Katalog `rebus/` zawierał grafiki bez pliku JSON. Plik `rebusy.json` wymienia je w polskiej kolejności alfabetycznej i używa nazw plików jako odpowiedzi. Ładowarka obsługuje również nazwę folderu `rebusy/`. Kolejność w tablicy JSON decyduje o przebiegu pojedynku. Jeśli masz listę trudności, ustaw ją w JSON-ie przed rozpoczęciem segmentu.

## Format

Plik może zawierać samą tablicę pozycji albo obiekt z polem `items` i opcjonalnym polem `category`. Serwer szuka rekurencyjnie i rozpoznaje kategorię po folderze, nazwie pliku lub polu `category`. Dla jednej kategorii użyj jednego pliku. Przykład dla JSON-u zapisanego obok `atlas.png`:

```json
{
  "category": "Rebusy",
  "items": [
    { "id": 1, "answer": "atlas", "image": "atlas.png" }
  ]
}
```

- `image` przyjmuje ścieżkę względną wobec JSON-u, publiczną ścieżkę `/floor/…`, bezpośredni adres HTTPS lub osadzone dane obrazu. Obsługiwane formaty to PNG, JPG/JPEG, WebP, AVIF i GIF.
- `photo` stosuje ten sam format. W zestawie **Lokalne miejsca** lokalna kopia zdjęcia obok pliku JSON ma pierwszeństwo. Dla wpisu z Wikimedia Commons pole `source` wskazuje stronę pliku, z której ładowarka wyznacza adres obrazu. Pozostałe istniejące wpisy wskazują bezpośredni adres HTTPS w polu `photo`.
- `display` pokazuje zagadkę tekstową, a `expression` jest widocznym działaniem, jeśli pozycja nie zawiera odwołania do obrazu. `answer` i `name` mogą zawierać odpowiedź lub opis. Indeks w tablicy wyznacza kolejność bez względu na wartość `id` lub `n`. Materiały w `public/` są publicznie dostępne.

## Błędy i wdrożenie

Brak pliku, pusty zestaw, zły format JSON i duplikaty są zgłaszane po polsku. Błąd jednego obrazu zachowuje jego miejsce w kolejności. Prowadzący może użyć **Pomiń**, a zegar i pozostałe kontrolki pozostają dostępne. Zewnętrzne zdjęcia zależą od dostępności źródła. Gdy chcesz zastąpić niedostępne zdjęcie jego lokalną kopią, użyj wpisu `image` z poprawną ścieżką.

Po zmianie plików zrestartuj serwer lokalny lub wykonaj nowe wdrożenie Vercel. W trakcie rozgrywki zachowaj kolejność tablicy, ponieważ baza przechowuje indeks bieżącej zagadki.
