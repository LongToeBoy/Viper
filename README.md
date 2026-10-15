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
has a small dropdown icon near its top-right corner; open it to choose Fixed or
Stretch. The inspector
edits name, text and rectangle geometry. Duplicate
and Delete act on selection. Save/Open use native JSON file dialogs. Preview
uses the same real controls as Run; Run opens a separate native runtime process.
Save before replacing a project with New or Open.

**Depth (Z)** in the component Inspector controls overlap with five levels:
**0 Back**, **1 Behind**, **2 Normal**, **3 Above**, and **4 Front**. Higher depths
draw above lower ones. Within the same depth, later components in the window's
component list (normally later-added controls) draw on top. For example, put a
background panel at 0 and its overlaid buttons at 2. Select covered controls in
Project Explorer to edit their depth. Selection keeps the authored stacking order.
Depth saves with the project and works identically in Designer, Preview and Run;
existing components default to 2, preserving their relative order.

The permanent **File**, **Edit**, **Insert**, **Layout**, **View**, **Run** and **Windows** menus
sit above the workspace, with a compact Save, Undo/Redo, snapping, Preview and Run
toolbar. Insert's Widgets and Controls submenu uses the same creation commands
as the palette. Right-click an element for Duplicate, Delete, Align, Connect
Anchors and Properties. Unsupported features, including Undo/Redo, clipboard,
multi-selection alignment, appear
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

## Application CSS and appearance

Select the parent project in **Project Explorer** and open **Windows > Inspector**.
Under **Project properties > Application appearance > CSS theme**, choose
Bootstrap, Milligram, or Viper default. Global settings appear only for the parent
project; selecting a window or component shows its own properties. **Import CSS…**
accepts a local `.css` file, including a framework's `dist/*.css` or minified CSS. Themes style
the application on the design canvas, in Preview and Run, and in either export.
Viper's menus, docking panels and Inspector keep their own appearance. Native
window decorations continue to follow the operating system.

Buttons keep their hover color only while the pointer is over them. Theme focus
styling remains visible during keyboard navigation; mouse clicks keep the button
focus without leaving its focus color stuck after the pointer moves away.

Imported stylesheets are stored in `viper/themes/`; the Inspector shows its exact
location. You can also place CSS files there and click **Refresh**. Refresh reloads
the active theme from that folder when available. Projects embed their selected
themes, so opening a saved project does not depend on the original CSS file.

Controls use their normal HTML tags and automatically receive common framework
classes: buttons get `btn btn-primary button is-primary`, text inputs get
`form-control input`, labels get `form-label`, panels get `card card-body`, and
checkboxes get `form-check` with `form-check-input`/`form-check-label` children.
You do not rename controls or write CSS classes in the Inspector. Python names
such as `Button1.Text = "Start"` and all event source remain unchanged. Custom
CSS can target these tags/classes. Frameworks requiring their own special markup
may need a matching stylesheet; importing CSS does not add JavaScript widgets.

Select a component to edit its **Appearance**: font, colors (palette or CSS value),
borders, corner radius, padding, alignment, wrapping and overflow. Explicit values
override the theme. Clear a field to inherit its styling; **Reset appearance**
clears all appearance overrides. Choosing Viper default restores original
component styles, with any explicit overrides retained. Appearance overrides do
not crop text by default. Themes preserve authored geometry, anchor links and depth.

Click a color button to open the color dialog. It shows the actual current color
and offers named theme swatches such as **Primary**, **Background**, **Surface**
and **Text**, plus the stylesheet's available color variables and other colors.
Themes without color variables get a palette from their rendered controls and CSS.
Choose a swatch, then **Apply**; **Cancel** or Escape discards the draft. Arrow keys
move between swatches. **Custom color** offers hex/CSS input and RGB sliders.

Named colors follow their matching role when you switch themes. If a new theme
has no matching color, Viper keeps the saved fallback. Custom colors stay fixed.
The same picker serves window backgrounds and component background/text/border
colors. Choosing a window background automatically turns off **Use CSS theme
background**, so the selected color takes effect immediately, including over
theme gradients. **Use theme background** restores CSS styling. Color buttons
show the effective color and palette name, including when the theme owns it.

