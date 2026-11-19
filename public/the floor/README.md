# Materiały The Floor

| Kategoria | Plik | Zestaw |
| --- | --- | --- |
| Znajome twarze | `znajome-twarze/znane_twarze_z_obrazami.json` | 29 obrazów osadzonych |
| Lokalne miejsca | `lokalne-miejsca/miejsca.json` | 50 lokalnych zdjęć WebP i odwołania do źródeł |
| Loga | `loga/The_Floor_LOGOTYPY_BEZ_NAZWY_DO_WYSWIETLANIA.json` | 50 osadzonych grafik powiązanych ze sprawdzonymi identyfikatorami |
| Czytanie od tyłu | `od_tylu/od_tylu.json` | 48 zagadek tekstowych |
| Działania | `działania/The_Floor_DZIALANIA_100_z_obrazami.json` | 100 prostych działań |
| Rebusy | `rebus/rebusy.json` | 28 lokalnych grafik |
| Politycy | `politycy/politycy_the_floor.json` | 50 przygotowanych portretów WebP |

Plik może zawierać tablicę pozycji lub obiekt z polem `items` i opcjonalnym polem `category`. Nazwa folderu, nazwa pliku i pole kategorii pomagają rozpoznać zestaw. W pozycji `id` albo `n` jest kluczem utrwalanym w kolejności pojedynku. Pozycje Loga zachowują ID z pliku i powiązanie z osadzoną grafiką oraz odpowiedzią. Kolejność w tablicy jest używana przez aktywne zapisy sprzed losowania.

Pole `image` lub `photo` przyjmuje lokalną ścieżkę, osadzone dane obrazu albo dozwolone źródło HTTPS. Portrety pobrano z PageImages Wikipedii. `imageLookup` zachowuje tytuły artykułów, a `imageSourceUrl` wskazuje oryginał na Wikimedia Commons. Zdjęcia miejsc zachowują własne pola źródła. Grafiki są podawane pod neutralnym skrótem. Źródłowe JSON-y oraz odpowiedzi są odczytywane po stronie serwera.

`expression` i `display` określają planszę tekstową. Działania mają jedno dodawanie, odejmowanie albo mnożenie do 10 × 10. `answer` lub `name` pozostaje odpowiedzią prowadzącego.

Serwer tworzy wersjonowaną listę unikatowych grafik. Prowadzący widzi brakujące pozycje po nazwie kategorii i ID. Klienci dekodują grafiki przed rozpoczęciem pojedynku i używają tych samych adresów w trakcie gry. Po edycji materiałów zrestartuj lokalny serwer albo wdróż nową wersję.
