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

The permanent **File**, **Edit**, **Insert**, **Layout**, **View**, **Run** and **Windows** menus
sit above the workspace, with a compact Save, Undo/Redo, snapping, Preview and Run
toolbar. Insert's Widgets and Controls submenu uses the same creation commands
as the palette. Right-click an element for Duplicate, Delete, Align, Connect
Anchors and Properties. Unsupported features, including Undo/Redo, clipboard,
multi-selection alignment and packaging, appear
disabled. Save As uses the existing native save destination dialog. Stop Preview
returns to editing; separately launched applications use their native close button.

Use F10 or Alt plus a menu's first letter to focus/open the menus, arrow keys to
navigate submenus, Enter to activate, and Escape to close. Ctrl+S saves, Ctrl+O
opens, Ctrl+N creates a project, Ctrl+D duplicates and Delete removes the selected
component or window (windows require confirmation). F2 renames through Inspector.
F6 toggles Preview, F5 runs, and Shift+F5 stops Preview. Text fields retain
their normal editing shortcuts. View's Zoom menu also provides Ctrl+=, Ctrl+-
and Ctrl+0 for zoom in, out and reset/fit.

**Show Grid**, **Snap to Grid** and **Snap to Elements** are independent editor
preferences. Their current states are shown in the menus and toolbar and persist
across sessions when local storage is available. Snapping defaults off and applies
when moving elements; enabling both prefers nearby element edges/centers over the
grid. Layout's Grid Settings adjusts spacing in client pixels. View also controls
anchor visibility and the Inspector. These preferences do not change saved
application definitions or runtime styling.

The main area opens with one visual form tab. Click **+** beside the tabs or
**Insert > New Window** to create another form. Each form has its own controls,
anchor links and window properties. Switching tabs retains its selection, zoom
and pan. **Preview** and **Run** use the current form. When the project is selected,
they use its configured startup window, as do Python and command-line launches.

Double-click an element, or choose **Edit Events** from its context menu, to open
its Events tab. Select **click** or **change**, then **Create handler** and edit
the Python function. The function receives the shared event dictionary with
`component_id`, `window_id`, `event` and `value`. Code and event mappings save in
the project JSON. Closing an Events tab preserves its code, and Create handler
never replaces existing source. Renaming or duplicating an element also preserves
its handlers. Arrow keys, Home and End navigate focused tabs.

## Event data and control access

An event describes an interaction: `event['window_id']` and
`event['component_id']` identify its source, `event['event']` is `click` or
`change`, and `event.get('value')` contains that interaction's value (text for a
text input, a boolean for a checkbox). Events remain dictionary-compatible.
Their `controls`, `sender` and `form` attributes provide runtime object access.

Saved Python handlers can use a control's name directly within its own window:

```python
def on_MainWindow_Launch_click(event):
    NameInput.Text = "Hello World"
    StatusLabel.Text = NameInput.Text
```

All controls support writable **Text**, **Enabled** and **Visible** properties.
Checkboxes also support **Checked**. Text inputs and checkboxes expose **Value**
as an alias for their text or checked state; lowercase property names work too.
**Name** and **Id** are read-only. Handler reads include the current text/checkbox
values, so another input does not need its own event handler just to be read.

Use `event.controls['NameInput'].Text` or `controls['NameInput'].Text` for explicit
lookup. `event.sender` is the control that produced the event, and `event.form`
provides the owning form's `id`, `name` and `controls`. Explicitly registered
Python functions use these event attributes; their existing module globals are
left intact. Direct names are supplied only to saved handler modules and must
be Python identifiers without a leading underscore that do not collide with builtins, handler names or
the `controls`/`form` helpers. Names containing spaces use dictionary lookup.
Duplicate names require `event.controls.by_id(component_id)`. Renaming a control
changes its runtime name; update named references yourself or use stable IDs.
Viper never rewrites your Python source.

Control property writes update existing displayed nodes in both Preview and Run.
They are transient application state: they do not change the saved design, and
restarting Preview restores authored values. Unchanged saves preserve the running
Preview session. Invalid property writes or handler errors report an error and
discard that event's UI writes. Delayed replies cannot overwrite newer typing or
apply to a closed Preview. This API currently covers control content, visibility
and enabled state; layout authoring still uses the shared anchor system.

## Workspace tools