Local CSS `@import` files are combined, and local images/fonts are embedded as
data URLs for portable exports. Network imports/resources are rejected: download
those resources beside the stylesheet first. Images/fonts are limited to 2 MB
each and combined CSS to 8 MB. Cyclic imports and `@import layer/supports`
qualifiers are rejected with a message. A project can store up to 32 themes.
Bootstrap 5.3.3 and Milligram 1.4.1 are bundled with their MIT license notices
inside the CSS.

Python ZIPs include editable `themes/*.css` next to `app.py`. Executable ZIPs
include them under `_internal/themes/`. The packaged launcher reads those files
when present, falling back to embedded project CSS. Keep the exported folders
together when sharing the app.

## Event data and control access

Select a window in **Project Explorer** to edit its **Imports** in Inspector.
The Events toolbar's **Window imports** button opens that window's field directly.
Write ordinary Python import statements, for example:

```python
import numpy as np
import cv2
from pathlib import Path
```

Those names are available to every saved event handler in that window. A handler
can call `np.array(...)` without repeating the import. Another window has its own
import block and aliases. Imports load lazily on first handler use and are cached
for that Preview/Run session. Python still caches imported modules normally;
separate windows do not create separate copies of NumPy or OpenCV.

Imports save with the window, including unfinished drafts, and never rewrite
event source. Only import statements and comments belong in this field. Use
explicit names and absolute imports; do not use `import *`. Reserved event API
names (`controls`, `form`, `event`) need a different import alias. Module aliases
take precedence over automatic control names; use `event.controls['name']` if
there is a collision. Imports already written inside event code continue to work.
Explicitly registered Python functions keep their existing module globals.

Install third-party packages in the Python environment running Viper before
using them. Both export formats collect dependencies from all window import
blocks as well as event code. Python ZIPs list installed package distributions
in requirements.txt; executable builds bundle the imported modules. Import
errors identify the owning window and appear when using a handler or building.

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

Python assignments that change a control's **Text** or a checkbox's **Checked**
also trigger that control's mapped **change** handler, including labels. For
example, a button assigning `StatusLabel.Text = "Launched"` runs StatusLabel's
change handler after the button handler finishes. That handler receives
`event.sender` as StatusLabel, `event['value']` as `"Launched"`, and
`event['property']` as `"Text"` (`"Checked"` for a checked-state change).
Lowercase names and Value aliases behave the same way. Assigning an unchanged
value does not trigger an event. Multiple writes to one property within a handler
produce one notification for its final changed value. Enabled/Visible writes do
not trigger change.

Change handlers can update other controls. Viper processes their notifications
in order and applies the final UI updates together. A handler error or a chain
that fails to settle within 64 events reports an error and rolls back the whole
chain's UI writes, retaining received user input. Browser input behavior is
unchanged: text inputs send change after an edit loses focus, and checkboxes when
toggled. Applying the Python response does not send duplicate browser events.

## Workspace tools

**Windows > Project Explorer**, **Components** and **Inspector** open or close the editor's
tools. Each tool starts docked, and can float inside the workspace. Drag its title
bar to move it; highlighted targets let you dock on the left, right, top or bottom.
Dropping into an occupied dock combines the tools into a tabbed group. Drop onto
**Join tabs** above another floating tool to combine them there as well.

Click a tool tab to switch panels. Drag a group's title bar to move all its tools
together, or drag an individual tool tab to move just that tool. The arrow menu in a title bar also offers Float
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

Select the project to edit its name, description, **Startup window** and global
**Application appearance**, including CSS themes. A window's
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
Windows ZIP export packages this same runtime. Linux .desktop installation and
Linux standalone bundling remain future milestones.

## Build an application to share

Choose the project's **Startup window** in Inspector, then use **File > Build /
Package** or **Run > Build / Package**. Choose **Python project (.zip)** or
**Windows executable (.zip)**, then select a ZIP destination. Cancelling format
selection does not open a file dialog or start a build. The designer
captures the current project, including unsaved edits, all windows and saved Python
event source. Builds run in the background; the status bar shows progress and
then **Build complete**. Editing afterward does not change the captured build. Build
is disabled during Preview and while another build is running. A failed build
preserves the previous ZIP. Cancelling the destination dialog changes nothing.

