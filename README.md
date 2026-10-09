# Viper

Viper is a visual desktop application builder written in Python. Both the IDE
and its application runtime target Windows and Linux using one shared designer,
project format and component renderer.

## Native hosts

- Windows: Microsoft WebView2 (Chromium), explicitly selected through pywebview.
- Linux: GTK 4 + WebKitGTK 6.0 through PyGObject.
- macOS: deferred, with an adapter extension point.

Platform detection and native libraries are isolated in `viper/hosts/`. Windows
does not require GTK. Architecture requirements and verification history are in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Install and run

Use Python 3.11 or later. On Windows, install Microsoft WebView2 Runtime, then:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .
python -m viper.main
```

On Linux, install GTK 4, WebKitGTK 6.0 and PyGObject using your distribution's
packages. For Ubuntu/Debian distributions providing WebKitGTK 6.0, the package
names are `gir1.2-gtk-4.0`, `gir1.2-webkit-6.0` and `python3-gi`. Use the system
Python environment or expose those system packages to your virtual environment:

```bash
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
python -m pip install -e .
python -m viper.main
```

## Milestone 1

The scaffold now connects Python state to the actual designer. Click or drag a
palette component to add it; select and drag to move it, or drag its lower-right
corner handle to resize. Four circular edge-midpoint anchors connect hard layout
links; matching green anchors surround the window's client area. Each element
has a small Fixed/Stretch dropdown near its top-right corner. The inspector
edits name, text and rectangle geometry. Duplicate
and Delete act on selection. Save/Open use native JSON file dialogs. Preview
uses the same real controls as Run; Run opens a separate native runtime process.
Save before replacing a project with New or Open.

The permanent **File**, **Edit**, **Insert**, **Layout**, **View** and **Run** menus
sit above the workspace, with a compact Save, Undo/Redo, snapping, Preview and Run
toolbar. Insert's Widgets and Controls submenu uses the same creation commands
as the palette. Right-click an element for Duplicate, Delete, Align, Connect
Anchors and Properties. Unsupported features, including Undo/Redo, clipboard,
multi-selection alignment, hierarchy, additional windows and packaging, appear
disabled. Save As uses the existing native save destination dialog. Stop Preview
returns to editing; separately launched applications use their native close button.

Use F10 or Alt plus a menu's first letter to focus/open the menus, arrow keys to
navigate submenus, Enter to activate, and Escape to close. Ctrl+S saves, Ctrl+O
opens, Ctrl+N creates a project, Ctrl+D duplicates and Delete removes the selected
element. F6 toggles Preview, F5 runs, and Shift+F5 stops Preview. Text fields retain
their normal editing shortcuts. View's Zoom menu also provides Ctrl+=, Ctrl+-
and Ctrl+0 for zoom in, out and reset/fit.

**Show Grid**, **Snap to Grid** and **Snap to Elements** are independent editor
preferences. Their current states are shown in the menus and toolbar and persist
across sessions when local storage is available. Snapping defaults off and applies
when moving elements; enabling both prefers nearby element edges/centers over the
grid. Layout's Grid Settings adjusts spacing in client pixels. View also controls
anchor visibility and the Properties Panel. These preferences do not change saved
application definitions or runtime styling.

## Relative anchor layout

Click **Connect anchors**, then the reference anchor followed by the anchor on
the element that should follow it. The window always acts as a reference. Click
Connect anchors again or press Escape to exit linking. Click a line directly to
select it: the inspector shows its endpoints, constrained axes and X/Y scalars.
The line has a wider invisible hit area to make selection easier. Enter a scalar
to change a distance immediately; negative values reverse the offset. Delete link
removes the selected relationship. There is no connection-selection dropdown.

Distances are dimensionless fractions: `gap_x = scalar_x * client_width` and
`gap_y = scalar_y * client_height`. A scalar of 0.1 means 10% of that dimension.
Scalars stay unchanged when the window resizes. Links default to constraining
both axes; choose X only or Y only for independent alignment. A moved reference
immediately moves its followers, including chains of elements. Dragging a follower
intentionally rewrites its incoming distance scalars to keep the edited placement.

Fixed elements keep constant dimensions. Stretch elements scale their authoring
dimensions with the window, or fill the exact span between opposing linked anchors.
Adding opposing anchors automatically enables Stretch. Switching that element to
Fixed is rejected until the opposing size constraints are removed. Contradictory
links, cycles, or linked spans smaller than an element's minimum size are reported
instead of silently changing a hard constraint. Choose reference/follower order
deliberately; adding a dependency back to its own ancestor is invalid.

Designer, Preview and Run share one headless solver. Layout is computed on edits
and window resize, with transforms used for positions and no animation loop.
Authoring rectangles, Fixed/Stretch modes and links save in project JSON.
Existing layouts retain their rectangle geometry; obsolete dynamic connections
are discarded. Unlinked positions scale relative to the authoring window while
Fixed dimensions stay constant. Panels can serve as references in window space;
nested container coordinate systems remain future work. Windows has native checks;
Linux/WebKit remains untested.

The canvas sits inside a selectable application-window frame. Click its title
bar, empty canvas, or View > Window Properties to edit the window name, title,
client dimensions, minimum size, icon, background, resize behavior, decorations
and initial state. Drag the outer lower-right handle to resize the design surface.
Drag the board or window frame to pan around the workspace, and scroll to zoom
in or out around the pointer. Zoom and pan do not change the design's logical
dimensions. Icons are embedded in project JSON and travel with it. Run applies
these settings to the native window; the IDE window retains its own settings.
The frame is a design guide rather than an exact replica of each operating
system's window decorations.

Projects use readable versioned JSON, including event mappings. The Python runtime
accepts explicitly registered named event handlers without rewriting user code:

```python
from pathlib import Path
from viper.runtime import Runtime
from viper.serializer import load_project

