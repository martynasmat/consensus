
# "Consensus" prognozių rinka

## Idėja ir verslo modelis
"Consensus" yra decentralizuota prognozių rinka *(angl. prediction market)*, veikianti panašiu principu į *Polymarket/Kalshi*:
- vartotojai stato ETH už **YES** arba **NO**,
- pasibaigus laikui, `resolver` nustato laimėjusį rezultatą,
- laimėtojai pasidalina bendrą sumą proporcingai pagal savo statymo dydį.
- Platforma pasilieka 0.5% mokestį nuo kiekvieno statymo.

## Šalys
- `owner`
   - valdo patvirtintų kūrėjų `creator` sąrašą ir nusprendžia, kas gali kurti naujas rinkas/lažybas.
- `creator`
   - patvirtintas kūrėjas, įgalintas kurti naujas rinkas/lažybas `PredictionMarket(question, closeTime, resolver)`.
- `trader`
   - stato ETH už YES/NO.
- `resolver`
   - po `closeTime` nustato teisingą rezultatą (YES arba NO).
- `feeRecipient`
   - gali kviesti `withdrawFees()` ir išsimokėti `feesAccrued`. 

## Duomenys
Kiekviena rinka `PredictionMarket` turi:
- `question`: klausimas tekstu, saugomas grandinėje
- `questionId`: klausimo identifikatorių `keccak256(question)`
- `closeTime`: *UNIX timestamp*, iki kurio galima statyti
- `resolver`: adresas, kuris gali nustatyti rezultatą
- `outcome`: `Unresolved / Yes / No`
- `totalYes`, `totalNo`: bendros statymų sumos už YES bei NO rezultatus (po mokesčių)
- `stakeYes`, `stakeNo`: `mapping(address => uint256)` kintamieji, kurie saugo kiek kiekvienas vartotojas pastatė
- `claimed`: `mapping(address => bool)` kintamasis, kuris saugo, ar vartotojas jau išsimokėjo laimėjimą
- `feesAccrued`: šiame `PredictionMarket` sukaupta mokesčių suma, kurią gali išsimokėti `feeRecipient`

## Tipiniai scenarijai (use cases)

### 1) Kūrėjo `creator` patvirtinimas
**Tikslas:** Leidžia konkrečiam adresui kurti naujus `PredictionMarket`.
- Admin kviečia `MarketFactory.setApprovedCreator(creator, true)`.

### 2) Rinkos `PredictionMarket` sukūrimas
**Tikslas:** Patvirtintas kūrėjas sukuria naujas lažybas/rinką.
- Patvirtintas `creator` kviečia `MarketFactory.createMarket(question, closeTime, resolver)`.
- `MarketFactory` sukuria naują `PredictionMarket` (viduje generuojamas `questionId`).
- `MarketFactory` įrašo `PredictionMarket` adresą į sąrašą ir *emit'ina* `MarketCreated` event.

### 3) Statymas
**Tikslas:** `trader` pastato ETH.
- `trader` kviečia `PredictionMarket.stake(Yes)` arba `PredictionMarket.stake(No)` su norimu `msg.value`.

### 4) Rezultato nustatymas (`resolve`)
**Tikslas:** Po closeTime `resolver` nustato rezultatą.
- `resolver` kviečia `PredictionMarket.resolve(Yes)` arba `PredictionMarket.resolve(No)`.

### 5) Išmokos atsiėmimas (`redeem`)
**Tikslas:** `trader` atsiima išmoką po `resolve`.
- `trader` kviečia `PredictionMarket.redeem()`.
- Jei vartotojas laimėjo - išmoka proporcinga jo statymui.
- Jei pralaimėjo - išmoka 0.
- **Edge case**: jei laimėjusioje pusėje niekas nestatė, rinka laikoma anuliuota *(angl. void)* ir vartotojai atgauna savo statymą (po mokesčio).

### 6) Mokesčių atsiėmimas (`withdrawFees`)
**Tikslas:** `feeRecipient` atsiima išmoką.
- `feeRecipient` kviečia `PredictionMarket.withdrawFees()`
- `feesAccrued` išmokama į `feeRecipient` adresą
