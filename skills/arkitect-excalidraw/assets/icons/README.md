# Icon store

Icons built from real product logos by `make-icon.mjs`, plus the merged
`house.excalidrawlib` you can drag into the Excalidraw container to get them all
in the library sidebar.

```
index.json              one entry per icon: kind, source URL, dimensions, transparency, digest
<name>.svg|.png         the original bytes, kept so --restyle needs no second download
items/<name>.excalidrawlib   one library item per icon
house.excalidrawlib     every icon, rebuilt on each change
```

**The contents are gitignored.** Product logos carry their own trademark and
licensing terms, and a generated scene embeds or inlines the artwork anyway, so
a diagram stays portable whether or not this cache travels with it. If a
particular icon belongs in the repository, force-add it:

```bash
git add -f skills/arkitect-excalidraw/assets/icons/dbt.svg
```

Build one with:

```bash
node ../../scripts/make-icon.mjs --url https://.../logo.svg --name product --trace
```

See [docs/icons.md](../../../../docs/icons.md).
