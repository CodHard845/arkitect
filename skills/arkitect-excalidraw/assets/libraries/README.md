# Excalidraw libraries

Two tiers.

```
bundled/            36 libraries, 1,162 items - COMMITTED, the primary source
  index.json        flat index of names and sizes; what a search reads
  authors.json      credits, matched against the public catalogue
  ATTRIBUTION.md    the same, readable
  sheets/*.png      numbered contact sheets for libraries with unnamed items
  <slug>.excalidrawlib

index.json          cached copy of the public catalogue     (gitignored)
installed.json      what is installed here on demand        (gitignored)
<slug>.excalidrawlib                                        (gitignored)
```

`bundled/` ships with the plugin so a diagram can be drawn offline and so the
same product always gets the same mark. Its libraries belong to their authors and
remain under their own licences — see `bundled/ATTRIBUTION.md`.

Anything at this level is a **cache**: downloaded on demand, gitignored, and
re-installable in one command:

```bash
node ../../scripts/browse-libraries.mjs --search "kubernetes"
node ../../scripts/browse-libraries.mjs --install <source>
```

See [docs/libraries.md](../../../../docs/libraries.md).
