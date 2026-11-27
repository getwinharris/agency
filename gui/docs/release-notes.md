# Release notes

See the [bapX Agents desktop package source](../apps/desktop/package.json) for the current product version. The first-party landing page, Docs, MediaHub, and Admin ship together in one Rust Core image identified by its full Git SHA. The [Docs health endpoint](https://docs.bapx.in/healthz) reports the revision currently serving requests.

## Verified web deployments

These entries record when Hostinger verified each deployed image. The desktop version identifies the package source at that commit. Download availability is tracked under [Pending](#pending).

### 27 November 2026, 19:19 IST

The [Linux x64 packaging guide](https://docs.bapx.in/desktop-packaging/#linux-appimage-x64) explains how to start bapX Agents when FUSE is unavailable. The launcher keeps the backend in extract mode so both the window and backend start. The branded CI AppImage passed clean-profile VPS launches with FUSE and in extract mode. The public Linux installer remains pending. [PR #91](https://github.com/getwinharris/agency/pull/91)

- Desktop source version `0.1.0`
- Served SHA `0984df8ff923b96d66895be3058ecb9989d49a22`
- Image `sha256:a9108528106e3ff97859c0d2f2cfa1f5ef32b1a0569d186bbd95d7b680da3fc1`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/46005054814), attempt 1 · [Production verification](https://github.com/getwinharris/agency/pull/91#issuecomment-7220019455)

### 27 November 2026, 18:37 IST

Restored the plain bapX wordmark and title on the [homepage](https://bapx.in/) and linked the wordmark on all first-party sites back to bapx.in. [Docs](https://docs.bapx.in/), [MediaHub](https://mediahub.bapx.in/), and [Admin](https://admin.bapx.in/) use their purple subdomain labels. Verified the original wordmark and favicon bytes, desktop and mobile navigation, and the signed-out Admin response. [PR #81](https://github.com/getwinharris/agency/pull/81)

- Desktop source version `0.1.0`
- Served SHA `cecb3b58d09ea7286146d8de05b87d5252cfbf36`
- Image `sha256:dd393c9707dfd6318f89dcef0c1cd58eb439a396aa4b9d397cf4444142beb8c2`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45996973054), attempt 1 · [Production verification](https://github.com/getwinharris/agency/pull/81#issuecomment-7219151831)

### 27 November 2026, 18:11 IST

Published the [Apple Silicon release candidate guide](https://docs.bapx.in/desktop-packaging/#build-an-apple-silicon-release-candidate) for building and verifying a signed candidate. It documents the supported CLI integrations and the separate Local Mac and approved Enterprise VM checks. The Mac beta download remains pending signing, notarization, and installed-app acceptance. [PR #90](https://github.com/getwinharris/agency/pull/90)

- Desktop source version `0.1.0`
- Served SHA `fc664c5f91eb4cecf61009fac9b5d32aa955b157`
- Image `sha256:299f084d0a9ff613a64f791880c07c5b1f501c3e714c90d35bfdeedb3b5bd349`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45996216471), attempt 1

### 27 November 2026, 17:56 IST

The public Rust image now starts with `bapx-core serve-web`. Existing publishing tools can still use the `cloudroom` executable. The [private Core guide](https://docs.bapx.in/private-core/) explains both paths. All five public hostnames served this revision after the GitHub Actions rollout, and Admin required sign-in. [PR #94](https://github.com/getwinharris/agency/pull/94)

- Desktop source version `0.1.0`
- Served SHA `380228e390e15c9cc5f519a96842afc9988ebebf`
- Image `sha256:62216cec099c6c070c3ffa552e4b15b1ff3d60f87e592fc6c988f994c56404a9`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45995156522), attempt 1

### 27 November 2026, 17:10 IST

Moved first-party web deployment to GitHub Actions. The [Public web workflow](https://github.com/getwinharris/agency/actions/workflows/web.yml) verifies the source revision and deploys the shared Rust image to Hostinger. Retired VPS polling after checking all five hostnames and the browser acceptance flows. [PR #92](https://github.com/getwinharris/agency/pull/92)

- Desktop source version `0.1.0`
- Served SHA `353870427b68b63e97627ec1b73c23027b4ac80d`
- Image `sha256:a52d8e68d66fbbb18d96cb67e41fd7908ae9ce8eeada35cb3ebe66fab81b2a46`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45990620382), attempt 1

### 27 November 2026, 16:52 IST

Organized the [bapX Docs release notes](https://docs.bapx.in/release-notes/) into a timeline and added the verified homepage, landing alias, and private Core records. [PR #87](https://github.com/getwinharris/agency/pull/87)

- Desktop source version `0.1.0`
- Served SHA `7c5d29d208b72f1249d27e46de051e91561a7a68`
- Image `sha256:b56814534a574959c34cc885d78b990ebb7e8c42d70b8a9b76ad3912c7258786`
- [Exact-main workflow and image manifest](https://github.com/getwinharris/agency/actions/runs/45987954176), attempt 1

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

- **Managed workspace access.** The shared bapX account is the entry point for the planned hosted workflow. Authorized workspace grants, automatic desktop enrollment, and running and reconnecting to a real task still require production verification. [Workspace access #46](https://github.com/getwinharris/agency/issues/46) · [Hosted pairing #85](https://github.com/getwinharris/agency/issues/85)
- **Desktop downloads and updates.** Apple Silicon, Windows x64, and Linux x64 have source packaging instructions and native CI build artifacts. Public downloads await platform release verification, signing where applicable, and publication in Agency Releases. [Package verification PR #64](https://github.com/getwinharris/agency/pull/64) · [Agency Releases](https://github.com/getwinharris/agency/releases)
- **Apple Silicon beta.** The first planned beta uses package version `0.1.0` and the `v0.1.0` prerelease tag. The [release candidate procedure](../apps/desktop/README.md#build-an-apple-silicon-release-candidate) covers signed artifacts. Public Mac availability awaits signing, notarization, signup, installation, and real local integration tests. [Mac acceptance #60](https://github.com/getwinharris/agency/issues/60) · [Gatekeeper #88](https://github.com/getwinharris/agency/issues/88)
- **Android and hosted agent runtimes.** The Android workspace and emulator QA remain under review. Hosted agent runtimes await public release verification. [Android PR #65](https://github.com/getwinharris/agency/pull/65) · [Private Core setup](../../core/docs/setup.md)
- **Customer app hosting.** The app starter and its email/password flow have merged source changes. Mobile Admin, the isolated TLS listener, and dynamic hosting remain in development or review. Public dynamic hosting, self-service publishing, and custom domains await production verification. [App starter PR #68](https://github.com/getwinharris/agency/pull/68) · [Email/password PR #74](https://github.com/getwinharris/agency/pull/74) · [Mobile Admin PR #71](https://github.com/getwinharris/agency/pull/71) · [TLS listener PR #72](https://github.com/getwinharris/agency/pull/72) · [Dynamic hosting PR #75](https://github.com/getwinharris/agency/pull/75)
