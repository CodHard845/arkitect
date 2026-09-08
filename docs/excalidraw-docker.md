# The local Excalidraw container

The real Excalidraw app, served from a container on your machine. It is
**optional** — Arkitect generates, validates and previews scenes without it —
but it is the ground truth for appearance, and where hand-editing happens.

## Start it

```bash
docker compose -f docker/docker-compose.yml up -d     # http://localhost:3000
docker compose -f docker/docker-compose.yml down
EXCALIDRAW_PORT=8080 docker compose -f docker/docker-compose.yml up -d
```

Or through the helper, which also waits until the app actually answers, opens
the browser and reveals a file for you to drag in:

```powershell
$S = "skills/arkitect-excalidraw/scripts"

& $S/excalidraw-docker.ps1 -Up                              # http://localhost:3000
& $S/excalidraw-docker.ps1 -Open -Path docs/architecture.excalidraw
& $S/excalidraw-docker.ps1 -Library                         # reveal your icon library
& $S/excalidraw-docker.ps1 -Status
& $S/excalidraw-docker.ps1 -Logs
& $S/excalidraw-docker.ps1 -Down
& $S/excalidraw-docker.ps1 -Up -Port 8080                   # somewhere else
```

The first run pulls a few hundred megabytes; the script polls the URL until it
responds rather than assuming.

## What it is

`excalidraw/excalidraw:latest`, the official image: the same static app as
excalidraw.com, served by nginx on container port 80.

The compose file runs it read-only with `no-new-privileges` and tmpfs for
nginx's scratch directories. It needs no writable filesystem because it is
entirely client-side.

It also overrides the image's healthcheck. The built-in one fetches
`http://localhost` from inside the container, which resolves to `::1`, while
nginx there is configured `listen 80;` — IPv4 only. The container ends up
reporting `unhealthy` forever while serving perfectly well. The override is the
same check against `127.0.0.1`.

## What it can and cannot do

**No backend.** Scenes live in the browser's local storage and in the files you
open. Two things follow, and both matter:

- **There is no server-side save.** The `.excalidraw` file on disk is the source
  of truth. Editing in the browser and closing the tab does not write the file —
  export it back over the original (File → Save to disk).
- **The app cannot open a file off your disk by itself.** No `?file=` parameter,
  no local file API. That is why `-Open` starts the container, opens the
  browser, copies the path to the clipboard and reveals the file in Explorer:
  drag it onto the canvas.

Dropping a `.excalidraw` file replaces the canvas. Dropping a `.excalidrawlib`
file adds it to the library sidebar — which is what `-Library` sets up for the
house icon library.

**Live collaboration is not included.** That needs `excalidraw-room` as a second
service. It is deliberately left out: it is another moving part, and this kit is
for one person drawing with an agent.

## The container versus the SVG preview

Two ways to look at a scene, for two different questions.

| | `arkitect excalidraw render` | the container |
|---|---|---|
| answers | does the layout work? | what does it actually look like? |
| speed | instant, scriptable, readable as an image by the agent | a browser and a drag |
| fidelity | geometry exact; fonts substituted, fills flat | exact |

The agent uses the preview to iterate — it can read a PNG back and fix spacing,
routing and label collisions without a human in the loop. The container is the
ground truth, and where hand-editing happens.

Excalidraw's fonts (Excalifont and friends) are not installed outside the app,
so preview text runs a little wider than the real thing; the preview inflates
text boxes when sizing the canvas so nothing at the edge gets sliced off. Judge
layout from the preview, typography from the container.

## Privacy

The image is the plain static app. It has no telemetry backend of its own and
nothing you draw leaves the machine.

One thing does reach out: the app's **Browse libraries** button opens
`libraries.excalidraw.com`. That is a public catalogue and sends nothing about
your scene, but if the machine is offline the button simply does nothing.
`arkitect excalidraw browse` gives you the same catalogue with a local cache — see
[excalidraw-libraries.md](excalidraw-libraries.md).

## Troubleshooting

**"Docker is not available"** — Docker Desktop is not running. Start it and
retry.

**Port already in use** — `-Port 8080`, or `EXCALIDRAW_PORT=8080` with compose.

**Started but the URL does not answer** — `-Logs`, and check nothing else holds
the port. On a slow first pull, `-Up -TimeoutSeconds 300`.

**The canvas is empty after dropping a file** — Excalidraw refuses a scene it
cannot parse. Run `arkitect excalidraw validate` on it; the error will name the
element.
