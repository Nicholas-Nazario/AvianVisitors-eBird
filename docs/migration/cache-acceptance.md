# Cache acceptance evidence

Executed 2026-10-21 against working-tree Express implementation. No production requests or changes; frontend/artwork untouched. No implementation changes were required during this review.

`PATH=/private/tmp/node-v24.22.1-darwin-arm64/bin:$PATH npm test -- tests/ebird tests/shared/transport.test.ts`: **41 tests passed**, three files. `npm run typecheck`: **passed**.

New `tests/ebird/cache-acceptance.test.ts` supplies 18 checks:

- Both observations and discovery persist disk data across full dependency/config reconstruction, avoid upstream calls at age 59, then use the same data during an outage one day later. This establishes application-state independence; actual container stop/start remains the lead's final-image check.
- Malformed JSON, scalar/null cache content, missing data fields, and null data fields trigger upstream replacement for both cache kinds.
- Cold transport failure produces the 502 error with upstream status zero for both cache kinds.
- A directory occupying the destination cache filename forces atomic rename failure after a temporary file was written. Both endpoints still return successful upstream data and remove temporary files. Existing eBird tests separately cover inability to create a temporary file in a missing directory.
- Twenty-four simultaneous refreshes for each cache kind produce complete JSON files with no temporary remnants. Each request receives its own upstream response, and two geographic locations remain isolated. Concurrent writers are deliberately last-completed-writer wins; request coalescing is not introduced.
- Ordered hotspot batches, geographic observation data, and discovery data occupy separate files and are independently read without upstream calls.
- PHP-generated number serialization and MD5 characterization values are compared directly, including negative zero, scientific notation, and rounded negative coordinates.

Existing eBird tests additionally verify exclusive 60-second expiry, forced refresh with stale fallback, HTTP-error fallback, rejection of invalid successful upstream JSON, ordered batch/lookback identities, date boundaries and request URLs/headers/20-second timeout configuration. Existing `tests/shared/transport.test.ts` runs an actual HTTP server which sends headers and a partial body then stalls; transport rejects at its configured 50ms deadline. The test uses a shortened deadline to exercise the same timeout mechanism; it does not wait twenty seconds.

Legacy identity review compared `server/ebird/cache.ts` with the baseline `birdnet-api.php` blocks: observation tuple contains mode, ordered region codes, rounded latitude/longitude, integer radius and lookback; discovery tuple contains rounded latitude/longitude and radius; hotspot batch tuple contains ordered region codes and configured integer lookback. Prefixes match. Existing independent PHP captures seed their own `ebird-cache-64c29bad49a7ed3a7daee9735cb6d642.json` filename and exercise fresh/stale/forced-refresh behavior. Additional new cache tests derive filenames from the replacement and establish isolation/atomicity, rather than claiming new independent PHP captures.

Remaining evidence outside this bounded review: final-container stop/start and cold outage; live eBird integration and production timezone. Existing source parser limitation remains documented in agent-a-handoff.md: full PHP natural-language `strtotime` syntax is broader than the explicitly captured eBird calendar/date-time inputs.
