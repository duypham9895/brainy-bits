# Brainy Bits

Five short Vietnamese brain-training games in one static page. No build step, no backend, no tracking.

| Game | What you train |
|---|---|
| Đường Ray Tư Duy | Planning: flip track switches so each train reaches the station of its colour |
| Cho Cá Koi Ăn | Working memory: feed every koi exactly once while they swim around |
| Ô Sáng Ghi Nhớ | Spatial memory: tap the tiles that just lit up |
| Mưa Phép Tính | Mental arithmetic: solve each sum before the drop reaches the water |
| Đoán Cụm Từ | Vocabulary: guess a two-word Vietnamese phrase in six tries |

Progress is kept in the browser's `localStorage` on the player's device only.

## Run locally

```sh
npm run serve        # http://127.0.0.1:8765
```

## Checks

```sh
npm ci
npm run parity       # index.html must match reference/original.html except allowed lines
npx playwright install chromium
npm test             # every game opens, starts and returns to its menu; no overflow at 320px
```

`reference/original.html` is the untouched export of the original claude.ai artifact.
`scripts/parity-check.mjs` lists every intentional difference with a date and a reason.

## Licences

See `legal/licences.json`. The Baloo 2 font is SIL OFL 1.1, loaded from Google Fonts.
