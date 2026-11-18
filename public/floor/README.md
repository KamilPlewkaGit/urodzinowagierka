# Materiały graficzne The Floor

W tej wersji repozytorium nie było plików `The Floor.docx`, `50_logotypow_znanych_marek(1).pdf` ani albumu miejsc wskazanego poza workspace. Mechanika działa więc z neutralnymi kartami zastępczymi dla kategorii wymagających źródłowych obrazów.

Aby użyć właściwych grafik bez zmieniania mechaniki, dodaj po 50 plików `.webp` w kolejności łatwe → trudne:

- `public/floor/znajome-twarze/01.webp` do `50.webp`
- `public/floor/lokalne-miejsca/01.webp` do `50.webp`
- `public/floor/loga/01.webp` do `50.webp`
- `public/floor/znane-kobiety/01.webp` do `50.webp`

Nie trzeba zmieniać kodu: aplikacja automatycznie użyje tych ścieżek, a przy braku pliku pokaże neutralną kartę zastępczą. Nie zmieniaj identyfikatorów ani kolejności pozycji: zapisany pojedynek odwołuje się do kategorii i indeksu grafiki.

Karty `Od tyłu` i `Działania` są już generowane jako 50 osobnych obrazów SVG bez dodatkowych plików.
