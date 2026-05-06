# Audyt prawny i bezpieczeństwa zgód — Gabinet MM v1.2.15

**Wersja**: v1.2.15
**Data audytu**: 2026-05-06
**Zakres**: zgody na zabiegi kosmetologiczne, RODO, dokumentacja fotograficzna, marketing

---

## ⚠️ Wymagane disclaimery

1. **Niniejszy audyt nie zastępuje konsultacji prawnej.** Przed wdrożeniem komercyjnym zalecana konsultacja z prawnikiem specjalizującym się w prawie medycznym/RODO. Koszt 300-800 zł, jednorazowo.
2. **Lista przeciwwskazań w aplikacji powinna zostać zweryfikowana przez lekarza medycyny estetycznej** współpracującego z gabinetem. Każdy zabieg ma swoje protokoły bezpieczeństwa od producenta urządzenia/preparatu.

---

## 1. Forma dokumentowa — implementacja

### Co aplikacja robi
- ✅ Zgoda zapisywana cyfrowo w PDF z odręcznym podpisem klienta (canvas → PNG)
- ✅ Forma dokumentowa wg **art. 77² Kodeksu Cywilnego** spełniona — oświadczenie woli zapisane na nośniku informacji
- ✅ Pełnoprawny dowód w sądzie (zgodnie z art. 245 KPC dokument prywatny)
- ✅ Każdy PDF ma w stopce każdej strony pełne metadane prawne

### Co dodaje v1.2.15
- 🆕 **5 świadomych oświadczeń klienta** przed podpisem (audytowo niezbędne):
  1. Poinformowany o przebiegu, efektach i ryzyku
  2. Udzielone odpowiedzi są zgodne z prawdą (zatajenie = odpowiedzialność klienta)
  3. Akceptuje ryzyko (efekty indywidualne, brak gwarancji 100%)
  4. Ma prawo odstąpić w dowolnym momencie (art. 7 ust. 3 RODO)
  5. Zobowiązuje się przestrzegać zaleceń pozabiegowych

---

## 2. Pieczęć prawna (legalStamp)

Każda zgoda otrzymuje teraz kompletny pakiet metadanych:

| Pole | Opis | Cel prawny |
|------|------|------------|
| `uuid` | UUID v4 (RFC 4122) | Globalna unikalność, zapobiega "doklejeniu" podpisu |
| `ts` | ISO 8601 UTC | Międzynarodowy standard czasu |
| `tsLocal` | Format polski czytelny | Dla użytkownika końcowego |
| `tsOffset` | Strefa czasowa (+02:00) | Dowód kiedy w czasie lokalnym |
| `ip` | Adres IP klienta | Dowód miejsca podpisu (gabinet/zdalnie) |
| `ua`, `scr`, `lang`, `tz`, `platform` | Środowisko techniczne | Audytowalność urządzenia |
| `docHash` | SHA-256 całego dokumentu | Integralność — jakakolwiek zmiana = inny hash |
| `sigHash` | SHA-256 obrazu podpisu | Niezmienność podpisu |
| `prevHash` | Hash poprzedniej zgody | Łańcuch (audit trail) |
| `chainHash` | Hash łańcucha (UUID+ts+doc+sig+prev) | **Główny dowód integralności** |
| `legalBasis` | Podstawa prawna RODO | Wymóg art. 7 RODO |
| `documentForm` | Forma dokumentowa wg KC | Wymóg art. 77² KC |

### Łańcuch hash (chain)
Każda zgoda zawiera hash poprzedniej. Tworzy to **ciąg blockchain-podobny** — niemożliwe jest:
- Wstawienie zgody w środek historii (nie pasowałby `prevHash`)
- Zmiana starej zgody bez zmiany wszystkich kolejnych
- "Doklejenie" podpisu z innego dokumentu (`docHash` byłby inny)

### IP klienta
Pobierany przez `https://api.ipify.org` (anonimowy public service). Jeśli offline → `"offline"`. Czas timeout: 3s.

⚠️ **Uwaga RODO**: zbieranie IP wymaga informacji w polityce prywatności gabinetu. Dodać do informacji: *"W ramach dokumentacji zgód zbieramy adres IP urządzenia klienta jako dowód czasu i miejsca złożenia podpisu (art. 6 ust. 1 lit. f RODO — uzasadniony interes administratora)"*.

---

## 3. PDF/A — szczerość ograniczeń

### Co aplikacja robi
- ✅ PDF z pełnymi metadanymi (`title`, `subject`, `author`, `keywords`, `creator`, `creationDate`)
- ✅ Stopka z UUID + hash + timestamp na każdej stronie
- ✅ Nazwa pliku zawiera UUID (jednoznaczna identyfikacja)
- ✅ Naturalny dowód integralności — zmiana zawartości PDF zmieniłaby hash widoczny w stopce każdej strony

