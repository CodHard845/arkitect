# PLAN — Draw.io icon packs

**Branch:** `icon-packs` · **Status:** awaiting review at Gate 1 (pack contents) · **Last updated:** 2026-09-12

This file is the durable record of the icon-pack work: what was decided, why, what is
verified, and what is left. It exists so this can be picked up cold later.

---

## 1. What we are building

Eighteen Draw.io icon libraries and a pack-aware registry, so an agent drawing a
non-AWS architecture resolves a real product mark from bundled bytes instead of
falling back to a grey box or an ad-hoc web fetch.

```
skills/arkitect-drawio/assets/libraries/
  aws.drawio                      azure.drawio              gcp.drawio
  data-platforms.drawio           databases.drawio          ai-frameworks.drawio
  ml-training.drawio              streaming-orchestration.drawio
  observability.drawio            devops.drawio             security-identity.drawio
  github.drawio                   saas-collab.drawio        languages-runtimes.drawio
  file-types.drawio               agents.drawio             primitives.drawio
  brands.drawio                   (catch-all, ranked last)
  ATTRIBUTION.md  sources.json  contact-sheets/*.png
```

---

## 2. Decision log

Every row was decided explicitly. Rationale is recorded so a future reader can tell
a deliberate choice from an accident.

| # | Decision | Chosen | Why |
|---|---|---|---|
| 1 | Bundling | Commit all packs to git | Matches existing repo practice (AWS palette + 40 Excalidraw libs already committed). Offline-first, no install step. |
| 2 | Plumbing depth | Full multi-pack registry | Only option where one search reaches every pack; per-pack catalogs would push pack-guessing onto the agent. |
| 3 | Colour | Full colour, mono fallback via brand hex | Matches the AWS palette and the "real logos, not grey boxes" rule. |
| 4 | Sources | Vendor-first, aggregator-fallback | Service-level icons (Blob Storage, Pub/Sub) exist *only* in vendor packs; aggregators cover the brand tier. |
| 5 | Asset weight | Verbatim bytes, no minification | Microsoft and AWS both prohibit altering icon shape. Verbatim also keeps sha256-vs-upstream verification meaningful. |
| 6 | Pack scope | 16 themed packs (8 requested + 8 added) | Added: streaming-orchestration, observability, languages-runtimes, primitives, security-identity, saas-collab, databases, ml-training. |
| 7 | Coverage depth | Complete vendor sets + curated packs + CC0 catch-all | Makes "icon missing" rare; catch-all is rank-last so it never outranks a curated match. |
| 8 | Naming | Readable titles, namespaced ids (`azure/data-factory`) | Titles are what draw.io shows and what search matches. Old AWS titles retained as aliases. |
| 9 | Ambiguity | Context bias + per-node pack pin + confidence gate | Prevents a GCP diagram silently receiving an Azure icon, without forcing a prompt per node. |
| 10 | Concept style | Generated tile badges | Gives agents/primitives/GitHub glyphs the same visual weight as an AWS service tile. |
| 11 | File types | Sheet badge + glyph + extension | Keeps `file-types/python` visually distinct from `languages-runtimes/python`. Office marks stay verbatim. |
| 12 | AWS cleanup | Canonicalise existing artwork only | Keep the 243 icons as-is; promote merged to `aws.drawio`, delete the two redundant files, rewrite `--verify`. No upstream rebuild. |
| 13 | Layout | Flat, one file per pack | Mirrors the Excalidraw `bundled/` convention; single registry. |
| 14 | Verification | Contact sheets + tiered visual review | Structural checks cannot catch a mislabel; contact sheets ship as reviewable evidence. |
| 15 | Unlicensed logos | Catalogue, fetch on demand — ship no bytes | Redistribute nothing we lack permission for; agent still gets URL + hash + exact command. |
| 16 | Simple Icons pin | `16.30.0`; the 44 v16 removals become on-demand | Shipping bytes upstream removed on owners' request would undercut the licensing posture. |
| 17 | Delivery | Full ship, push branch, open PR | Authorised explicitly. |

