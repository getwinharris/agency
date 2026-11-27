# Release notes

See the [bapX Agents desktop package source](../apps/desktop/package.json) for the current product version. Public websites ship independently and identify each deployment by its full Git SHA. The [Docs health endpoint](https://docs.bapx.in/healthz) reports the revision currently serving requests.

## Verified web deployments

These entries record when Hostinger verified each deployed image. The desktop version identifies the package source at that commit. Download availability is tracked under [Pending](#pending).

### 27 November 2026, 05:31 IST

Published an [operator-approved static site](https://sandbox-check.app.bapx.in/) over HTTPS as a pilot. [PR #69](https://github.com/getwinharris/agency/pull/69)

- Desktop source version `0.1.0`
- Served SHA `9a7ddac90b46a0dd9144db4d93a980b82dfe4a61`
- Image `sha256:58ec12a148d5cbbd7b0f4cc46d4adad6801bd8e0de228b09c72bcee78e234ef1`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45913081475) · [Production verification](https://github.com/getwinharris/agency/pull/69)

### 27 November 2026, 05:17 IST

Applied the bapX violet accent to primary buttons and keyboard focus indicators on Agents, Docs, and Privacy. The first deployed image containing the accent came from the subsequent web commit. [Accent PR #70](https://github.com/getwinharris/agency/pull/70) · [Commit PR #68](https://github.com/getwinharris/agency/pull/68)

- Desktop source version `0.1.0`
- Served SHA `dd39226022f924be13f8a71e09a3314dfa362f89`
- Image `sha256:e7fe76c92edb3710732217fbed6eb4a9f2c14a6a474ec11d5d7e9d41c6e6d801`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45911466661)

### 27 November 2026, 04:53 IST

Restored the bapX wordmark and favicons across the first-party sites. Added landing-page paths to private Core setup and relevant MediaHub briefs. [PR #67](https://github.com/getwinharris/agency/pull/67)

- Desktop source version `0.1.0`
- Served SHA `52e35a30a4c7713e270a38016ca15510aa967d72`
- Image `sha256:e2a4a0785f146e9008a77348791ceea0b49bd9bef47b2c87828103044d8bf8c0`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45909151003)

### 27 November 2026, 03:58 IST

Added exact-commit and image-digest verification for Hostinger deployments, with rollback to the preceding healthy release on a failed verification. [PR #66](https://github.com/getwinharris/agency/pull/66)

- Desktop source version `0.1.0`
- Served SHA `68974e17097444b5012518cfb1822cd1697e26ad`
- Image `sha256:bb6c559fec41dd9207b9097820cda75db03c4889ea269ceecad3645b2ef630ac`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45903442268)

### 27 November 2026, 03:01 IST

Launched the Agency [landing page](https://bapx.in/) and [Docs](https://docs.bapx.in/), [MediaHub](https://mediahub.bapx.in/) with seven case studies and persistent brief intake, and the signed-in [Admin](https://admin.bapx.in/) inbox and homepage editor. [PR #63](https://github.com/getwinharris/agency/pull/63)

- Desktop source version `0.1.0`
- Served SHA `ee1dde5fdca74b3222ab7f30f4d3f6e53ac0a7d1`
- Image `sha256:60673e5098b2bac78047548caf4a809e26fcae2d8ab3ada1bdb0440d8a632fe0`
- [Exact-main web build and registry publish](https://github.com/getwinharris/agency/actions/runs/45898407724/job/140177950575) · [App checks](https://github.com/getwinharris/agency/actions/runs/45898407743) · [Core checks](https://github.com/getwinharris/agency/actions/runs/45898407828)

## Pending

- **Desktop downloads and updates.** Apple Silicon, Windows x64, and Linux x64 have source packaging instructions and native CI build artifacts. Public downloads await platform release verification, signing where applicable, and publication in Agency Releases. [Package verification PR #64](https://github.com/getwinharris/agency/pull/64) · [Agency Releases](https://github.com/getwinharris/agency/releases)
- **Android and hosted agent runtimes.** The Android workspace and emulator QA remain under review. Public hosted agent runtimes await release verification. [Android PR #65](https://github.com/getwinharris/agency/pull/65) · [Private Core setup](../../core/docs/setup.md)
- **Customer app hosting.** The app starter and its email/password flow have merged source changes. Mobile Admin, the isolated TLS listener, and dynamic hosting remain in development or review. Public dynamic hosting, self-service publishing, and custom domains await production verification. [App starter PR #68](https://github.com/getwinharris/agency/pull/68) · [Email/password PR #74](https://github.com/getwinharris/agency/pull/74) · [Mobile Admin PR #71](https://github.com/getwinharris/agency/pull/71) · [TLS listener PR #72](https://github.com/getwinharris/agency/pull/72) · [Dynamic hosting PR #75](https://github.com/getwinharris/agency/pull/75)
- **Landing updates.** Link cleanup and the expanded Codex walkthrough await production verification. [PR #73](https://github.com/getwinharris/agency/pull/73) · [PR #76](https://github.com/getwinharris/agency/pull/76)
