# Flight Expert

[[한국어]](./README.ko.md)

`flight-expert` is a Codex skill for finding flights with real-world constraints in natural language.

> [!WARNING]
> This skill uses a private Google API behind ITA Matrix search flows. It can break or get blocked at any time.
>
> This skill is for search only. After you find an itinerary here, you should look up the same itinerary with your preferred airline or travel agency and book it there directly.

## Install

For lowest-fare and flexible-date searches, this skill needs a live browser connection. Install `agent-browser` first:

- https://github.com/vercel-labs/agent-browser

```bash
npx skills add jiwnchoi/flight-expert
```

## What It Does

- Finds flights from plain-English requests
- Handles one-way, round-trip, open-jaw, and multi-city trips
- Supports exact-date and flexible-date searches
- Works well when the user cares about stops, cabin, airlines, timing, or specific airports
- Returns good options plus a shareable Matrix URL

## Example Requests

### 1. Simple Nonstop Search

> Find me a nonstop round-trip from Seoul Incheon to Seattle in premium economy or business, leaving November 3, 2026 plus or minus one day and returning November 12, 2026 plus or minus one day. I prefer evening departures from Seoul and morning returns from Seattle. Show me the cheapest three options and include the Matrix URL.

### 2. Airline And Codeshare Preference

> Search one-way from JFK to Zurich on March 9, 2027. I only want flights actually operated by Swiss or United, not codeshares. One stop is fine, but no overnight stops and no airport changes. Show me the best five options.

### 3. Open-Jaw Trip

> I want a business-class open-jaw trip: San Francisco to Rome around April 10, 2027, returning from Paris to San Francisco around April 21, 2027, both with plus or minus two days. Keep it to one stop max each way, avoid Heathrow if possible, and tell me the best combinations.

### 4. Multi-City Trip

> Build a multi-city trip for LAX to Tokyo on May 5, 2027, Tokyo to Seoul on May 10, Seoul to Bangkok on May 15, and Bangkok to LAX on May 22. Business class throughout, no more than one stop per segment, no overnight stops, and avoid codeshares. Show me the best priced options and the Matrix URL.

### 5. Flexible-Date Cheapest Search

> Find the cheapest round-trip from Chicago to Lisbon in June 2027 for a 7 to 9 night trip. I can leave any day starting June 1. Economy is fine, at most one stop, no airport changes, and no overnight stops. Exclude TAP and Iberia. Return the best date combinations and the Matrix URL.

### 6. Specific Connection Preference

> Search Seattle to Florence on September 14, 2027 in business class. One stop is fine, but I strongly prefer connecting in Frankfurt or Munich and I do not want London, Paris, or Amsterdam connections. No overnight stops and no airport changes. Show the top results and include the Matrix link.

### 7. Corporate-Style Search

> Search New York to London round-trip departing October 6, 2027 and returning October 10, 2027. Business class only. Search for British Airways or American, prefer nonstop, and if the fare can be narrowed further, explain clearly what you were able to apply and what had to stay approximate.

### 8. Aircraft Preference

> Find me flights from Denver to Santa Barbara on August 18, 2027. Economy is fine, one stop max, but do not use turboprops and avoid regional equipment if possible. No overnight stops. Show me the best results.

### 9. Alliance-Focused Search

> Search round-trip from Singapore to Barcelona for February 2027, around 10 nights, using a flexible date search. I want business class, one stop max, only oneworld airlines, no codeshares, no overnight stops, and no airport changes. Show the cheapest valid date combinations.

### 10. Real-World Compromise Search

> Find the cheapest reasonable itinerary from Boston to Cape Town in late January 2027. I prefer business class but include premium economy if business is much more expensive. I want no more than one stop each way, no airport changes, avoid overnight layovers, avoid Ethiopian, and prefer Star Alliance. If something cannot be matched exactly, use the closest reasonable search and tell me what changed.

### 11. Family Trip

> Search for a family trip from SFO to Honolulu for 2 adults, 1 child, and 1 infant in seat. Dates are July 8 to July 15, 2027. I want nonstop only, morning departure outbound, afternoon return, and premium economy if available otherwise economy. Give me the best options and the Matrix link.

### 12. Broad Airport Matching

> Look for a round-trip from any New York airport to any Tokyo airport in March 2027 for about 6 nights. I am flexible by plus or minus two days. Premium economy or business, one stop max, avoid overnight stops, and avoid airport changes on connections. Compare the lowest-cost date combinations and tell me which airport pairings performed best.