**Python project** includes `app.py`, `project.json`, `requirements.txt`, a local
`viper/` package containing the same Python runtime code and native adapters, and
the runtime frontend assets. Neither Viper nor PyInstaller needs to be installed
on the recipient's machine. Python 3.11 or later and the listed runtime dependencies
are required. Extract the ZIP and, in its application folder, run:

```powershell
py -m pip install -r requirements.txt
py app.py
```

Dependency installation is needed once per environment. Keep the files and
`viper/` folder together; `app.py` also works when launched by absolute path from
another working directory. Saved event source remains verbatim in `project.json`.
Static third-party imports are mapped to installed distributions and pinned in
`requirements.txt`; standard-library imports need no additional requirements.
Unpackaged local helper modules must be packaged before they can be exported.
Python export does not require the executable build tools. On Linux, install
GTK 4, WebKitGTK 6.0 and PyGObject through your distribution, then use `python3
app.py`; Linux native behavior remains unverified.

**Windows executable** keeps the existing compiled folder export. Install the
optional build tools in the Python environment running Viper (once):

```powershell
python -m pip install -e ".[build]"
```

Send the ZIP to another Windows user. They extract the whole archive and open
the `.exe` inside. Keep its `_internal` folder beside it. The package contains
Python, the Viper runtime, project definitions, shared frontend assets and native
host dependencies; the recipient does not install Python, Viper or PyInstaller.
The executable uses the configured startup window, independently of the active
designer tab. Window settings, embedded icon and authored event handlers are
retained. It is a folder distribution, not an installer or a single-file EXE.

The recipient needs Microsoft Edge **WebView2 Runtime** and **.NET Framework 4.8**.
The WebView2 engine is a system prerequisite rather than bundled in this ZIP;
download it from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).
Build on Windows for a compatible Windows architecture; cross-compilation and
Linux executable packages are not implemented. The generated README includes launch and
prerequisite instructions. Startup errors report through a native message box
and write details to `viper-application-error.log` in the system temporary folder.

The same exporter is available from the command line:

```powershell
python -m viper.build project.json --output dist/MyApp.zip
python -m viper.build project.json --format python --output dist/MyApp_python.zip
```

Use `--overwrite` to replace an existing ZIP. The `viper-build` console command
is equivalent. The exporter checks mapped handler syntax and collects static
imports from saved source without executing it. Those modules must be installed
in the export environment. Executable export is the CLI default. For imports computed dynamically, add
`--hidden-import module_name` (Python export also lists their distributions); additional project-specific data files and external
handler registrations are not automatically exported. Events whose mapped source
is missing, empty or whitespace-only are inactive and do not block a build, just
as in Preview and Run. Source and mappings are preserved. Nonempty mapped code
must pass syntax checks; unreferenced drafts are retained verbatim without syntax
checks. Builds from the designer reject active external Python registrations,
which need to be moved into saved project code for export.

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
python tests/windows_export_smoke.py --build
python tests/windows_export_smoke.py --format python --build
```

Ninety automated Python tests passed, plus ten deterministic hard-layout
checks in WebView2, 50 menu/action assertions, 29 form/event tab checks,
45 docking/workspace checks, 51 hierarchy checks, 21 Preview control binding checks,
17 control checks in each main/secondary runtime, 21 Designer/Preview depth checks,
12 depth checks in each main/secondary runtime, seven property-change checks in
each Preview/main/secondary runtime, fifteen build-command checks and native designer/runtime anchor
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
Windows PyInstaller 6.22.3 export passed a real relocated-application smoke test:
the EXE starts from a path containing spaces with an unrelated working directory
and no Python on PATH, uses a secondary startup window, and runs a saved handler
with a bundled import plus a label change handler. The smoke enables a local
WebView2 debug port only in its child environment; exported apps contain no test
mode. A fresh Windows VM without Python has not been tested. Native file-dialog
interaction still needs manual verification.
Python export passed both an isolated-interpreter launcher check using only its
bundled Viper package and a relocated native Windows `app.py` test with real
controls, saved imports and change handlers. Executable export remains available.
Nested containers, theme editing, undo/redo, installers and Linux executable export are deferred.

## License

Viper is licensed under the [MIT License](LICENSE).
