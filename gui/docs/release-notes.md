# Release notes

See the [bapX Agents desktop package source](../apps/desktop/package.json) for the current product version. The first-party landing page, Docs, MediaHub, and Admin ship together in one Rust Core image identified by its full Git SHA. The [Docs health endpoint](https://docs.bapx.in/healthz) reports the revision currently serving requests.

## Verified web deployments

These entries record when Hostinger verified each deployed image. The desktop version identifies the package source at that commit. Download availability is tracked under [Pending](#pending).

### 27 November 2026, 16:05 IST

Updated the [bapX homepage](https://bapx.in/) with a private Core setup path and a sample walkthrough of parallel agent worktrees and reconnecting. [PR #76](https://github.com/getwinharris/agency/pull/76)

- Desktop source version `0.1.0`
- Served SHA `3fb28a857bcc2c69bfcf02c17eea819b67cb7387`
- Image `sha256:73e0b4f985f3fdc23c8d846aab819657bc70d4e04e6dfcef25e1a3ede8598dcd`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45981204263), attempt 1

### 27 November 2026, 15:24 IST

Verified both [bapx.in](https://bapx.in/) and [www.bapx.in](https://www.bapx.in/) on the automatic first-party release. [PR #84](https://github.com/getwinharris/agency/pull/84)

- Desktop source version `0.1.0`
- Served SHA `f605185fef2e215e2b94ab36b86316cdf2700e5d`
- Image `sha256:7b6b125db085c7132c12946683912fad9d273f730f5d7c82f94aef57c4a1c2cd`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45975419346), attempt 1

### 27 November 2026, 14:21 IST

Documented how to check the running build after restarting a [private bapX Core](https://docs.bapx.in/private-core/). [PR #82](https://github.com/getwinharris/agency/pull/82)

- Desktop source version `0.1.0`
- Served SHA `b7a3a3077ed9105ed570c827aa3df57bdbcc3f95`
- Image `sha256:a3c7788274799b9d1a1191322b75b7f8e8750c1e8e8c2b69d47213ec6d1edf57`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45967212364), attempt 1

### 27 November 2026, 07:52 IST

Published the source-backed [developer guides](https://docs.bapx.in/) and verified release notes. [PR #77](https://github.com/getwinharris/agency/pull/77)

- Desktop source version `0.1.0`
- Served SHA `ad83c2b244d6b35915445f69c774d87be41bd610`
- Image `sha256:36b8f2428d899a1fd415cf2df0ccb8c0a345a969282e358ed4878a7f959c5682`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45926582536), attempt 1

### 27 November 2026, 07:08 IST

Restored responsive navigation on the [bapX landing page](https://bapx.in/), with a compact menu on phones, and removed its GitHub navigation link. [PR #73](https://github.com/getwinharris/agency/pull/73)

- Desktop source version `0.1.0`
- Served SHA `e02e6fec7fee5aaa5d9f115fd3973f05646d72d9`
- Image `sha256:8325cbc8983b46c220b42ede15848f2fea81966c3794fcc4a5b127046dacca1b`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45922550932), attempt 1

### 27 November 2026, 05:31 IST

Published an [operator-approved static site](https://sandbox-check.app.bapx.in/) over HTTPS as a pilot. [PR #69](https://github.com/getwinharris/agency/pull/69)

- Desktop source version `0.1.0`
- Served SHA `9a7ddac90b46a0dd9144db4d93a980b82dfe4a61`
- Image `sha256:58ec12a148d5cbbd7b0f4cc46d4adad6801bd8e0de228b09c72bcee78e234ef1`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45913081475), attempt 1 · [Production verification](https://github.com/getwinharris/agency/pull/69)

### 27 November 2026, 05:17 IST

Applied the bapX violet accent to primary buttons and keyboard focus indicators on Agents, Docs, and Privacy. The first deployed image containing the accent came from the subsequent web commit. [Accent PR #70](https://github.com/getwinharris/agency/pull/70) · [Commit PR #68](https://github.com/getwinharris/agency/pull/68)

- Desktop source version `0.1.0`
- Served SHA `dd39226022f924be13f8a71e09a3314dfa362f89`
- Image `sha256:e7fe76c92edb3710732217fbed6eb4a9f2c14a6a474ec11d5d7e9d41c6e6d801`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45911466661), attempt 1

### 27 November 2026, 04:53 IST

Restored the bapX wordmark and favicons across the first-party sites. Added landing-page paths to private Core setup and relevant MediaHub briefs. [PR #67](https://github.com/getwinharris/agency/pull/67)

- Desktop source version `0.1.0`
- Served SHA `52e35a30a4c7713e270a38016ca15510aa967d72`
- Image `sha256:e2a4a0785f146e9008a77348791ceea0b49bd9bef47b2c87828103044d8bf8c0`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45909151003), attempt 1

### 27 November 2026, 03:58 IST

Added exact-commit and image-digest verification for Hostinger deployments, with rollback to the preceding healthy release on a failed verification. [PR #66](https://github.com/getwinharris/agency/pull/66)

- Desktop source version `0.1.0`
- Served SHA `68974e17097444b5012518cfb1822cd1697e26ad`
- Image `sha256:bb6c559fec41dd9207b9097820cda75db03c4889ea269ceecad3645b2ef630ac`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45903442268), attempt 1

### 27 November 2026, 03:01 IST

Launched the Agency [landing page](https://bapx.in/) and [Docs](https://docs.bapx.in/), [MediaHub](https://mediahub.bapx.in/) with seven case studies and persistent brief intake, and the signed-in [Admin](https://admin.bapx.in/) inbox and homepage editor. [PR #63](https://github.com/getwinharris/agency/pull/63)

- Desktop source version `0.1.0`
- Served SHA `ee1dde5fdca74b3222ab7f30f4d3f6e53ac0a7d1`
- Image `sha256:60673e5098b2bac78047548caf4a809e26fcae2d8ab3ada1bdb0440d8a632fe0`
- [Exact-main web build and registry publish](https://github.com/getwinharris/agency/actions/runs/45898407724/job/140177950575) · [App checks](https://github.com/getwinharris/agency/actions/runs/45898407743) · [Core checks](https://github.com/getwinharris/agency/actions/runs/45898407828), all attempt 1

## Pending

- **Desktop downloads and updates.** Apple Silicon, Windows x64, and Linux x64 have source packaging instructions and native CI build artifacts. Public downloads await platform release verification, signing where applicable, and publication in Agency Releases. [Package verification PR #64](https://github.com/getwinharris/agency/pull/64) · [Agency Releases](https://github.com/getwinharris/agency/releases)
- **Android and hosted agent runtimes.** The Android workspace and emulator QA remain under review. Hosted agent runtimes await public release verification. [Android PR #65](https://github.com/getwinharris/agency/pull/65) · [Private Core setup](../../core/docs/setup.md)
- **Customer app hosting.** The app starter and its email/password flow have merged source changes. Mobile Admin, the isolated TLS listener, and dynamic hosting remain in development or review. Public dynamic hosting, self-service publishing, and custom domains await production verification. [App starter PR #68](https://github.com/getwinharris/agency/pull/68) · [Email/password PR #74](https://github.com/getwinharris/agency/pull/74) · [Mobile Admin PR #71](https://github.com/getwinharris/agency/pull/71) · [TLS listener PR #72](https://github.com/getwinharris/agency/pull/72) · [Dynamic hosting PR #75](https://github.com/getwinharris/agency/pull/75)