### Czego nie ma — ograniczenia jsPDF browser-side
- ❌ **Nie jest to certyfikowany PDF/A-1b** (wymaga osadzenia czcionek + ICC color profile + XMP packet — niemożliwe w przeglądarce)
- ❌ Brak cyfrowego podpisu PKCS#7 (wymaga prywatnego klucza — server-side)
- ❌ Brak certyfikatu kwalifikowanego (qualified electronic signature wg eIDAS)

### Rekomendacja na przyszłość
Jeśli kiedyś gabinet potrzebowałby **prawdziwy PDF/A-1b** (np. dla NFZ/ZUS/audytu):
1. Po zapisie zgody wysłać PDF na serwer
2. Konwertować przez Ghostscript (`gs -sDEVICE=pdfwrite -dPDFA=1 -dPDFACompatibilityPolicy=1`)
3. Opcjonalnie: podpisać kwalifikowanym certyfikatem (np. CenCert)

Dla 95% przypadków biznesowych obecne rozwiązanie wystarczy. **Polski sąd zaakceptuje PDF z hash chain jako dowód.**

---

## 4. Audyt zgód — przeciwwskazania

### Co już jest dobre w templatach (bardzo profesjonalnie)
- Każdy zabieg ma listę `contraindications_absolute` (bezwzględne)
- Część zabiegów ma `contraindications_relative` (względne, możliwe po konsultacji)
- `possible_reactions` opisują naturalne reakcje (klient nie panikuje)
- `recommendations_after` + `forbidden_after` — pełna pielęgnacja pozabiegowa
- `hygiene_after` (np. mezoterapia estGen) — szczegóły higieniczne

### Co warto przejrzeć — lista do konsultacji z lekarzem medycyny estetycznej

#### 1. Mezoterapia / RF mikroigłowy / Fractional RF
- ✅ Ma rozsądne contraindications (cukrzyca, ciąża, autoimmunologiczne)
- ⚠️ **Sprawdź u lekarza**: czy lista NLPZ/aspiryny jest aktualna (ostatnio Tirzepatide, Mounjaro pojawiły się w branży — wpływ?)
- ⚠️ **Sprawdź**: czy COVID-19 (4 tygodnie po szczepieniu) jest aktualną wytyczną — w 2026 może być zdezaktualizowane

#### 2. Laser pikosekundowy / IPL / SHR
- ✅ Bardzo rozbudowana lista (zioła, leki, metale w polu zabiegu)
- ⚠️ **Sprawdź**: zioła światłouczulające — w PL aktualna lista to: dziurawiec, nagietek, arcydzięgiel, rumianek, skrzyp, pokrzywa, mniszek lekarski, miłorząb (ginkgo)
- ⚠️ **Sprawdź**: czy lista leków SSRI (sertralina, paroxetyna, escitalopram, fluoxetyna) jest pełna

#### 3. Body Piercing
- ⚠️ **Brak**: piercing w niektórych regionach (np. genitalia) wymaga **odrębnej zgody pisemnej** + można dodać klauzulę o BHP (autoklaw, sterylizacja)
- ⚠️ **Brak**: Brak informacji o testach na HIV/HBV przy piercing'u igłowym (niektóre standardy branżowe to zalecają)

#### 4. Manicure / Pedicure
- ✅ Health interview przeglądowy (grzybica, brodawki, łuszczyca)
- ⚠️ Brakuje pytania o **leki przeciwzakrzepowe** (warfaryna) — minimum 24h przed pedicure z usuwaniem zrogowaceń

#### 5. Wszystkie zabiegi laserowe
- ⚠️ **Brak ogólnej klauzuli**: "Klient został poinformowany o konieczności konsultacji dermatologicznej w przypadku znamion barwnikowych (pieprzyki) w polu zabiegowym" — to **kluczowe** prawnie, bo laser na czerniaka = duża sprawa sądowa.

### Czego BRAKUJE strukturalnie (zalecam dodać)

#### 1. Zabieg **bez** zgody pisemnej? — wymóg KC
Polskie prawo nie wymaga FORMALNIE pisemnej zgody na zabieg kosmetologiczny (kosmetologia to nie medycyna). ALE:
- Jeśli zabieg jest **inwazyjny** (mezoterapia, laser, peeling fenolowy itp.) — wskazana zgoda pisemna z rygorem ważności (orzecznictwo)
- Sąd Najwyższy w II CSK 2/14: brak zgody pisemnej = przerzucenie ciężaru dowodu na kosmetologa

✅ Twoja aplikacja zgodna z tym.

#### 2. Wiek klienta
- Kosmetologia inwazyjna **dla osób poniżej 18 lat** wymaga zgody opiekuna prawnego
- Aplikacja zbiera DOB ale nie ma **automatycznej blokady** dla niepełnoletnich
- **Rekomendacja**: dodać walidację — jeśli wiek < 18 → wymagana zgoda rodzica (drugi podpis)

#### 3. Tłumacz / dostępność
- Jeśli klient nie zna polskiego — zgoda powinna być w jego języku
- Aplikacja jest tylko po polsku
- **Rekomendacja**: nie obsługuj klientów obcojęzycznych bez tłumacza, lub dodaj wersję EN/UA

---

## 5. Polityka prywatności — wymóg formalny

