# Release procedure — prepared, not executed

Local implementation verification does not authorize a production release. No registry push, remote candidate deployment, secret change, production cutover or rollback was performed. `release-record.json` deliberately leaves unavailable remote values null. Fly CLI/authenticated environment was not available in this session. Public read-only probes confirmed the existing hostname, UTC `as_of` and advertised CORS on 2026-10-21; they cannot reveal renderer provisioning, secret values or immutable image identity.

## Record the recoverable baseline

With authenticated read-only Fly access, save these outputs privately, outside the image/repository:

```sh
fly releases --app avianvisitors-ebird --image
fly machine list --app avianvisitors-ebird --json
fly config show --app avianvisitors-ebird
fly secrets list --app avianvisitors-ebird
```

Record the current immutable registry digest, platform, machine settings, non-secret runtime configuration and secret **names**. Retain existing secret values through the provider; never print or commit them. Inspect the running service's timezone and optional renderer/cache configuration. Confirm the previous image can still be pulled by digest. Set `previousImmutableImage` and `productionMachinePlatform` in the release record. The checked-in `rollback.fly.toml` preserves the baseline port **80**; compare it to actual deployed configuration before accepting it. Do not roll the PHP image back with the Express port 8080 configuration.

## Prepare and accept a remote candidate

Run the local checks described in `verification.md`. Build the final source revision for the recorded production platform; the locally verified image is linux/arm64, so do not assume its platform matches production. Pin the resolved Node base manifest if making a registry release, and record its digest. Push the accepted build to the organization's existing registry only under release authorization. Record its immutable registry digest; a local Docker image ID is not a registry deployment digest.

Use a separately authorized candidate app/hostname, its copied non-secret configuration and provider-managed eBird secret. Preserve the existing production app and frontend origins. Configure candidate internal port 8080 and UTC, retaining ewr, HTTPS, health path, 512 MB and autostop/start settings. No volume or database is introduced. Example deployment after the release record is populated:

```sh
: "${AV_CANDIDATE_APP:?set separate candidate app}"
: "${AV_CANDIDATE_IMAGE:?set immutable registry image digest}"
fly deploy --app "$AV_CANDIDATE_APP" --config fly.toml --image "$AV_CANDIDATE_IMAGE"
```

Verify candidate root, configuration, favicon, loading artwork, both illustration poses, GET/HEAD cutout bytes, menu GET/POST with the existing proxy Authorization flow, wiki, all four eBird actions, hotspot arrays, validation and no-token CORS/OPTIONS. Check private/source/cache paths return 404. Use synthetic or permitted read-only upstream calls, recording statuses and shape without credentials. Run unchanged clients in same-origin and separate-origin arrangements, saved preferences, old bookmarks, ten hotspots, manual refresh and at least one actual configured automatic cycle. Retest an already-open pre-cutover tab without a frontend reload. Check cold start, warm/stale caches, health, request latency, memory and upstream volume; enable and test real rembg only if deployed previously. Record remote evidence and remaining discrepancies before acceptance.

## Authorized cutover

Keep frontend/backend hostnames and static frontend content unchanged. Confirm rollback digest is pullable and previous configuration has been validated. After an explicit release instruction, deploy the accepted immutable candidate image:

```sh
: "${AV_ACCEPTED_IMAGE:?set accepted immutable registry digest}"
fly deploy --app avianvisitors-ebird --config fly.toml --image "$AV_ACCEPTED_IMAGE"
```

Verify health/root/assets, counts and ordering, every action, cutout GET/HEAD, CORS, settings access and saved preferences. Observe at least one configured refresh cycle plus manual refresh, cold starts, errors, latency, memory and upstream calls. Record time, release ID, image digest and evidence. Declare deployed completion only after those observations pass.

## Rollback

Rollback immediately if valid baseline requests fail, counts/images differ materially, preferences/settings fail, CORS blocks the existing client, or health/resources regress. Restore the previous digest **and its matching baseline port/configuration**:

```sh
: "${AV_PREVIOUS_IMAGE:?set verified previous immutable registry digest}"
fly deploy --app avianvisitors-ebird --config docs/migration/rollback.fly.toml --image "$AV_PREVIOUS_IMAGE"
```

Apply any privately recorded runtime configuration differences through the existing provider mechanism. Recheck the same public URLs, health and unchanged open client; record restored release/digest and refresh results. No frontend redeploy, cache purge or credential rotation is required. Existing JSON caches remain compatible; ephemeral cache loss during machine replacement simply produces a cold start. Preserve the Node candidate and failed evidence for diagnosis.

Commands follow [Fly's registry/image deployment documentation](https://www.fly.io/docs/blueprints/using-the-fly-docker-registry/). They are reviewable instructions, not execution evidence.