**Gate 1 (here):** pack contents reviewed before any bytes are fetched.

---

## 3. Verified upstreams

All checked live on 2026-09-12.

| Pack(s) | Source | Pin | Licence / terms |
|---|---|---|---|
| azure | `arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V24.zip` | V24 | MS icon terms: copy, distribute, display **for architecture diagrams**; no shape alteration |
| gcp | `services.google.com/fh/files/misc/core-products-icons.zip` + `category-icons.zip` | current | Google icon terms: free use to reference Google technology |
| file-types (Office) | `go.microsoft.com/fwlink/?linkid=869455` → `2024-microsoft-365-content-icons.zip` | 2024 | Same MS icon terms as Azure |
| 12 curated brand packs, brands | npm `simple-icons` | **16.30.0** — 3,459 marks | CC0-1.0 (trademarks remain owners') |
| languages-runtimes, file-types | npm `devicon` | 2.17.0 | MIT |
| agents, primitives | npm `lucide-static` | 1.45.0 | ISC |
| github (UI glyphs) | npm `@primer/octicons` | 19.36.0 | MIT |
| aws | existing committed palette | unchanged | AWS Architecture Icons; see NOTICE |

---

## 4. Schema and code changes

**`references/icon-catalog.json`** becomes pack-aware. Per icon:

```jsonc
{
  "id": "data-platforms/snowflake",   // namespaced, stable
  "pack": "data-platforms",
  "title": "Snowflake",
  "aliases": ["snowflake", "snowflake data cloud"],
  "source": "simple-icons@16.30.0",
  "upstreamId": "snowflake",
  "upstreamUrl": "https://cdn.jsdelivr.net/npm/simple-icons@16.30.0/icons/snowflake.svg",
  "licence": "CC0-1.0",
  "sha256": "…",
  "bytes": "committed",               // or "on-demand"
  "libraryIndex": 17
}
```

On-demand entries carry `"bytes": "on-demand"` plus `upstreamUrl` and expected `sha256`,
and no `libraryIndex`. `find-icon` returns them with the exact `fetch-logo` command;
`build-diagram` fails with that command rather than substituting anything.

**Scripts**

- `scripts/build-packs.mjs` (new) — `--pack <id>` / `--all` / `--verify` / `--refresh <id>`, driven by `assets/libraries/sources.json`. Downloads cache to a gitignored `.cache/`.
- `scripts/find-icon.mjs` — drop the hard-coded `MERGED_FILE`; add `--list-packs`, `--pack`, cross-pack ranking with curated-over-catch-all tie-breaking, and the confidence gate.
- `scripts/build-diagram.mjs` — spec gains `context.packs` and per-node `pack`; hard-fail on ambiguous or on-demand-but-uncached.
- `scripts/extract-library.mjs` — `--verify` rewritten from "two AWS palettes byte-match" to "each pack matches its manifest".
- `tests/drawio.mjs` — extended for registry integrity, alias round-trip, gate behaviour, on-demand handling.

**Docs:** `SKILL.md` (compact 18-line pack index + resolution order), `references/pack-index.md`
(new, full listings, read on demand), `docs/drawio-icons.md` (replace the AWS-merge section),
`docs/icons.md`, `README.md`, `NOTICE` (per-source terms), `CHANGELOG.md`, version to `1.1.0`.

---

## 5. Pack contents — **REVIEW THIS**

Rule: each icon has exactly one home pack; aliases make it findable from any query.
`committed` = bytes ship in the repo. `on-demand` = catalogued with URL + hash, no bytes.

### Vendor packs (whole sets, verbatim)

- **aws** — 243, unchanged artwork, renamed file, readable titles, old titles as aliases.
- **azure** — entire V24 set (~700 expected; exact count confirmed at extraction).
- **gcp** — core products + category icons (~226 expected).

### data-platforms — 22 committed / 12 on-demand

`snowflake databricks clickhouse duckdb apachespark apachehadoop apachehive trino presto teradata cloudera apachedruid apachedoris singlestore minio apacheparquet looker metabase apachesuperset qlik microstrategy apachekylin`

*on-demand:* `apacheiceberg deltalake tableau powerbi dremio starrocks firebolt motherduck vertica greenplum apachehudi apachepinot`

### databases — 28 committed / 5 on-demand

`postgresql mysql mariadb sqlite mongodb redis apachecassandra couchbase apachecouchdb neo4j elasticsearch opensearch influxdb timescale cockroachlabs planetscale supabase firebase arangodb dgraph etcd scylladb surrealdb tidb vitess prisma sqlalchemy dbeaver`

*on-demand:* `oracle microsoftsqlserver memcached questdb yugabytedb`

*note:* DynamoDB and RDS come from the **aws** pack — not duplicated here.

### ai-frameworks — 30 committed / 13 on-demand

`langchain langgraph crewai n8n anthropic huggingface ollama mistralai googlegemini perplexity replicate openrouter dify gradio streamlit milvus pydantic zapier make haystack deepseek meta claude v0 cursor windsurf lmstudio modelcontextprotocol vllm qdrant`

*on-demand:* `openai langsmith llamaindex pinecone weaviate chroma cohere groq flowise chainlit autogen semantickernel xai`

### ml-training — 24 committed / 7 on-demand

`pytorch tensorflow keras scikitlearn numpy pandas scipy mlflow weightsandbiases ray dvc onnx nvidia jupyter googlecolab kaggle optuna polars dask roboflow ultralytics opencv spacy bentoml`

*on-demand:* `xgboost kubeflow openvino comet clearml tensorboard langfuse`

### streaming-orchestration — 16 committed / 16 on-demand

`apachekafka apacheflink apachepulsar rabbitmq natsdotio apacheairflow prefect apachenifi celery argo apachestorm mqtt temporal airbyte matillion talend`

*on-demand:* `dbt apachebeam redpanda confluent debezium apachesamza zeromq apacheactivemq apachezookeeper mage kestra dagster luigi estuary fivetran informatica`

### observability — 22 committed / 4 on-demand

`grafana prometheus opentelemetry datadog elastic elasticstack kibana logstash splunk sentry newrelic dynatrace jaeger pagerduty opsgenie uptimekuma victoriametrics betterstack graylog fluentbit fluentd statuspage`

*on-demand:* `nagios zabbix honeycomb grafanaloki`

### devops — 46 committed / 7 on-demand

`terraform ansible jenkins kubernetes docker helm gitlab circleci travisci teamcity puppet chef vagrant packer consul nomad podman containerd rancher redhatopenshift istio linkerd envoyproxy nginx traefikproxy apache caddy cloudflare pulumi tekton spinnaker jfrog k3s skaffold buildkite gitea bitbucket kubespray openstack vmware proxmox ubuntu debian alpinelinux redhat nixos`

*on-demand:* `haproxy crossplane fluxcd harness sonarqube minikube systemd`

### security-identity — 23 committed / 3 on-demand

`vault keycloak auth0 okta owasp snyk trivy falco cilium letsencrypt openssl jsonwebtokens openid 1password bitwarden hashicorp fortinet paloaltonetworks wireguard openvpn tailscale authelia authentik`

*on-demand:* `onelogin openpolicyagent crowdstrike`

### github — 7 brand + ~32 Octicon concept tiles

*brand (Simple Icons):* `github githubactions githubcopilot githubpages githubsponsors git gitlfs`

*concepts (Octicons, MIT, tiled `#24292F`):* `git-pull-request git-merge git-branch git-commit git-compare issue-opened issue-closed issue-reopened repo repo-forked tag milestone project package workflow shield-check bug comment-discussion people rocket codespaces code-review star eye check-circle x-circle alert dependabot codescan container gear`

### saas-collab — 22 committed / 7 on-demand

`jira atlassian confluence notion linear asana trello discord zoom miro figma googledrive zendesk intercom hubspot stripe mailchimp airtable clickup basecamp loom calendly`

*on-demand:* `slack microsoftteams servicenow salesforce twilio sendgrid monday`

### languages-runtimes — 47 committed / 3 on-demand

`python openjdk go rust javascript typescript nodedotjs deno bun scala kotlin swift ruby php cplusplus c r julia perl elixir haskell lua dart flutter react vuedotjs angular svelte nextdotjs django flask fastapi spring dotnet express rubyonrails laravel graphql openapiinitiative apachemaven gradle npm pnpm yarn anaconda pypi quarkus`

*on-demand:* `csharp grpc micronaut`

### file-types — ~35 composite sheets

*glyph-bearing:* `md py json yaml xml html css js ts sql parquet ipynb tf sh dockerfile toml svg graphql`

*house sheets (no brand glyph):* `csv txt log env ini avro orc proto drawio excalidraw mmd png zip pdf`

*Office, verbatim MS marks:* `docx xlsx pptx`

### agents — ~33 tiled concept icons (Lucide, violet)

`agent multi-agent orchestrator router handoff thinking reasoning planning memory short-term-memory long-term-memory tracing tokens context-window tool-call function-calling mcp-server retrieval rag vector-store embedding knowledge-base prompt system-prompt guardrail evaluation human-in-the-loop feedback-loop checkpoint streaming session sandbox fine-tuning`

### primitives — ~43 tiled concept icons (Lucide, slate)

`user actor admin server database datastore queue topic api api-gateway load-balancer firewall cache lock key secret certificate cluster container scheduler cron webhook file folder bucket network vpn dns cdn monitor alert report dashboard pipeline transform batch stream event mobile browser desktop iot-device edge`

### brands — 3,459 (all of simple-icons@16.30.0)

Catch-all safety net. Ranked strictly below every curated pack; results labelled as
catch-all so a weak match is visibly a weak match.

**Totals:** ~287 curated brand marks + ~76 concept tiles + ~35 file sheets + ~1,170
vendor icons + 3,459 catch-all ≈ **5,000 entries**, of which **77 are on-demand**.

---

## 6. Phases

- [x] **0. Interview + decisions** — 17 decisions recorded above
- [ ] **1. Gate 1 — pack contents reviewed** ← *you are here*
- [ ] **2. `sources.json` + `build-packs.mjs`**, vendor extraction, hashes pinned
- [ ] **3. Vendor packs** — aws canonicalised, azure, gcp built and counted
- [ ] **4. Brand packs** — 12 curated + catch-all, on-demand entries recorded
- [ ] **5. Generated packs** — agents, primitives, github concepts, file-type sheets
- [ ] **6. Registry + resolver refactor** — catalog schema, find-icon, build-diagram, extract-library
- [ ] **7. Verification** — invariants, contact sheets, tiered visual review (Gate 2)
- [ ] **8. Docs + NOTICE + ATTRIBUTION + CHANGELOG + v1.1.0**
- [ ] **9. Tests green, push branch, open PR**

---

## 7. Accepted risks

1. **Repo weight** — 44 MB to ~54 MB working tree; npm tarball grows correspondingly.
   Accepted for offline determinism (decision 1). Partly offset by deleting 8.8 MB of
   duplicate AWS bytes (decision 12).
2. **AWS stays partial** — 243 icons with bloated ~23 KB SVGs, and the only pack not
   built by `build-packs.mjs`. Deliberate (decision 12); rebuilding from upstream is a
   recorded follow-up.
3. **Catch-all noise** — 3,459 brands make junk reachable ("delta" matching the airline).
   Mitigated by rank-last plus visible labelling, not eliminated.
4. **On-demand hash drift** — vendors rewrite logo URLs; a pinned sha256 will eventually
   mismatch. Policy: warn loudly with both hashes and require explicit confirmation;
   never silently accept.
5. **Vendor terms are permissions, not licences** — Microsoft and Google grant use for
   architecture diagrams and reserve all other rights. NOTICE must state this precisely
   and carry a takedown path.

## 8. Follow-ups (not in v1)

- Mirror packs into `arkitect-excalidraw` (decision 16 deferred it).
- Rebuild AWS from the official Asset Package to triple coverage and unify the builder.
- Quarterly `--refresh` cadence for Azure/GCP as vendors rev their sets.
