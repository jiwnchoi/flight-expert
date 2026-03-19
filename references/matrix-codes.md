# Matrix Routing And Extension Codes

Use these only for true hard constraints. If a normal payload field can express the request, prefer that.

## Routing Codes

Routing codes describe flight patterns and airline sequencing.

- `C:AA`: direct flight on carrier `AA`
- `C:AA+`: one or more flights on `AA`
- `AA,UA,DL`: direct flight on any listed carrier
- `O:AA`: direct flight operated by `AA`
- `O:AA,UA,DL`: direct flight operated by one of the listed carriers
- `N`: a single nonstop flight
- `N:AA`: nonstop flight on `AA`
- `X`: a single connection point
- `X:NYC`: connection in `NYC`
- `DFW,STL`: connection in one of the listed points
- `F`: any single flight
- `F:AA151`: specific flight number
- `?`: zero or one flights
- `+`: one or more flights
- `*`: zero or more flights
- `~`: negation

## Routing Examples

- `N`: nonstop only
- `NYC`: single stop in New York
- `~NYC`: single stop, but not New York
- `DEN?`: nonstop or one stop in Denver
- `X?`: nonstop or one stop anywhere
- `~DEN?`: nonstop or one stop anywhere except Denver
- `AA+ DL+`: one or more AA flights followed by one or more DL flights
- `AA UA?`: one AA flight, optionally followed by one UA flight
- `AA25 UA814`: specific two-flight sequence
- `O:UA`: a single flight operated by UA
- `~UA882`: exclude a specific flight
- `UA1000-2000+`: one or more UA flights in a flight-number range

## Routing Glossary

- `Trip`: the whole journey
- `Leg`: one takeoff and one landing
- `Flight` or `Direct flight`: one or more legs on the same airline with the same flight number
- `Non-stop flight`: a flight with one leg
- `Itinerary`: one or more flights from requested origin to requested destination
- `Marketing carrier`: the airline shown by the flight number
- `Operating carrier`: the airline that actually operates the plane

## Extension Codes: Itineraries

These control itinerary selection. Multiple commands can be joined with `;`.

- `-CODESHARE`: disallow codeshares
- `MAXSTOPS n`: maximum stops on this portion of the trip
- `MAXDUR hh:mm`: maximum duration on this portion
- `MAXMILES n`: maximum flown miles
- `MINMILES n`: minimum flown miles
- `MINCONNECT hh:mm`: minimum connection time
- `MAXCONNECT hh:mm`: maximum connection time
- `ALLIANCE code...`: only permit listed alliances. Supported: `oneworld`, `skyteam`, `star-alliance`
- `-AIRLINES code...`: prohibit listed carriers
- `AIRLINES code...`: allow only listed carriers
- `OPAIRLINES code...`: allow only flights operated by listed carriers
- `-OPAIRLINES code...`: prohibit flights operated by listed carriers
- `-CITIES code...`: prohibit connections at listed cities
- `-REDEYES`: prohibit overnight flights
- `-OVERNIGHTS`: prohibit overnight stops
- `AIRCRAFT ...`: allow only listed equipment types or categories
- `-PROPS`: prohibit propeller aircraft
- `-NOFIRSTCLASS`: require every flight to have a first-class cabin

## AIRCRAFT Directive

- Use `T:` for a specific equipment type
- Use `C:` for a category
- Example: `AIRCRAFT T:737 C:JET`
- Supported categories called out in the Matrix help:
  - `C:JET`
  - `C:TURBOPROP`
  - `C:PISTON`
  - `C:TRAIN`
  - `C:HELICOPTER`
  - `C:AMPHIBIAN`
  - `C:SURFACE`

## Extension Codes: Faring

These constrain fare construction.

- `+CABIN code...`: require booking in listed cabin classes
- `-CABIN code...`: prohibit booking in listed cabin classes
- Cabin codes:
  - `1`: first
  - `2`: business
  - `premium-coach` or `pe`: premium economy
  - `3`: economy
- `F BC=code`: require a prime booking code
- `F BC=code|BC=code|...`: allow one of several booking codes
- `F carrier.city1+city2.farebasis`: specify carrier, market, and fare basis
- `F CC.AAA+BBB.FFFFFF`: carrier + city pair + fare basis
- `F ..FFFFFF`: fare basis only
- `F .AAA+BBB.`: market only
- `F CC..FFFFFF`: carrier + fare basis
- `F ..F-`: wildcard fare basis prefix

## Practical Mapping From User Intent

- Wants nonstop: use normal stop handling first, then routing `N` if needed
- Wants a specific operating carrier: routing `O:XX`
- Wants to avoid codeshares: extension `-CODESHARE`
- Wants to avoid airport changes: set `allowAirportChanges = "false"` in the normal options
- Wants to avoid overnight stops: extension `-OVERNIGHTS`
- Wants to ban certain airlines: extension `-AIRLINES`
- Wants only certain alliances: extension `ALLIANCE`
- Wants aircraft restrictions: extension `AIRCRAFT`

## Caution

Routing and extension codes can easily overconstrain a search and hide valid itineraries. Add them only when the user clearly asked for that exact restriction.
