# Matrix Payloads

This skill uses two different payload shapes:

1. The Matrix site payload
2. The direct `/v1/search` API request body

The Node.js CLI accepts either one site payload object or an array of site payload objects, then converts each one to the API body.

## Site Payload Shape

```json
{
  "type": "round-trip | one-way | multi-city",
  "slices": [
    {
      "origin": ["ICN"],
      "dest": ["SEA"],
      "routing": "optional",
      "ext": "optional",
      "routingRet": "round-trip return only",
      "extRet": "round-trip return only",
      "dates": {
        "searchDateType": "specific | calendar",
        "departureDate": "2026-05-08",
        "departureDateType": "depart | arrive",
        "departureDateModifier": "0 | 10 | 1 | 11 | 22",
        "departureDatePreferredTimes": [0, 1, 2, 3, 4, 5],
        "duration": "calendar round-trip only, like 5 or 5-7",
        "returnDate": "2026-05-23",
        "returnDateType": "depart | arrive",
        "returnDateModifier": "0 | 10 | 1 | 11 | 22",
        "returnDatePreferredTimes": [0, 1, 2, 3, 4, 5]
      }
    }
  ],
  "options": {
    "cabin": "COACH | PREMIUM-COACH | BUSINESS | FIRST",
    "stops": "-1 | 0 | 1 | 2",
    "extraStops": "-1 | 0 | 1 | 2",
    "allowAirportChanges": "true | false",
    "showOnlyAvailable": "true | false",
    "currency": { "code": "USD" },
    "salesCity": { "code": "ICN" }
  },
  "pax": {
    "adults": "1",
    "children": "0",
    "youth": "0",
    "infantsInLap": "0",
    "infantsInSeat": "0",
    "seniors": "0"
  }
}
```

You can also pass a JSON array of site payloads to run multiple searches in parallel. The script preserves input order in its output array.

## Important Conventions

- Passenger counts stay as strings in the site payload.
- `departureDateModifier` and `returnDateModifier` are encoded as a compact integer string:
  - `0` => exact date
  - `10` => day before
  - `1` => day after
  - `11` => plus or minus 1 day
  - `22` => plus or minus 2 days
- `preferredTimes` buckets:
  - `0`: before 08:00
  - `1`: 08:00-11:00
  - `2`: 11:00-14:00
  - `3`: 14:00-17:00
  - `4`: 17:00-21:00
  - `5`: after 21:00

## Round-Trip Rule

For round-trip searches, use one site slice and keep the return information in:

- `dates.returnDate`
- `dates.returnDateType`
- `dates.returnDateModifier`
- `dates.returnDatePreferredTimes`
- `routingRet`
- `extRet`

Do not manually duplicate the return slice in the site payload.

## Direct API Request Shapes

### Specific Dates

The script converts a `specific` site payload into a Matrix search request like:

```json
{
  "summarizers": [
    "carrierStopMatrix",
    "currencyNotice",
    "solutionList",
    "itineraryPriceSlider",
    "itineraryCarrierList",
    "itineraryDepartureTimeRanges",
    "itineraryArrivalTimeRanges",
    "durationSliderItinerary",
    "itineraryOrigins",
    "itineraryDestinations",
    "itineraryStopCountList",
    "warningsItinerary"
  ],
  "inputs": {
    "filter": {},
    "page": { "current": 1, "size": 25 },
    "pax": { "adults": 1 },
    "slices": [
      {
        "origins": ["ICN"],
        "destinations": ["SEA"],
        "date": "2026-05-08",
        "dateModifier": { "minus": 1, "plus": 1 },
        "isArrivalDate": false,
        "routeLanguage": "optional routing code",
        "commandLine": "optional extension code",
        "filter": { "warnings": { "values": [] } },
        "selected": false
      }
    ],
    "firstDayOfWeek": "SUNDAY",
    "internalUser": false,
    "sliceIndex": 0,
    "sorts": "default",
    "cabin": "COACH",
    "maxStopCount": 1,
    "maxLegsRelativeToMin": 1,
    "changeOfAirport": true,
    "checkAvailability": true
  },
  "summarizerSet": "wholeTrip",
  "name": "specificDatesSlice"
}
```