project = load_project(Path(__file__).resolve().parent / 'project.json')
Runtime(project, handlers={'launch': lambda event: print(event)}).launch()
```

A saved project can also run with `python -m viper.runtime project.json`.
The CLI does not discover handler source automatically. Handler authoring,
Windows .exe packaging, Linux .desktop installation and standalone bundling are
future milestones; generated projects must continue using this shared runtime.

## Structure

- `viper/hosts/`: native host contract, selection, Windows and Linux adapters.
- `viper/app.py`, `bridge.py`: shared designer state and request/reply commands.
- `viper/models.py`, `serializer.py`: portable interface definitions and JSON.
- `viper/component_registry.py`, `layout.py`: component defaults and layout rules.
- `viper/assets/`: one designer, shared controls/styles and runtime interface.
- `viper/runtime.py`: native applications and named Python event dispatch.
- `viper/server.py`: optional asset-development server, outside the native launch.
- `tests/`: model, layout, architecture, bridge and native smoke checks.

## Validation and remaining work

```powershell
python -m pip install pytest
python -m pytest -q -p no:cacheprovider
python tests/windows_smoke.py
python tests/windows_smoke.py --runtime
```

Twenty-one automated Python tests passed, plus ten deterministic hard-layout
checks in WebView2, 50 menu/action assertions, and native designer/runtime anchor
integration checks. Shell resizing and stacking isolation are checked at narrow
and full-size window dimensions.
Windows WebView2 startup, the bridge, real-control
rendering, add/duplicate/delete, Preview, standalone runtime resizing and shutdown
have been exercised. Linux is implemented but has not been tested on Linux.
Window title/size editing and runtime icon, title and resizing settings are also
covered by native Windows smoke checks. Native file dialogs, Run's child window and visual editing still need
manual end-to-end verification. Chromium/WebKit styling equivalence requires
checks on both engines. Nested containers, theme editing, undo/redo, handler
editing and deployment exporters are deferred.
