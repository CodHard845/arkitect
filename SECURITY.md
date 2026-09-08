# Security policy

## Reporting

Please report security issues **privately**, not as a public issue:

- GitHub: open a [private security advisory](https://github.com/mouadja02/arkitect/security/advisories/new)
- or email **mouadpro02@gmail.com** with `[arkitect security]` in the subject

Include what you did, what happened, and — if it is a leak — the shape of the
data that escaped rather than the data itself.

Expect an acknowledgement within a week. Arkitect is maintained by one person in
their own time; a fix follows as fast as that allows, and you will be credited
in the advisory unless you would rather not be.

## What counts as a vulnerability here

Arkitect runs locally, has no server, no account and no runtime dependencies, so
the interesting failure modes are about **data leaving the machine** and about
**what an agent can be talked into doing**:

- Any path by which diagram content reaches the network. That includes a query
  string built from a label, a filename, or anything else out of a diagram.
- Any use of the Draw.io MCP tools that open the hosted editor
  (`open_drawio_xml`, `open_drawio_csv`, `open_drawio_mermaid`) on user content.
- Anything derived from a real diagram surviving into a commit — renders, labels,
  paths, page names, or the redaction digest list.
- A crafted `.drawio` / `.excalidraw` / `.excalidrawlib` file that causes a
  script to write outside its target directory, execute code, or exfiltrate
  anything when merely analysed or validated.
- A crafted spec or logo URL that causes a write outside the intended output
  path.
- Instructions embedded in a diagram or library file that an agent might follow
  as if they came from the user.

## What does not

- The absence of authentication. There is no server to authenticate to.
- The Excalidraw container being reachable on `localhost:3000`. It is the static
  app with no backend; bind it elsewhere with `-Port` if that matters to you.
- Third-party icon libraries containing vendor trademarks. That is attribution,
  not security — see [NOTICE](NOTICE).
- `npx @drawio/mcp` fetching from the npm registry. That is npm's trust model,
  not Arkitect's; `--ignore-scripts` is used to blunt it.

## Supported versions

The latest release on `main`. Arkitect is small enough that the fix is always
"update".
