# Logo cache

Third-party product logos land here — Snowflake, Streamlit, Pinecone, Grafana,
Databricks, and anything else the AWS icon library does not cover.

The contents are **gitignored**. Logos carry their own trademark and licensing terms,
and generated diagrams embed the image directly, so a diagram stays portable whether or
not this cache travels with the repo. If you decide a particular logo belongs in the
repo, force-add it: `git add -f skills/arkitect-drawio/assets/logos/snowflake.png`.

Managed by `scripts/fetch-logo.mjs`:

```bash
S=skills/arkitect-drawio/scripts
node $S/fetch-logo.mjs --url https://example.com/logo.png --name snowflake
node $S/fetch-logo.mjs --file ./downloaded.png --name snowflake   # already on disk
node $S/fetch-logo.mjs --list
node $S/fetch-logo.mjs --inspect snowflake
```

`index.json` records, per logo: file name, MIME type, pixel dimensions, whether the
image has real transparency, SHA-256, and where it came from.

Use them in a spec with `"kind": "logo"`:

```json
{ "id": "sf", "kind": "logo", "logo": "snowflake", "label": "Snowflake", "col": 0, "row": 0 }
```

Sizing fits the longest side to 64px by default — smaller than the 78px AWS service
icons, matching the reference corpus — and preserves aspect, so a wide wordmark comes
out wide and short rather than squashed into a square.
