# Cellular Automata Sandbox

A 3D falling-sand sandbox that runs in the browser: pour sand, water, lava and fire and watch them interact.

**Play it:** https://zhenga1.github.io/Cellular-Automata-Game-Serving/ (the simulation itself is at `sim.html`) (needs a browser with WebGL 2)

The original C++/OpenGL project (CS184 final project) is compiled to WebAssembly with Emscripten. This repo only holds the built files that GitHub Pages serves.

## Controls

| Input | Action |
| --- | --- |
| Left-drag | Look around |
| Right-drag | Pan |
| `W` `A` `S` `D` / arrow keys | Move |
| `Space` / `Shift` | Up / down |
| Scroll | Move the red cursor box nearer / farther |
| `F` | Place the selected material at the cursor box |
| `1`–`0`, `X` | Pick a material / delete |
| `[` `]` | Brush size |
| `P` | Pause / resume |
| `C` | Show / hide the cursor box |
| `L` | Toggle gravity |
| `H` | Hide the control panel |

The panel also has spawners (blocks that keep emitting a material), reset, and saving/loading world files.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Home page with the Simulation and Play (coming soon) modes, from `web/home.html` |
| `preview.jpg` | Screenshot used on the home page |
| `sim.html` | The simulation page, built from `web/shell.html` in the source repo |
| `sim.js` | Emscripten loader and runtime |
| `sim.wasm` | The compiled simulation |
| `sim.data` | The starting world (`begin.demo`) |

## Rebuilding

In the source repo (`cs184-final-proj`, branch `aaron_web_edit`), in a terminal where `emsdk_env` has been run:

```powershell
./build_web.ps1 -Deploy C:\path\to\this\repo
```

Then commit and push this repo. The build tags every file URL with a hash of the build, so browsers never combine a new `index.js` with a cached old `index.data`.