**Windows > Project Explorer**, **Components** and **Inspector** open or close the editor's
tools. Each tool starts docked, and can float inside the workspace. Drag its title
bar to move it; highlighted targets let you dock on the left, right, top or bottom.
Dropping into an occupied dock combines the tools into a tabbed group. Drop onto
**Join tabs** above another floating tool to combine them there as well.

Drag a group's title bar to move all its tools together, or drag an individual
tool tab to move just that tool. The arrow menu in a title bar also offers Float
and the four dock positions. The close button closes the active tool; reopen it
through Windows. Closing tools leaves forms, components and event code intact.
Tool tabs are separate from the form and Events tabs in the main area.

Resize a dock by dragging its inner boundary, or resize a floating group using its
lower-right handle. Focused tool tabs support arrow keys, Home and End; focused
resize handles support arrow keys, with Shift for larger steps. Escape cancels an
active drag or resize. **Windows > Reset Workspace** restores the initial layout.

Dock positions, groups, active tool tabs, sizes and closed tools persist locally
between sessions when storage is available. This layout is independent of saved
project definitions. Small workspace sizes keep floating tools reachable without
overwriting their saved size. Project Explorer shares the left dock with Components
by default, and uses the same floating, docking and tab grouping behavior.

## Project hierarchy

Project Explorer shows **Project → Windows → Components**. All windows are siblings
owned by the project; each component belongs to one window. Click a window to open
its form, or a component to select it on that form and inspect its properties.
Hidden components remain accessible through the tree. Double-click a component
to open its Events tab. The tree supports arrow keys, Home, End and Enter/Space;
F2 opens the selected item's name in Inspector.

Select the project to edit its name, description and **Startup window**. A window's
context menu also provides **Set as Startup Window**. **+ Window**, Insert > New
Window and the form tab's plus button always create another child of the project.
Window and component names are edited in their existing Inspector fields, and
renames preserve IDs, anchors and event mappings.

Closing a form tab keeps its window in the project; select that window in Explorer
to reopen it. **Delete** on a selected window asks for confirmation and removes the
window, its components and its form/Events tabs. Deleting the startup window chooses
the first remaining sibling as startup. Deleting the final window leaves an empty
project that can still be saved and reopened; New Window starts designing again.
Deleting a component also removes its anchor links and stale Events tabs. User
Python source is retained after either kind of deletion, including unmapped source
and code shared by surviving components.

Project JSON now uses schema version 2, with metadata, a list containing all windows,
`startup_window_id` and `event_code`. Version 1 projects migrate on load, preserving
the original startup form, additional forms, IDs, layout and source. Subsequent saves
use version 2. Existing Python startup-form accessors such as `project.window` and
`project.components` still delegate to the configured startup window; explicit
ownership is available through `project.windows` and `project.get_window(form_id)`.

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

Projects use readable versioned JSON, including event mappings and authored Python
source. Preview and Run load project source only when an event invokes its named
handler. Incomplete edits can be saved; Python errors are reported on dispatch.
The Python runtime also accepts explicitly registered named event handlers, which
take precedence over project source without rewriting it:

```python
from pathlib import Path
from viper.runtime import Runtime
from viper.serializer import load_project

project = load_project(Path(__file__).resolve().parent / 'project.json')
Runtime(project, handlers={'launch': lambda event: print(event)}).launch()
```

A saved project can also run with `python -m viper.runtime project.json`.
Use `python -m viper.runtime project.json --window FORM_ID` or
`Runtime(project, window_id='FORM_ID')` to launch another saved form.
The CLI does not discover external handler modules automatically.
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
python tests/windows_smoke.py --runtime --secondary
```

Fifty-two automated Python tests passed, plus ten deterministic hard-layout
checks in WebView2, 50 menu/action assertions, 25 form/event tab checks,
45 docking/workspace checks, 51 hierarchy checks, 21 Preview control binding checks,
17 control checks in each main/secondary runtime and native designer/runtime anchor
integration checks. Shell resizing and stacking isolation are checked at narrow
and full-size window dimensions.
Windows WebView2 startup, the bridge, real-control
rendering, add/duplicate/delete, Preview, standalone runtime resizing and shutdown
have been exercised. Linux is implemented but has not been tested on Linux.
Window title/size editing and runtime icon, title and resizing settings are also
covered by native Windows smoke checks. Native file dialogs, Run's child window and visual editing still need
manual end-to-end verification. Chromium/WebKit styling equivalence requires
checks on both engines. Native form switching, source persistence and authored
handler execution passed in the designer and in main/secondary runtime forms.
Nested containers, theme editing, undo/redo and deployment exporters are deferred.