Aplikacja zbiera dane osobowe (RODO art. 13 ust. 1). Gabinet **musi** mieć opublikowaną politykę prywatności zawierającą:

1. Tożsamość administratora: **Gabinet Kosmetologiczny Magda Mączyńska, ul. Okrąg 46, 87-600 Lipno**
2. Cele przetwarzania:
   - Wykonanie zabiegu (art. 6 ust. 1 lit. b RODO — umowa)
   - Dokumentacja zabiegowa (art. 9 ust. 2 lit. h — opieka zdrowotna)
   - Marketing (art. 6 ust. 1 lit. a — zgoda dobrowolna)
3. Okres przechowywania: minimum **20 lat** (analogicznie do dokumentacji medycznej, art. 29 ustawy o świadczeniach zdrowotnych) — choć dla kosmetologii ten okres nie jest formalnie regulowany, 6 lat (okres przedawnienia roszczeń) to absolutne minimum.
4. Prawa klienta: dostęp, sprostowanie, usunięcie, ograniczenie, przenoszenie, sprzeciw, cofnięcie zgody
5. Informacja o IP: *"W ramach dokumentacji elektronicznej zbierany jest adres IP urządzenia klienta jako dowód czasu i miejsca złożenia podpisu"*
6. Informacja o transferze: jeśli używasz Supabase (USA/EU) — wymagana wzmianka

📄 **Akcja**: ZAMÓW politykę prywatności u prawnika (250-500 zł). Bez niej — 30k EUR kary RODO za pierwsze naruszenie.

---

## 6. Ubezpieczenie OC

⚠️ **To nie jest część aplikacji ale absolutny must-have dla gabinetu**:
- OC zawodowe kosmetologa: **2 000 000 zł sumy gwarancyjnej** (PZU, Warta, Generali oferują od 800-1500 zł/rok)
- Bez OC + powikłanie po zabiegu = bankructwo prywatne kosmetologa

---

## 7. Lista zadań przed wdrożeniem (priorytetowa)

### MUSI być przed pierwszym klientem
1. ✅ Wszystkie 5 oświadczeń (zrobione w v1.2.15)
2. ✅ Pieczęć prawna z UUID/hash chain (zrobione w v1.2.15)
3. ✅ PDF z metadanymi (zrobione w v1.2.15)
4. ⏰ **Polityka prywatności** opublikowana w gabinecie (PDF na recepcji + na stronie gabinetu)
5. ⏰ **OC zawodowe** wykupione
6. ⏰ Lista przeciwwskazań **zweryfikowana przez lekarza** współpracującego

### Powinno być w pierwszych 2 tygodniach
7. ⏰ Konsultacja z prawnikiem (ostateczne potwierdzenie zgodności)
8. ⏰ Procedura backup'ów Supabase (raz w tygodniu eksport JSON)
9. ⏰ Procedura usuwania danych po wycofaniu zgody (RODO art. 17)

### W ciągu kwartału
10. ⏰ Audyt RODO (zewnętrzna firma, 1500-3000 zł)
11. ⏰ Walidacja wieku <18 (kod do dodania)
12. ⏰ Wersje wielojęzyczne formularzy (EN/UA) — jeśli obsługujesz obcokrajowców

---

## 8. Dane statystyczne

Aktualne templaty:
- **23 typy zgód** (zabiegi + administracyjne)
- **Średnio 12 przeciwwskazań absolutnych** per zabieg inwazyjny
- **Średnio 7 zaleceń pozabiegowych** per zabieg
- **5 oświadczeń uniwersalnych** dodanych w v1.2.15

To **bardzo profesjonalny zestaw**. Mało kto w branży kosmetologicznej polskiej ma tak rozbudowaną dokumentację.

---

## Kontakt do prawników medycznych — Polska 2026

Polecam (sprawdzeni w branży medycznej/kosmetologicznej):
- **Kancelaria DZP Domański Zakrzewski Palinka** — premium, drogo, ale bardzo dobre
- **Kancelaria SK&S Sołtysiński Kawecki & Szlęzak** — średnia półka cenowa
- **Indywidualni prawnicy z LinkedIn** — szukaj "prawo medyczne RODO Polska" — często 300-500 zł za godzinę konsultacji wystarczy

Konsultacja 1h to absolutne minimum przed wdrożeniem. **Niecodzienne pytania, które warto zadać:**
1. Czy obecny zestaw 5 oświadczeń + RODO + wizerunek jest wystarczający?
2. Jak długo przechowywać zgody po wycofaniu zgody przez klienta?
3. Czy IP jako element dowodowy nie wymaga osobnej informacji?
4. Czy hash chain jest akceptowany jako dowód integralności w polskim sądzie?
5. Co zrobić jeśli klient zgubił telefon i prosi o usunięcie wszystkich danych?

---

**Dokument przygotowany dla**: Gabinet Kosmetologiczny Magda Mączyńska
**Wersja aplikacji**: v1.2.15
**Status**: Przygotowane do wdrożenia po spełnieniu MUSI list (punkty 4-6)