### Calendar One-Way

The script converts a `calendar` one-way payload into:

```json
{
  "summarizers": [
    "calendarOneWay",
    "overnightFlightsCalendar",
    "itineraryStopCountList",
    "itineraryCarrierList",
    "currencyNotice"
  ],
  "inputs": {
    "filter": {},
    "page": { "size": 25 },
    "pax": {
      "adults": 1,
      "children": 0,
      "infantsInLap": 0,
      "infantsInSeat": 0,
      "seniors": 0,
      "youth": 0
    },
    "slices": [
      {
        "origins": ["ICN"],
        "destinations": ["SEA"],
        "routeLanguage": "optional routing code",
        "commandLine": "optional extension code"
      }
    ],
    "firstDayOfWeek": "SUNDAY",
    "internalUser": false,
    "sliceIndex": 0,
    "sorts": "default",
    "startDate": "2026-05-08",
    "endDate": "2026-06-08",
    "cabin": "COACH",
    "maxStopCount": 1,
    "changeOfAirport": true,
    "checkAvailability": true
  },
  "summarizerSet": "calendarOneWay",
  "name": "calendar",
  "bgProgramResponse": "botguard response"
}
```

### Calendar Round-Trip

The script converts a `calendar` round-trip payload into:

```json
{
  "summarizers": [
    "calendar",
    "overnightFlightsCalendar",
    "itineraryStopCountList",
    "itineraryCarrierList",
    "currencyNotice"
  ],
  "inputs": {
    "filter": {},
    "layover": { "min": 5, "max": 7 },
    "page": { "size": 25 },
    "pax": {
      "adults": 1,
      "children": 0,
      "infantsInLap": 0,
      "infantsInSeat": 0,
      "seniors": 0,
      "youth": 0
    },
    "slices": [
      { "origins": ["ICN"], "destinations": ["SEA"] },
      { "origins": ["SEA"], "destinations": ["ICN"] }
    ],
    "firstDayOfWeek": "SUNDAY",
    "internalUser": false,
    "sliceIndex": 0,
    "sorts": "default",
    "startDate": "2026-05-08",
    "endDate": "2026-06-08",
    "cabin": "COACH",
    "maxStopCount": 1,
    "changeOfAirport": true,
    "checkAvailability": true
  },
  "summarizerSet": "calendarRoundTrip",
  "name": "calendar",
  "bgProgramResponse": "botguard response"
}
```

## Conversion Notes

- `routing` maps to API `routeLanguage`.
- `ext` maps to API `commandLine`.
- Return-side `routingRet` and `extRet` become the second API slice for round-trip searches.
- Calendar requests omit per-slice `date` fields and carry the range in `startDate` and `endDate`.
- Calendar round-trip uses `dates.duration` to build API `layover`.
- `stops = "-1"` means omit `maxStopCount`.
- `extraStops = "-1"` means omit `maxLegsRelativeToMin`.
- `allowAirportChanges` becomes boolean `changeOfAirport`.
- `showOnlyAvailable` becomes boolean `checkAvailability`.
- Calendar searches also require a Matrix `bgProgramResponse`.

## Botguard Notes

- Matrix calendar searches use Botguard before `/v1/search`.
- The script derives the Botguard input object from the request body:
  - `calendarMinDuration`
  - `calendarMaxDuration`
  - `origin1..origin6`
  - `destination1..destination6`
  - `date1..date6`
- For calendar requests, this skill generates `bgProgramResponse` with `agent-browser` in a blank browser page, not with a guessed stub.

## Current Limitation

Calendar API mode supports `one-way` and `round-trip`. Multi-city remains specific-date only.
