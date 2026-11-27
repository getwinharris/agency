#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

fail() {
    printf 'Agency inventory: %s\n' "$*" >&2
    exit 1
}

mode=write
case $# in
    0) ;;
    1) case $1 in
        --check) mode=check ;;
        --stdout) mode=stdout ;;
        --index-stdout) mode=index ;;
        *) fail 'Usage: scripts/generate-map.sh [--check | --stdout | --index-stdout]' ;;
    esac ;;
    *) fail 'Usage: scripts/generate-map.sh [--check | --stdout | --index-stdout]' ;;
esac

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
workflow=.github/workflows/web.yml
compose=deploy/compose.web.yml
rust_web=core/src/web.rs
driver=deploy/deploy-web.sh
publisher=deploy/publish-site.sh
dockerfile=deploy/web.Dockerfile
docs_registry=gui/apps/www/src/docs/pages.ts
workspace_config=gui/pnpm-workspace.yaml
index=docs/project-index.json

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
        "PathPrefix\\(`(/api/(?:auth|admin)/)`\\)" as $prefix |
        "Method\\(`([A-Z]+)`\\)" as $method |
        {name: $name, hosts: ([$rule | scan($host) | .[0]] | unique),
            path: ([$rule | scan($path) | .[0]] | first // ""),
            prefix: ([$rule | scan($prefix) | .[0]] | first // ""),
            method: ([$rule | scan($method) | .[0]] | first // ""),
            valid: (($name | test("^[a-z0-9-]+$")) and
                $labels["\($key).service"] == "agency-web" and
                $labels["\($key).tls"] == "true" and
                $labels["\($key).entrypoints"] == "websecure" and
                ($rule | test("^\\s*" + $host + "(\\s*\\|\\|\\s*" + $host + ")*\\s*$") or
                    test("^Host\\(`bapx\\.in`\\)\\s*&&\\s*" + $prefix + "$") or
                    (split("&&") | map(gsub("^\\s+|\\s+$"; "")) |
                        length == 3 and any(.[]; test("^" + $host + "$")) and
                        any(.[]; test("^" + $path + "$")) and any(.[]; test("^" + $method + "$")))))}
    ] | select(length > 0 and all(.[]; .valid and (.hosts | length > 0)))
' <<< "$config") || fail "The agency-web routers in $compose must declare HTTPS hosts and scoped endpoint rules."

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

guides=$(sed -n '/^const guides = \[/,/^];$/p' "$docs_registry" | sed '1d;$d;/^[[:space:]]*$/d')
doc_rows=$(sed -nE 's/^[[:space:]]*\{ slug: "([a-z0-9-]+)", label: "[^"]+", source: "([a-zA-Z0-9_./-]+\.md)"(, section: "[^"]+")? \},?$/\1\t\2/p' <<< "$guides")
[[ -n $doc_rows && $(wc -l <<< "$guides") == "$(wc -l <<< "$doc_rows")" ]] ||
    fail "Could not inventory every guide in $docs_registry."
doc_slugs=$(cut -f1 <<< "$doc_rows")
[[ $(wc -l <<< "$doc_slugs") == "$(sort -u <<< "$doc_slugs" | wc -l)" ]] ||
    fail "Duplicate guide slugs in $docs_registry."
ci_doc_slugs=$(awk '
    /^[[:space:]]*for slug in .*; do$/ {
        slugs = $0
        sub(/^[[:space:]]*for slug in /, "", slugs)
        sub(/; do$/, "", slugs)
    }
    /^[[:space:]]*done$/ { slugs = "" }
    /^[[:space:]]*curl --fail / && slugs != "" &&
        index($0, "-H \047Host: docs.bapx.in\047") &&
        index($0, "\"http://127.0.0.1:8080/$slug/\"") { print slugs }
' "$workflow" | host_set)
require_match "Published Docs slugs and Public web CI smoke checks" \
    "$(host_set <<< "$doc_slugs")" "$ci_doc_slugs"

# Inspect COPY inputs in the pages stage. A copy into the Rust stage does not
# make a Markdown guide available to the web asset builder.
pages_inputs=$(awk '
    /^FROM / { if (pages) exit; pages = $NF == "pages" }
    pages && /^COPY [^ -]/ { for (i = 2; i < NF; i++) print $i }
' "$dockerfile")
pr_inputs=$(awk '
    /^  pull_request:$/ { pr = 1; next }
    pr && /^  [^ ]/ { exit }
    pr && /^    paths:$/ { paths = 1; next }
    paths && /^    [^ ]/ { exit }
    paths { print }
' "$workflow" | sed -E "s@^      - '([^']+)'\$@\1@; /^[[:space:]]*(#|\$)/d")

# The current filters use exact files and directory-wide /** includes. Reject
# unsupported forms instead of silently interpreting different glob semantics.
normalized_pr_inputs=$(
    while IFS= read -r pattern; do
        if [[ $pattern =~ ^[a-zA-Z0-9_./-]+$ ]]; then
            printf '%s\n' "$pattern"
        elif [[ $pattern =~ ^[a-zA-Z0-9_./-]+/\*\*$ ]]; then
            printf '%s\n' "${pattern%\*\*}"
        else
            fail "Unsupported Public web PR path filter: $pattern."
        fi
    done <<< "$pr_inputs"
)

covered_input() {
    local source=$1 input
    while IFS= read -r input; do
        [[ $source == "$input" || ( $input == */ && $source == "$input"* ) ]] && return 0
    done <<< "$2"
    return 1
}

while IFS=$'\t' read -r slug source; do
    [[ -f $source ]] && git ls-files --error-unmatch -- "$source" >/dev/null 2>&1 ||
        fail "Guide $slug references a missing or untracked source: $source."
    covered_input "$source" "$pages_inputs" ||
        fail "Guide $slug source is missing from the web image pages stage: $source."
    covered_input "$source" "$normalized_pr_inputs" ||
        fail "Guide $slug source is missing from Public web PR path coverage: $source."
done <<< "$doc_rows"

jq -e '
    .services["agency-web"] |
    .labels as $l |
    .environment.BAPX_ADMIN_PASSWORD_FILE as $password_file |
    .read_only == true and ($l["traefik.enable"] == "true") and
    ((.ports // []) | length == 0) and
    $l["traefik.http.routers.agency-web.middlewares"] == "agency-public" and
    $l["traefik.http.middlewares.agency-public.headers.customrequestheaders.Cookie"] == "" and
    $l["traefik.http.routers.agency-account.rule"] == "Host(`bapx.in`) && PathPrefix(`/api/auth/`)" and
    $l["traefik.http.routers.agency-account-admin.rule"] == "Host(`bapx.in`) && PathPrefix(`/api/admin/`)" and
    $l["traefik.http.routers.agency-account-login.rule"] == "Host(`bapx.in`) && Path(`/api/auth/sign-in`) && Method(`POST`)" and
    $l["traefik.http.routers.agency-account-signup.rule"] == "Host(`bapx.in`) && Path(`/api/auth/signup`) && Method(`POST`)" and
    ($l["traefik.http.routers.agency-account.middlewares"] // "") == "" and
    ($l["traefik.http.routers.agency-account-admin.middlewares"] // "") == "" and
    $l["traefik.http.routers.agency-account-login.middlewares"] == "agency-admin-rate" and
    $l["traefik.http.routers.agency-account-signup.middlewares"] == "agency-admin-rate" and
    (($l["traefik.http.routers.agency-web.priority"] | tonumber) as $public |
     ($l["traefik.http.routers.agency-account.priority"] | tonumber) as $account |
     $account > $public and
     ($l["traefik.http.routers.agency-account-admin.priority"] | tonumber) > $public and
     ($l["traefik.http.routers.agency-account-login.priority"] | tonumber) > $account and
     ($l["traefik.http.routers.agency-account-signup.priority"] | tonumber) > $account) and
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
require_source "$dockerfile" 'RUN corepack pnpm build:web' \
    '/build/gui/apps/www/dist /srv/bapx-web' 'ENTRYPOINT ["/usr/local/bin/bapx-core", "serve-web"]'
require_source core/src/main.rs 'return cloudroom::web::serve().await;' \
    'cloudroom::serve(cloudroom::config::Config::from_env()?).await' \
    'return cloudroom::business_sandbox::serve(policy.as_ref()).await;'
require_source "$driver" 'gh run download' 'check_public "$sha"' 'restore_pending'

contains_host() {
    [[ $'\n'$1$'\n' == *$'\n'"$2"$'\n'* ]]
}

render_map() {
    local name hosts qualifier host host_id router_id target
    cat <<'MAP'
%% Generated by scripts/generate-map.sh. Topology is derived from source, independent of live status.
flowchart TD
  workspace["Agency workspace · AGENTS.md and docs/project-index.json"]

  subgraph build["Source and build"]
    webSource["Landing, Docs, MediaHub, accounts and Admin · gui/apps/www/src/build.ts"]
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
    browserQA["Independent browser QA on the deployed SHA · AGENTS.md"]
    main --> checks --> webChecks
    webChecks --> registry
    webChecks --> artifact
    webChecks --> ssh
    registry --> rollout
    artifact --> rollout
    ssh --> rollout --> receipt
    receipt --> browserQA
  end

  subgraph public["Public web on Hostinger · deploy/compose.web.yml"]
    webRouter["Traefik TLS · first-party public routes"]
    accountRouter["Traefik TLS · apex account and operator API"]
    adminRouter["Traefik TLS · operator routes"]
    pilotRouter["Traefik TLS · static pilot route"]
    webRuntime["bapx-core serve-web · core/src/web.rs"]
    routing["Landing and privacy · Docs guides · MediaHub cases"]
    readiness["First-party /healthz · exact release SHA"]
    briefs["MediaHub brief intake · core/src/web/inquiry.rs"]
    adminApi["Admin sign-in and authenticated API · core/src/web/admin.rs"]
    accountApi["Apex signup, role checks and sign-in · core/src/web/accounts.rs"]
    staticPilot["Published assets · core/src/web/published.rs"]
    webData["Private writable volume · accounts, briefs, notes and published copy"]
    adminSecret["Private read-only bind · Admin sign-in credential"]
    webRouter --> webRuntime
    accountRouter -->|"Forward host-only session"| webRuntime
    adminRouter --> webRuntime
    pilotRouter -->|"Strip Cookie and Authorization"| webRuntime
    webRuntime --> routing
    webRuntime --> readiness
    webRuntime --> briefs
    webRuntime --> adminApi
    webRuntime --> accountApi
    webRuntime --> staticPilot
    briefs -->|"Persist accepted briefs"| webData
    adminApi -->|"Read briefs and update operator data"| webData
    accountApi -->|"Persist invitations and accounts"| webData
    accountApi -->|"Verify operator role"| adminApi
    adminSecret --> adminApi
MAP
    # Keep endpoint-specific overlays and host aliases visible as distinct routes.
    while IFS=$'\t' read -r name hosts qualifier; do
        router_id=${name//-/_}
        for host in $hosts; do
            if [[ $name == agency-account* ]]; then
                target=accountRouter
            elif contains_host "$public_hosts" "$host"; then
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
        [.name, (.hosts | join(" ")), ([.method, .path, .prefix] | map(select(length > 0) | " " + .) | join(""))] |
        @tsv' <<< "$routers")
    cat <<'MAP'
  end

  subgraph native["Private desktop and native Core"]
    desktopCI["Desktop packages CI · .github/workflows/desktop-packages.yml"]
    package["macOS, Windows and Linux builds · gui/apps/desktop/"]
    desktop["Electron and bb-app local UI, server and host daemon"]
    coreApi["Private Core API · core/src/lib.rs and core/docs/setup.md"]
    workspaceGrant["Approved member workspace · core/src/workspace_access.rs"]
    harnesses["Native agent harnesses · core/src/runtime/"]
    journal["Private sessions, history and agent account credentials"]
    skills["Agent Skills · skills/ and local .agents/skills/"]
    desktopCI --> package --> desktop
    desktop -->|"Private bearer-authenticated HTTP/SSE"| coreApi
    workspaceGrant -->|"Resolve a dedicated private Core"| coreApi
    coreApi --> harnesses
    coreApi --> journal
    skills -->|"Native discovery"| harnesses
  end

  subgraph sandbox["Opt-in business workspace pilot · core/docs/business-sandbox.md"]
    sandboxPolicy["Private worker policy · account, business and project grants"]
    sandboxRunner["Loopback business sandbox · core/src/business_sandbox/"]
    sandboxVolume["Project-scoped durable volume and per-job scratch"]
    sandboxPolicy -->|"Authorizes and revokes jobs"| sandboxRunner
    sandboxRunner -->|"Run on a disposable Linux worker"| sandboxVolume
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
  rust --> sandboxRunner
  siteData -->|"Read-only mount"| staticPilot
MAP
}

render_index() {
    local pattern
    local -a package_paths=(gui/package.json)
    local workspace_patterns
    workspace_patterns=$(awk '
        /^packages:$/ { in_packages = 1; next }
        in_packages && /^[^[:space:]#]/ { exit }
        in_packages && !/^[[:space:]]*(#|$)/ { print }
    ' "$workspace_config" | sed -E 's/^  - "([^"]+)"$/\1/')
    [[ -n $workspace_patterns ]] || fail "Could not read packages in $workspace_config."
    while IFS= read -r pattern; do
        if [[ $pattern =~ ^[a-zA-Z0-9_/-]+/\*$ ]]; then
            package_paths+=(":(glob)gui/$pattern/package.json")
        elif [[ $pattern == '!**/.bundled-stage-*' ]]; then
            package_paths+=(":(glob,exclude)gui/${pattern#!}/package.json")
        else
            fail "Unsupported workspace package filter in $workspace_config: $pattern."
        fi
    done <<< "$workspace_patterns"
    git ls-files -z -- .github/workflows gui/apps/www/src core/src/web \
        ':(glob)core/src/*.rs' ':(glob)core/src/*/mod.rs' \
        ':(glob)skills/**/SKILL.md' "${package_paths[@]}" |
    jq -Rs --argjson routes "$routers" \
        --arg compose "$compose" --arg docs "$doc_rows" --arg registry "$docs_registry" \
        --arg workflow "$workflow" --arg driver "$driver" --arg dockerfile "$dockerfile" \
        --arg workspace_config "$workspace_config" '
        (split("\u0000") | map(select(length > 0)) | unique) as $tracked |
        {
            generated_by: "scripts/generate-map.sh",
            scope: "Tracked source and declared routes. Verify live behavior separately.",
            routes: [
                $routes[] as $router | $router.hosts[] | {
                    host: .,
                    router: $router.name,
                    method: ($router.method | if . == "" then null else . end),
                    path: ($router.path | if . == "" then null else . end),
                    source: $compose
                } + (if $router.prefix == "" then {} else {path_prefix: $router.prefix} end)
            ] | sort_by(.host, .path, .method, .router),
            docs: {
                registry: $registry,
                guides: ($docs | split("\n") | map(split("\t") | {slug: .[0], source: .[1]}) | sort_by(.slug))
            },
            release: {workflow: $workflow, smoke_driver: $driver, image: $dockerfile},
            workspace_config: $workspace_config,
            sources: {
                workflows: [$tracked[] | select(test("^\\.github/workflows/[^/]+\\.ya?ml$"))],
                rust_entry_points: [$tracked[] | select(test("^core/src/([^/]+\\.rs|[^/]+/mod\\.rs)$"))],
                web_runtime_sources: [$tracked[] | select(startswith("core/src/web/"))],
                web_sources: [$tracked[] | select(startswith("gui/apps/www/src/"))],
                workspace_packages: [$tracked[] | select(startswith("gui/") and endswith("/package.json"))],
                bundled_skills: [$tracked[] | select(endswith("/SKILL.md") and startswith("skills/"))]
            }
        }
    '
}

if [[ $mode == stdout ]]; then
    render_map
elif [[ $mode == index ]]; then
    render_index
elif [[ $mode == check ]]; then
    diff -u map.mmd <(render_map) || fail 'map.mmd is stale. Run scripts/generate-map.sh.'
    diff -u "$index" <(render_index) || fail "$index is stale. Run scripts/generate-map.sh."
else
    mkdir -p docs
    pending_map=$(mktemp .map.XXXXXXXX)
    trap 'rm -f -- "$pending_map" "${pending_index:-}"' EXIT
    pending_index=$(mktemp docs/.project-index.XXXXXXXX)
    render_map > "$pending_map"
    render_index > "$pending_index"
    chmod 0644 "$pending_map" "$pending_index"
    mv -- "$pending_map" map.mmd
    mv -- "$pending_index" "$index"
fi
