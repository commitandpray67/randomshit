# glwireframe — force wireframe rendering on AMD GPUs (Linux, OpenGL)

NVIDIA's old drivers had a "wireframe" toggle in the control panel; AMD's
Mesa drivers (radeonsi) expose no such option. This project adds one: a
small `LD_PRELOAD` library that forces
`glPolygonMode(GL_FRONT_AND_BACK, GL_LINE)` before every OpenGL draw call,
so any GL application renders as wireframe. It works with any driver, but
exists because AMD has no built-in switch.

## Build

```sh
make
```

Produces `libglwireframe.so`. Only needs a C compiler — no GL dev headers.

## Use

Run any OpenGL program through the launcher:

```sh
./wireframe-run glxgears
./wireframe-run blender
```

Or inject manually:

```sh
LD_PRELOAD=/path/to/libglwireframe.so some-gl-app
```

For Steam games, set the launch options to:

```
LD_PRELOAD=/path/to/libglwireframe.so %command%
```

## Options

| Control | Effect |
|---|---|
| `WIREFRAME=0` (env var) | start with wireframe off (default is on) |
| `kill -USR1 <pid>` | toggle wireframe on/off while the app is running |

When wireframe is toggled off, the application's own `glPolygonMode`
setting is restored.

## Limitations

- **OpenGL only.** Vulkan games are untouched — Vulkan has no global
  polygon-mode state; forcing wireframe there requires a Vulkan layer that
  rewrites pipeline creation.
- **Desktop GL only.** OpenGL ES has no `glPolygonMode`, so GLES apps
  (and some Wayland-native toolkits) can't be forced this way.
- Linux only. On Windows, use per-app options (most engines have a
  wireframe console command) since AMD Adrenalin has no global toggle
  either.
- The toggle uses `SIGUSR1`; the rare app that installs its own `SIGUSR1`
  handler will conflict with it.
