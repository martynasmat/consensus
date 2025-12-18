
# "Consensus" prognozių rinka

## Idėja ir verslo modelis
"Consensus" yra prognozių rinkų *(angl. prediction market)* platforma, veikianti panašiu principu į *Polymarket/Kalshi*:
- administratorius `owner` deploy'ina išmaniąją sutartį `MarketFactory`,
- administratorius `owner` patvirtina kūrėją `creator` su funkcija `MarketFactory.setApprovedCreator(creator, true)`,
- patvirtintas kūrėjas `creator` kviečia funkciją `MarketFactory.createMarket(question, closeTime, resolver)` ir sukuria lažybas,
- vartotojai stato ETH už **YES** arba **NO**,
- po laiko `closeTime` `resolver` nustato laimėjusį rezultatą,
- `feeRecipient` išsimoka sukauptą mokesčių sumą,
- laimėtojai išsimoka laimėtą sumą.

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
`PredictionMarket` duomenys:
- `question`: klausimas teksto forma
- `questionId`: klausimo identifikatorius `keccak256(question)`
- `closeTime`: *UNIX timestamp*, iki kurio galima statyti ir po kurio galima kviesti `PredictionMarket.resolve()`
- `resolver`: adresas, kuris gali nustatyti rezultatą
- `outcome`: `Unresolved / Yes / No`: lažybų rezultatas
- `totalYes`, `totalNo`: bendros statymų sumos už YES bei NO rezultatus (po mokesčių)
- `stakeYes`, `stakeNo`: `mapping(address => uint256)` kintamieji, kurie saugo kiek kiekvienas vartotojas pastatė
- `claimed`: `mapping(address => bool)` kintamasis, kuris saugo, ar vartotojas jau išsimokėjo laimėjimą
- `feesAccrued`: šiame `PredictionMarket` sukaupta mokesčių suma, kurią gali išsimokėti `feeRecipient`

`MarketFactory` duomenys:
- `owner` administratoriaus adresas
- `approvedCreator`: `mapping(address => bool)` tipo kintamasis, saugantis patvirtintų kūrėjų `creator` adresus
- `markets`: `PredictionMarket` adresų masyvas

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

## Testavimas lokaliame tinkle

**Testavimo žingsniai:**
1) Sukurti lokalų tinklą (naudojamas įrankis Ganache).
2) Paleisti išmaniąsias sutartis tinkle su komanda `truffle migrate --network development`
3) komanda `truffle test` ištestuoja visas `PredictionMarket` bei `MarketFactory` funkcijas.

Komandinės eilutės išvestis:
```
Factory allowlist
   √ rejects unapproved creator (170ms)
   √ owner can approve creator (54ms)
   √ approved creator can create market and MarketCreated emits (121ms)
 Market lifecycle (with fees)
   √ allows staking and contract balance becomes 3 ETH after two stakes (170ms)
   √ rejects resolve before closeTime (84ms)
   √ rejects resolve from non-resolver (91ms)
   √ resolves after closeTime and outcome is stored (120ms)
   √ redeem drains pool and leaves only fees (0.015 ETH) in contract (236ms)
   √ feeRecipient can withdraw fees and feesAccrued resets to 0 (250ms)
   √ cannot redeem twice (177ms)


10 passing (2s)
```
