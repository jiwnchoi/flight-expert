---
name: flight-expert
description: Find and compare airfare with ITA Matrix from natural-language trip requests. Use when the user asks to find flights, compare fares, build or explain ITA Matrix searches, convert itinerary requirements into Matrix routing or extension codes, or return live Matrix results and shareable Matrix URLs for one-way, round-trip, multi-city, or open-jaw trips.
---

# Flight Expert

## Overview

Turn a natural-language flight request into an ITA Matrix site payload, add careful routing or extension codes when they express real hard constraints, call the Matrix search flow for both specific-date and calendar searches, and summarize the best results for the user.

## Workflow

1. Extract a structured Matrix site payload using [references/payloads.md](references/payloads.md).
2. Ask a concise follow-up only when a missing detail makes the search materially ambiguous or risky. Otherwise make the smallest reasonable assumption and state it.
3. Prefer ordinary fields over advanced codes:
   - Use `options.stops`, `options.cabin`, and `options.allowAirportChanges` before custom codes.
   - Add routing or extension codes only for explicit airline, operating-carrier, sequencing, connection, aircraft, alliance, or fare-basis constraints.
4. When advanced constraints are needed, load [references/matrix-codes.md](references/matrix-codes.md).
5. Save the site payload to a temp JSON file and run:

```bash
node scripts/matrix_search.js --payload-file /tmp/request.json --limit 5
```

6. Read the returned JSON and answer with:
   - The exact itinerary assumptions you used
   - The top results with price, carrier, key flights, stops, and notable warnings
   - For calendar searches, the cheapest dates or duration combinations
   - Any routing or extension codes you added and why
   - The shareable Matrix URL

## Build the Matrix Site Payload

- Use the site payload shape from [references/payloads.md](references/payloads.md). This is the same JSON that gets base64-encoded into the `search=` URL parameter.
- Keep passenger counts, stop counts, and booleans in the site payload as strings because Matrix serializes them that way.
- For round-trip searches, keep one slice with `returnDate*`, `routingRet`, and `extRet` fields instead of manually duplicating the return slice.
- Prefer airport codes when the user names specific airports. Use metro or city codes only when the user clearly wants broader matching.
- Encode date flexibility with `departureDateModifier` and `returnDateModifier`. Example: `11` means `minus=1`, `plus=1`.
- Default `showOnlyAvailable` to `"true"` unless the user explicitly asks for broader theoretical fare construction.

## Routing And Extension Rules

- Routing codes describe airline or segment patterns.
- Extension codes constrain itinerary selection or fare construction.
- Keep them conservative. Overconstraining is worse than underconstraining because it silently drops valid options.
- Mention every non-obvious code you added in the final answer.
- Good default behavior:
  - User asks for nonstop: prefer standard stop handling and, if needed, add routing `N`.
  - User asks for a specific operating carrier: use routing `O:XX`.
  - User asks to avoid codeshares: add extension `-CODESHARE`.
  - User asks to avoid overnight stops: add extension `-OVERNIGHTS`.
  - User asks to exclude certain airlines: prefer extension `-AIRLINES`.

## Script Outputs

`scripts/matrix_search.js` returns JSON with:

- `matrix_url`: shareable Matrix search URL
- `site_payload`: normalized site payload
- `request_body`: exact direct API body when `--show-request`
- `summary`: compact summary of top solutions
- `response`: raw Matrix API response when `--raw`

For calendar searches, the script generates Matrix `bgProgramResponse` through `agent-browser`, so that CLI must be installed and usable in the environment.

## Limitations

- `scripts/matrix_search.js` supports `specific` and `calendar` search modes.
- Calendar mode supports `one-way` and `round-trip`, not `multi-city`.
- Calendar mode depends on `agent-browser` to run the Matrix Botguard challenge in a real browser context.
- If the user asks for constraints Matrix cannot express cleanly, say so plainly and search with the nearest faithful approximation.
