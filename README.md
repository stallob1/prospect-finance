# Prospect Technology — Cash Runway Calculator

Blank-slate 12-month cash runway planner for Prospect Technology. No backend; inputs persist in the browser via `localStorage`.

## Defaults

- Start month: November 2026
- Available cash: $142,135
- Expected A/R: $7,915 (collected November 2026 by default; counted once when collected)
- All payroll, expenses, and revenue/funding: $0

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Useful scripts

- `npm run verify` — roll-forward, zero-expense “No cash burn”, A/R counted once
- `npm run build` — production build
- **Reset** in the UI restores defaults and clears projections

## Notes

- Prospect only; The Vurb Company appears only as the adjustable “Vurb service contract” expense
- Funding is separate from operating revenue in burn and runway math
