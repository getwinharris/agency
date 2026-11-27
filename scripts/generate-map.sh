#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

fail() {
    printf 'Agency map: %s\n' "$*" >&2
    exit 1
}

mode=write
case $# in
    0) ;;
    1) case $1 in
        --check) mode=check ;;
        --stdout) mode=stdout ;;
        *) fail 'Usage: scripts/generate-map.sh [--check | --stdout]' ;;
    esac ;;
    *) fail 'Usage: scripts/generate-map.sh [--check | --stdout]' ;;
esac

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
workflow=.github/workflows/web.yml
compose=deploy/compose.web.yml
rust_web=core/src/web.rs
driver=deploy/deploy-web.sh
publisher=deploy/publish-site.sh

# Resolve only the tracked override. No Docker daemon, host Compose file, or .env is needed.
config=$(BAPX_WEB_IMAGE=agency-web:map docker compose --env-file /dev/null \
    --project-name agency-map --file "$compose" config --format json \
    --no-env-resolution --no-path-resolution) || fail "Could not read $compose with Docker Compose."

routers=$(jq -ec '
    .services["agency-web"].labels as $labels |
    [$labels | to_entries[] |
        .key | select(startswith("traefik.http.routers.") and endswith(".rule")) |
        ltrimstr("traefik.http.routers.") | rtrimstr(".rule") |
        . as $name | "traefik.http.routers.\($name)" as $key |
        $labels["\($key).rule"] as $rule |
        "Host\\(`([a-z0-9.-]+)`\\)" as $host |
        "Path\\(`(/[a-zA-Z0-9/_-]+)`\\)" as $path |
        "Method\\(`([A-Z]+)`\\)" as $method |
        {name: $name, hosts: ([$rule | scan($host) | .[0]] | unique),
            path: ([$rule | scan($path) | .[0]] | first // ""),
            method: ([$rule | scan($method) | .[0]] | first // ""),
            valid: (($name | test("^[a-z0-9-]+$")) and
                $labels["\($key).service"] == "agency-web" and
                $labels["\($key).tls"] == "true" and
                $labels["\($key).entrypoints"] == "websecure" and
                ($rule | test("^\\s*" + $host + "(\\s*\\|\\|\\s*" + $host + ")*\\s*$") or
                    (split("&&") | map(gsub("^\\s+|\\s+$"; "")) |
                        length == 3 and any(.[]; test("^" + $host + "$")) and
                        any(.[]; test("^" + $path + "$")) and any(.[]; test("^" + $method + "$")))))}
    ] | select(length > 0 and all(.[]; .valid and (.hosts | length > 0)))
' <<< "$config") || fail "The agency-web routers in $compose must use exact HTTPS Host rules or Host with exact Path and Method."

host_set() {
    awk '{for (i = 1; i <= NF; i++) print $i}' | sort -u
}

router_hosts() {
    jq -er --arg name "$1" 'first(.[] | select(.name == $name) | .hosts)[]' <<< "$routers" |
        host_set
}

require_match() {
    if [[ -z $2 || $2 != "$3" ]]; then
        printf 'Agency map: %s disagree.\n' "$1" >&2
        diff -u <(printf '%s\n' "$2") <(printf '%s\n' "$3") >&2 || true
        exit 1
    fi
}

require_source() {
    local path=$1 marker
    shift
    for marker in "$@"; do
        grep -Fq -- "$marker" "$path" || fail "Update the architecture map for $path (missing: $marker)."
    done
}

rust_constant() {
    sed -nE 's/^(pub\(super\) )?const '"$2"': &str = "([^"]+)";$/\2/p' "$1"
}

rust_public_hosts() {
    local matcher member
    local -a members
    matcher=$(sed -n '/^fn public_host(/,/^}/p' "$rust_web" | tr -d '[:space:]')
    [[ $matcher == *'matches!(host,'* ]] || fail "Cannot read public_host in $rust_web."
    matcher=${matcher#*matches!(host,}
    IFS='|' read -ra members <<< "${matcher%%)*}"
    for member in "${members[@]}"; do
        if [[ $member =~ ^\"([a-z0-9.-]+)\"$ ]]; then
            printf '%s\n' "${BASH_REMATCH[1]}"
        elif [[ $member =~ ^[A-Z_]+$ ]]; then
            rust_constant "$rust_web" "$member"
        else
            fail "Unknown public_host matcher in $rust_web."
        fi
    done
}

public_hosts=$(router_hosts agency-web)
admin_hosts=$(router_hosts agency-admin)
pilot_hosts=$(router_hosts agency-sandbox-check)
rust_public=$(rust_public_hosts | host_set)
rust_admin=$(rust_constant core/src/web/admin.rs HOST)
pilot_slug=$(sed -nE 's/^slug=([a-z0-9-]+)$/\1/p' "$publisher")
pilot_suffix=$(rust_constant core/src/site_release.rs SITE_SUFFIX)
first_party=$(printf '%s\n%s\n' "$public_hosts" "$admin_hosts" | host_set)
all_hosts=$(jq -r '.[].hosts[]' <<< "$routers" | host_set)
classified_hosts=$(printf '%s\n%s\n' "$first_party" "$pilot_hosts" | host_set)

require_match "Traefik and Rust public hosts" "$public_hosts" "$rust_public"
require_match "Traefik and Rust Admin hosts" "$admin_hosts" "$rust_admin"
[[ -n $pilot_slug && -n $pilot_suffix ]] || fail "Could not read the publisher slug and Rust site suffix."
require_match "Traefik static pilot and the publisher's Rust site host" "$pilot_hosts" "$pilot_slug$pilot_suffix"
require_match "Traefik router hosts and the mapped public, Admin, and pilot hosts" "$all_hosts" "$classified_hosts"

ci_hosts=$(awk '
    /^[[:space:]]*for host in .*; do$/ {
        hosts = $0
        sub(/^[[:space:]]*for host in /, "", hosts)
        sub(/; do$/, "", hosts)
    }
    /^[[:space:]]*done$/ { hosts = "" }
    /\/healthz/ && hosts != "" { print hosts }
' "$workflow" | host_set)
vps_hosts=$(awk -v opening="done <<'ROUTES'" '
    index($0, opening) { in_routes = 1; next }
    /^ROUTES$/ { in_routes = 0 }
    in_routes { print $1 }
' "$driver" | host_set)

require_match "Traefik first-party routes and Public web CI health checks" "$first_party" "$ci_hosts"
require_match "Traefik first-party routes and Hostinger HTTPS smoke checks" "$first_party" "$vps_hosts"

jq -e '
    .services["agency-web"] |
    .labels as $l |
    .environment.BAPX_ADMIN_PASSWORD_FILE as $password_file |
    .read_only == true and ($l["traefik.enable"] == "true") and
    ((.ports // []) | length == 0) and
    ($l["traefik.http.routers.agency-sandbox-check.middlewares"] |
        split(",") | index("agency-sandbox-headers") != null) and
    $l["traefik.http.middlewares.agency-sandbox-headers.headers.customrequestheaders.Cookie"] == "" and
    $l["traefik.http.middlewares.agency-sandbox-headers.headers.customrequestheaders.Authorization"] == "" and
    any(.volumes[]; .type == "volume" and .source == "agency-web-data" and .target == "/var/lib/bapx-web" and .read_only != true) and
    any(.volumes[]; .type == "volume" and .source == "agency-web-sites" and .target == "/var/lib/bapx-sites" and .read_only == true) and
    any(.volumes[]; .type == "bind" and .target == $password_file and .read_only == true)
' <<< "$config" >/dev/null || fail "Public ingress, storage or pilot request isolation differs from the map in $compose."

require_source "$workflow" 'branches: [main]' 'needs: [app, core]' 'needs: web' \
    'name: agency-web-release' 'docker push' 'StrictHostKeyChecking=yes'
require_source deploy/web.Dockerfile 'RUN corepack pnpm build:web' \
    '/build/gui/apps/www/dist /srv/bapx-web' 'ENTRYPOINT ["/usr/local/bin/bapx-core", "serve-web"]'
require_source core/src/main.rs 'return cloudroom::web::serve().await;' \
    'cloudroom::serve(cloudroom::config::Config::from_env()?).await'
require_source "$driver" 'gh run download' 'check_public "$sha"' 'restore_pending'

contains_host() {
    [[ $'\n'$1$'\n' == *$'\n'"$2"$'\n'* ]]
}

render_map() {
    local name hosts qualifier host host_id router_id target
    cat <<'MAP'
%% Generated by scripts/generate-map.sh. Topology is derived from source, independent of live status.
flowchart TD
  workspace["Agency workspace · AGENTS.md and map.mmd"]

  subgraph build["Source and build"]
    webSource["Landing, Docs, MediaHub and Admin · gui/apps/www/src/build.ts"]
    docsSources["Published Markdown registry · gui/apps/www/src/docs/pages.ts"]
    assets["Static build · pnpm build:web → gui/apps/www/dist"]
    rust["Rust Core build · core/src/main.rs"]
    image["One image · deploy/web.Dockerfile"]
    docsSources --> webSource --> assets
    assets -->|"Copied to /srv/bapx-web"| image
    rust --> image
  end

  subgraph release["First-party web release · .github/workflows/web.yml"]
    main["Push to main"]
    checks["App and Core CI"]
    webChecks["Build and smoke-test the exact web SHA"]
    registry["GHCR image by immutable digest"]
    artifact["agency-web-release · SHA, digest and Compose checksum"]
    ssh["Actions deploy job · pinned SSH · deploy/deploy-web-ssh.sh"]
    rollout["Hostinger systemd rollout · deploy/deploy-web.sh"]
    receipt["Verified deployment receipt and previous healthy image"]
    main --> checks --> webChecks
    webChecks --> registry
    webChecks --> artifact
    webChecks --> ssh
    registry --> rollout
    artifact --> rollout
    ssh --> rollout --> receipt
  end

  subgraph public["Public web on Hostinger · deploy/compose.web.yml"]
    webRouter["Traefik TLS · first-party public routes"]
    adminRouter["Traefik TLS · operator routes"]
    pilotRouter["Traefik TLS · static pilot route"]
    webRuntime["bapx-core serve-web · core/src/web.rs"]
    routing["Landing and privacy · Docs guides · MediaHub cases"]
    readiness["First-party /healthz · exact release SHA"]
    briefs["MediaHub brief intake · core/src/web/inquiry.rs"]
    adminApi["Admin sign-in and authenticated API · core/src/web/admin.rs"]
    staticPilot["Published assets · core/src/web/published.rs"]
    webData["Private writable volume · briefs, notes and published copy"]
    adminSecret["Private read-only bind · Admin sign-in credential"]
    webRouter --> webRuntime
    adminRouter --> webRuntime
    pilotRouter -->|"Strip Cookie and Authorization"| webRuntime
    webRuntime --> routing
    webRuntime --> readiness
    webRuntime --> briefs
    webRuntime --> adminApi
    webRuntime --> staticPilot
    briefs -->|"Persist accepted briefs"| webData
    adminApi -->|"Read briefs and update operator data"| webData
    adminSecret --> adminApi
MAP
    # Keep endpoint-specific overlays and host aliases visible as distinct routes.
    while IFS=$'\t' read -r name hosts qualifier; do
        router_id=${name//-/_}
        for host in $hosts; do
            if contains_host "$public_hosts" "$host"; then
                target=webRouter
            elif contains_host "$admin_hosts" "$host"; then
                target=adminRouter
            else
                target=pilotRouter
            fi
            host_id=${host//./_dot_}
            host_id=${host_id//-/_dash_}
            printf '    ingress_%s_%s["%s%s · %s"] --> %s\n' \
                "$router_id" "$host_id" "$host" "$qualifier" "$name" "$target"
        done
    done < <(jq -r 'sort_by(.name)[] |
        [.name, (.hosts | join(" ")), ([.method, .path] | map(select(length > 0) | " " + .) | join(""))] |
        @tsv' <<< "$routers")
    cat <<'MAP'
  end

  subgraph native["Private desktop and native Core"]
    desktopCI["Desktop packages CI · .github/workflows/desktop-packages.yml"]
    package["macOS, Windows and Linux builds · gui/apps/desktop/"]
    desktop["Electron and bb-app local UI, server and host daemon"]
    coreApi["Private Core API · core/src/lib.rs and core/docs/setup.md"]
    harnesses["Native agent harnesses · core/src/runtime/"]
    journal["Private sessions, history and agent account credentials"]
    skills["Agent Skills · skills/ and local .agents/skills/"]
    desktopCI --> package --> desktop
    desktop -->|"Private bearer-authenticated HTTP/SSE"| coreApi
    coreApi --> harnesses
    coreApi --> journal
    skills -->|"Native discovery"| harnesses
  end

  subgraph customers["Customer workspace and publishing"]
    projects["Private projects · users/account/business/projects/project/"]
    dist["Approved project dist/ snapshot"]
    publish["Operator publish-site · deploy/publish-site.sh and core/src/site_release.rs"]
    siteData["Separate named volume · immutable site revisions"]
    starter["Opt-in standalone app and site-local /admin · starters/app-admin/"]
    appData["Private per-project accounts, credentials and form records"]
    projects --> dist --> publish -->|"Write completed revisions"| siteData
    projects --> starter --> appData
  end

  workspace --> webSource
  workspace --> rust
  workspace --> desktopCI
  workspace --> skills
  workspace --> projects
  image --> webChecks
  rollout -->|"Replace only agency-web, verify routes, restore healthy release on failure"| webRuntime
  readiness -->|"Host TLS smoke checks"| receipt
  rust --> coreApi
  siteData -->|"Read-only mount"| staticPilot
MAP
}

if [[ $mode == stdout ]]; then
    render_map
elif [[ $mode == check ]]; then
    diff -u map.mmd <(render_map) || fail 'map.mmd is stale. Run scripts/generate-map.sh.'
else
    pending=$(mktemp .map.XXXXXXXX)
    trap 'rm -f -- "$pending"' EXIT
    render_map > "$pending"
    chmod 0644 "$pending"
    mv -- "$pending" map.mmd
fi
