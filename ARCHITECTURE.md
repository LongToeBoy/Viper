# Viper architecture and project memory

## Required architecture

Both the IDE and applications built with Viper target Windows and Linux from the
beginning. Windows uses Microsoft WebView2 (Chromium) through pywebview with
`gui="edgechromium"`; Linux uses GTK 4 and WebKitGTK 6.0 directly through PyGObject.
macOS is deferred; it can add another adapter without changing shared logic.

Only `viper/hosts/` knows the OS or imports native GUI libraries. Its NativeHost
contract owns window creation, title and size changes, local interface loading,
JSON message transport, file dialogs, icons and lifecycle/shutdown. Windows icons
use .ico paths; GTK uses an icon-theme name resolved from a supplied icon path.
Engine transport details in JavaScript are confined to `assets/host.js`.

The designer, component library, hard relative layouts, styles, serialization,
event dispatch and Python application logic stay shared. One versioned JSON
project opens on either platform. No native library imports occur in shared code.

`assets/components.js` renders the actual controls for design, Preview and Run.
`runtime.py` hosts the same interface definitions and dispatches named Python
handlers supplied explicitly through `Runtime(project, handlers)` or authored in
the Events editor. Preview uses that same dispatcher through Bridge. Event mappings
and Python source are serialized; explicit registrations take precedence over saved
source. Automatic external handler-module discovery remains deferred.

## Milestone 1 implementation

The existing data model, component registry, layout engine and serializer were
retained. OS branching and the redundant GTK-only designer were replaced by native
adapters. The frontend now boots from Python state instead of a hardcoded demo.
The editor supports toolbox click/drop, selection, move, resize, duplication,
deletion, property editing, native JSON save/open, Preview and Run. Run launches
an isolated temporary project snapshot and removes it after loading.

The old `server.py` is a standalone asset-development helper, not an IDE or app
host. Native launch does not depend on it. GTK is not a Windows requirement.

## Deployment boundaries

Portable Python launchers are supported now through `python -m viper.runtime
project.json` or the Runtime API. A launcher should locate its project using
`Path(__file__).resolve().parent / "project.json"`, never a hardcoded absolute
path or OS-specific separator. Install Viper in the launcher environment.

Windows ZIP export now packages the existing runtime, assets and WebView2 adapter
with PyInstaller (see the application export milestone below). Linux .desktop
installation and standalone bundling remain delivery targets.
Python project ZIP export also copies the same runtime and both adapters alongside
an app.py entry point and dependency instructions, without freezing an interpreter.
Desktop-entry absolute Exec paths belong to installation output, not portable
project data. Avoid building a second runtime in an exporter.

## Verification and limits (2026-10-08)

Windows: native WebView2 smoke test passed for frontend loading, bidirectional
bootstrap messages, rendering actual controls, Preview switch, title/size changes
and shutdown. Add/duplicate/delete and standalone runtime rendering also passed;
runtime input values survive window resizing. Native dialogs have automated
controller coverage but have not been
manually exercised. Packaged executables have not been tested.

Linux: adapter is implemented but untested on Linux. GTK/WebKit installation,
message delivery, dialogs, icons, lifecycle and visual behavior need native tests.
CSS uses standard grid/flex and includes the WebKit user-select prefix. No claim
of pixel-perfect Chromium/WebKit equivalence is made.

Twenty-one automated Python tests passed. Before release, exercise editing, save/open,
Run, registered handlers, resize and CSS on both engines. Nested panel layouts,
themes UI, undo/redo, handler authoring and deployment export remain future work.

## Editable application window

Projects now serialize a shared WindowSettings definition: name, title, embedded
PNG icon, minimum client dimensions, resizable/decorated flags, initial state and
background. Existing projects without window metadata retain their project name
as the window title. Client dimensions remain canvas_width/canvas_height.
The designer shows a scaled title-bar/frame guide and exposes window properties
when selecting the title bar, empty canvas or Window button. The frame's resize
handle edits logical client size independently of workspace zoom. Native window
chrome follows OS/window-manager policy; this guide is not a pixel-perfect copy.

Uploaded icons are normalized to 32x32 PNG and embedded in JSON, with no external
absolute path. Native adapters materialize temporary PNG/ICO files and clean them
up after shutdown. Windows sizes the client area with DPI-aware native adjustment.
Linux maps settings into GTK APIs and remains untested, including icon display
which depends on the desktop environment. Windows smoke checks cover frame title
and size editing plus native runtime title, icon and resize setting.

Component design gestures live in `assets/designer-components.js`. Every control
gets a designer-only wrapper with four midpoint layout anchors
and a separate lower-right resize handle.
Preview and runtime use the original shared control renderer.
Corner resizing keeps the top-left fixed, respects minimum size and canvas
bounds, and converts pointer movement through workspace zoom. Handles are editor
affordances; authoring geometry and hard anchor relationships are serialized.

## Hard relative anchor layout (2026-10-09)

`assets/anchor-layout.js` is a headless, event-driven solver. A directed link joins
an edge-midpoint reference anchor to an element's dependent anchor. X/Y distances
are signed dimensionless fractions of window client width/height. The hard relation
is `dependent_anchor = reference_anchor + distance_scalar * window_dimension`.
Scalars remain constant on resize. A topological traversal resolves references
before followers, including multi-element chains. Cyclic dependencies, missing
references, contradictory equations and infeasible minimum sizes are rejected.

`component.box` stores authoring x/y/width/height plus reference window dimensions.
`size_mode` is fixed or stretch. Fixed keeps dimensions constant. Stretch scales
dimensions with the authoring window, or solves exact extents between opposing
anchors. Unlinked coordinates scale with the authoring window. Adding opposing
anchor constraints enables stretch; fixed mode rejects opposing size constraints.
Dragging a follower deliberately updates its incoming distance scalars; moving a
reference updates followers immediately. The corner resize handle is separate
from link anchors and the small top-right Fixed/Stretch dropdown.

`assets/relative-layout.js` renders solved positions through transforms and applies
dimensions only on edits or ResizeObserver notifications. There is no timer,
animation loop, velocity, mass, stiffness or damping. `assets/link-editor.js`
handles authoring, straight connection paths, wide invisible selection hit paths
and link property editing. Users select links by clicking directly on the line;
there is no link-selection dropdown. Preview and Run use the same solver and
renderer while hiding the editing controls and overlay.

Projects save `box`, `size_mode` and `project.links`. Old percentage geometry and
saved rectangles are accepted for migration. Connections from the discarded
dynamic layout system are ignored and never written back. The old engine,
animation adapter, authoring UI and associated tests have been removed.

Windows checks cover ten pure solver cases, Fixed/Stretch behavior, opposing
anchors, scalar window resizing, chains, cycle rejection, direct line hit testing,
corner resizing, menus, persistence/reopening and runtime input preservation.
Twenty-one Python tests cover model validation, migration and existing behavior.
Linux remains untested. Nested container coordinate systems and automatic
intrinsic-content sizing remain future work. Infeasible constraints report an
error and preserve the last valid displayed layout until corrected.

## Permanent designer application chrome (2026-10-09)

The IDE root is `application-shell`: a CSS grid with a reserved 68-pixel chrome
row (30-pixel menu bar and 38-pixel compact toolbar) and a flexible workspace row.
The workspace owns its scroll containers, clips its contents and establishes an
isolated stacking context below the chrome. Designer transforms, canvas controls,
drag gestures and future panels belong inside this workspace. Dropdowns live in
the chrome's popup layer and are bounded below the chrome and within the client
viewport. Native title bars, decorations and host adapters are unchanged.

`assets/actions.js` owns unique command IDs, names, icons, shortcuts, callbacks,
and enabled/checked state. State may be derived from the current project,
selection and Preview mode. `assets/menus.js` renders nested menus and toolbar
buttons from action references, shares their state and handles navigation,
outside clicks, Escape and popup placement. `assets/designer-chrome.js` composes
File, Edit, Insert, Layout, View and Run menus, the compact toolbar, context
commands, palette clicks and shortcuts around existing designer commands.
Add future commands to this registry and reference their IDs in menu definitions;
do not create separate command implementations for each UI surface.

`assets/designer-preferences.js` stores editor preferences under
`viper.designer.preferences.v1` in local storage, with a session fallback when
storage is unavailable. Show Grid, Snap to Grid and Snap to Elements are separate
booleans; snapping defaults off to preserve existing gestures. Snapping changes
intentional element movement before passing the rectangle to the existing shared
layout renderer; it does not alter the headless solver or corner-resize behavior.
Grid spacing, anchor visibility and inspector visibility are also editor
preferences, independent of saved application definitions and runtime styles.

Save As reuses Save's existing native destination dialog. Stop exits embedded
Preview; there is no child-process stop API. Undo/redo, element clipboard,
multi-selection/alignment/distribution, hierarchy,
recent projects and packaging remain disabled placeholders. Python handlers and
event mappings are preserved by the existing duplication and serialization code.
The chrome initializes before bootstrap and remains usable without a project.

Verification: 21 Python tests pass, plus WebView2 designer/runtime smoke tests
with ten headless solver cases and 50 menu/action assertions. Native checks cover
shared command dispatch, selection/Preview state, input shortcut protection,
nested keyboard navigation, context duplication, independent persistent toggles,
snapping, no-project menus, stacking isolation, and resizing through 240-, 560-
and 1280-pixel outer window widths. Linux GTK/WebKit native verification remains
outstanding.

## Form tabs and Python event authoring (2026-10-11)

`WindowDefinition` holds the existing form geometry, window settings, controls and
links. `Project` extends that definition for the startup form, preserving legacy
top-level fields, and adds `windows` for extra forms and `event_code` for named
Python source blocks. Stable `form_id` values distinguish forms; the startup form
is `main`. Each form receives the same validation and headless layout solver.
Existing single-form JSON loads with empty extra-form and event-source collections.

`assets/designer-tabs.js` owns form and element Events tabs. Form tabs share the
existing designer canvas, renderer, inspector and commands; no platform-specific
editor was introduced. Selection, zoom and pan are remembered per form in editor
state. The plus button and Insert > New Window share the action registry.
Double-click or Edit Events opens one reusable editor tab per element. Event tabs
can close without deleting mappings or source; they reopen from the owning form.
Create handler generates a function only when that name has no saved source.
Renames, duplicates, tab switches and serialization never regenerate user code.

The event editor persists exact Python source, including unfinished drafts.
`Runtime` compiles a source block lazily on its first dispatched event, checks its
named callable, and caches it for subsequent events. Loading/designing a project
does not execute source. Explicitly registered handlers retain precedence.
Bridge invalidates Preview's dispatcher when a project update changes source.
Preview and standalone Run identify the owning form through `window_id` in the
shared event payload. Run snapshots the entire project and selects the active
form through the shared runtime's `--window` argument. CLI/API launch defaults to
the main form. Opening multiple application windows within a running application
and automatic external source-module discovery remain future work.

Verification: 27 Python tests passed, including legacy migration, form validation,
verbatim/incomplete source persistence, dispatcher parity and selected-form Run
snapshots. Native Windows WebView2 checks passed with 10 solver cases, 50 menu
checks and 25 tab/editor checks. Standalone main and secondary forms passed native
rendering, settings, resize/input preservation and authored Python event dispatch.
Linux GTK/WebKit native verification remains outstanding.

## Movable and docked workspace tools (2026-10-11)

`assets/designer-workspace.js` manages registered tool definitions separately from
forms and application data. Components and Inspector keep their existing DOM
nodes, inputs and listeners as they move between left/right/top/bottom docks and
floating groups. Each occupied dock holds one group; dropping another tool into
that dock adds a tool tab. Floating groups can also merge. Dragging a group title
moves all tools, while dragging a tool tab detaches only that tool. Close hides
the active tool and remembers its group and placement for reopening.

The workspace grid reserves the current dock dimensions around the central
document area. Dock splitters and floating resize handles support pointer and
keyboard changes. All tool groups and drop targets remain inside the workspace's
isolated stacking context below the permanent application chrome. Pointer capture,
pointer cancellation and Escape give gestures a defined lifetime. No animation
loop or native platform code was added. Viewport clamping keeps floating groups
reachable while retaining their requested geometry for larger workspace sizes.

The Windows menu uses shared action commands for Components, Inspector and Reset
Workspace. Context Properties opens and activates Inspector even in a tabbed
group. The previous properties visibility preference is mirrored for compatibility;
the workspace model owns actual placement and visibility. The Inspector remains
available beside Events documents with geometry fields disabled in that view.

Layout is saved under `viper.designer.workspace.v1` in local storage, independent
of project JSON: dock sizes, group order and membership, active tools, floating
rectangles and closed-tool placements. Validation rejects duplicate memberships,
invalid locations, dimensions and unsupported versions. Unavailable or corrupt
storage falls back to a usable session/default layout. New registered tools can
be introduced without discarding saved groups. Reset Workspace restores the
initial Components-left and Inspector-right arrangement. Project hierarchy and
window deletion are deferred to the next stage, following the user's chosen order.

Verification: 27 Python tests and native Windows WebView2 checks passed: 10 solver
cases, 50 menu checks, 25 form/event checks and 45 workspace checks. Workspace
checks cover pointer movement, docking on all four sides, grouped-title movement,
tab detachment and merging, resizing, keyboard actions, cancellation, close/reopen,
persisted layout loading, storage failure, input/focus preservation, chrome isolation
and small viewport clamping. Linux GTK/WebKit verification remains outstanding.

## Project ownership and hierarchy (2026-10-15)

`Project` now owns metadata, **all** sibling `WindowDefinition` children, a
`startup_window_id` and shared `event_code`. It no longer inherits a window.
Schema version 2 serializes that ownership directly. Schema version 1 and bare
legacy projects migrate the original top-level form plus additional windows into
one list, retaining form/component IDs, window settings, links, event mappings and
verbatim source. Empty projects serialize with no windows and a null startup ID.
The original Python startup-form keyword options and accessors (`window`,
`components`, `links`, client dimensions) remain available and delegate to the
startup child. `get_window()` and Runtime/CLI defaults use the configured startup
ID; explicit IDs still select individual forms. ViperApp accepts empty projects
and can add components to a specified child through `window_id`.

`assets/designer-explorer.js` renders Project -> Windows -> Components in a
registered dockable tool. It shares the left dock with Components by default.
Existing saved workspace arrangements gain the new tool without discarding dock
sizes or groups; subsequently closed Explorer panels remain closed until reopened.
Windows > Project Explorer and View use the same command. The tree provides
selection, disclosure controls, arrow/Home/End/Enter/Space navigation, a single
roving focus, F2 rename and context menus backed by the existing action registry.
Selection-only changes retain tree rows so native double-click recognition works.
Components in the tree open their owning form, including hidden components, and
double-click opens their existing Events document. Canvas selection reveals its
tree entry. Project selection displays metadata and startup choice in Inspector.

New Window always creates a project child. Document tabs can close independently
of project objects, and Explorer reopens closed form tabs. Deleting a window asks
for confirmation, removes its components and all owned documents/view state, and
chooses the first remaining sibling if startup was removed. Any form, including
the original main form and the final form, may be deleted. The empty document view
allows saving the project, opening Explorer and creating a new startup child.
Deleting a component removes its incoming/outgoing links and Events documents.
Neither operation deletes Python source; unmapped or shared code is retained.
Stable IDs preserve sibling definitions, anchor references and handler names on
rename, selection or startup changes. Preview disables hierarchy mutations.

Designer, Preview and Run continue using the same per-window rendering, styles,
headless solver and event API. Components and anchor links remain in their owning
window's coordinate system. Nested panel children and drag-based reparenting are
not implemented by this hierarchy milestone.

Verification: 35 Python tests passed, including schema migration, complete window
ownership, independent metadata, startup selection, empty-project recovery, source
preservation, per-window component IDs and rejection of cross-window anchor links.
Native Windows WebView2 checks passed with 10 solver cases, 50 menu checks, 25
form/event checks, 45 workspace checks and 51 hierarchy checks. Native main and
secondary startup runtimes passed settings/rendering, resizing/input retention and
authored event dispatch. Linux GTK/WebKit native verification remains outstanding.

## Runtime control objects and UI updates (2026-10-15)

`control_api.py` gives Runtime host-independent control objects backed by transient
per-window state, separate from the saved definitions. Saved handlers receive
window-scoped named bindings such as `NameInput.Text = "Hello World"`, plus explicit
`controls[name]` / `controls.by_id(id)` access. Handler modules and globals cache by
window ID and handler name so shared source cannot retain another form's controls.
Names that are not Python identifiers or collide with reserved helpers, builtins
or the handler function use explicit lookup. Duplicate-name access reports ambiguity
and requires an ID. No source text is rewritten or regenerated.

The event remains a dict subclass with the original transport keys. Attributes
`event.controls`, `event.sender` and `event.form` supply context without adding
non-serializable objects to the dictionary. Explicitly registered Python handlers
use those attributes and retain their own globals. Supported writable properties
are Text, Enabled and Visible, plus Checked for checkboxes and Value for text/
checkbox inputs; lowercase aliases work. Name and Id are read-only. Property and
value types are validated, and unsupported writes fail with a useful error.

Before dispatch, Runtime ingests validated text-input and checkbox snapshots.
The handler can read current values from other controls. It executes against
session state and returns only changed properties in window/component-addressed
`updates`, alongside the original handled/value result. Failed handlers or invalid
JSON results roll back UI writes while retaining the received input snapshot.
Authored project definitions and event source remain unchanged. Identical bridge
updates preserve the active dispatcher/session; changed definitions invalidate it.
The designer resets the dispatcher when entering or stopping Preview.

`assets/control-session.js` serializes interactions and reads current values after
earlier replies apply. Both Preview and Run use it. `components.js` applies patches
to existing controls, retaining nodes, focus, unrelated input values and handlers.
Listeners can become usable when an initially disabled control is enabled. Checkbox
caption updates preserve its input. Property application does not synthesize events.
Input revision tracking protects newer typing against delayed replies, and disposed
sessions ignore replies from previous documents or Preview runs. Runtime updates
do not alter anchor geometry, introduce a rendering loop or call native GUI APIs.

Verification: 52 Python tests passed. Native Windows WebView2 passed the existing
10 solver, 50 menu, 25 document-tab, 45 workspace and 51 hierarchy cases, plus 21
Preview control binding checks and 17 control checks in each main/secondary native
runtime. Coverage includes the reported NameInput.Text example, live reads, cached
state, window/name scoping, enabled/visible/text/checkbox changes, errors/rollback,
rapid events, late input, disposed sessions and original design/source preservation.
Linux GTK/WebKit native verification remains outstanding.

## Discrete component depth (2026-10-15)

Components serialize an integer `depth` from 0 (Back) to 4 (Front), defaulting to
2 (Normal) for new and legacy components. The model and component factory reject
invalid depths. Inspector exposes five named levels. Shared `components.js`
applies depth to controls; designer wrappers use the same depth while their inner
controls retain ordinary paint order so editing handles remain visible. Equal
depths use stable component-list/DOM order. Selection never raises a component.
The canvas isolates its stacking context, and link/window-anchor overlays remain
above every component depth. Geometry, hard anchors, ownership and event source
are unchanged. This is an additive schema-2 property; no schema migration is needed.

Verification: 60 Python tests pass. Native Windows WebView2 passes the existing
smoke suites plus 21 Designer/Preview and 12 depth checks in each main/secondary
runtime, including actual overlap hit testing, all five levels, equal-depth order,
covered selection, Inspector edits, persistence, duplication and legacy defaults.
Existing link/resize integration also runs against a front-depth component.
Linux GTK/WebKit native verification remains outstanding.

## Python property-change notifications (2026-10-15)

Runtime dispatch now queues follow-up `change` events for changed Text and
Checked properties after each handler returns, including label Text changes.
It compares runtime state before/after each handler and notifies only final
changed values; identical assignments and Enabled/Visible writes do not notify.
Events carry the owning window/component IDs, `event='change'`, the new `value`
and `property='Text'` or `'Checked'`. Sender/control access and source compilation
use the existing per-window API. Original event return values remain unchanged.
Only the incoming browser event ingests a value snapshot; follow-up events see
the live Python state without replaying stale frontend values.

The queue drains within the original dispatch, producing one final patch set.
Any handler failure, invalid original-event result or unsettled chain after 64
events rolls back all UI writes from that dispatch while retaining ingested user
input. Browser event timing is unchanged, and patch application still synthesizes
no DOM events. Preview, Run and explicitly registered Python handlers share these
semantics. User source and authored component definitions remain untouched.

Verification: 71 Python tests pass, including the reported button-to-label chain,
typed values/aliases, no-op writes, normalization, user-event deduplication,
failure/loop rollback, queue recovery and window/Preview parity. Native Windows
WebView2 passes existing suites plus seven property-change checks in Preview and
each main/secondary runtime, asserting actual displayed controls and one transport
request per button click. Linux GTK/WebKit remains unverified.

## Shareable Windows application export (2026-10-15)

`build.py` validates an independent project snapshot, stages a relative-path
launcher/project JSON and the existing runtime assets, then delegates native
packaging to `hosts/windows_build.py`. The platform factory remains in hosts/.
Windows uses PyInstaller >=6.16,<7 with onedir/windowed output, an explicit
WinForms/WebView2 backend and exclusions for other rendering engines. Startup
icons become EXE resources. Only runtime frontend assets are shipped; the
designer UI is not included. Exported apps call `packaged.launch`, which invokes
the same Runtime, solver, renderer, property-change dispatch and Windows adapter.
No second runtime or platform-specific designer is introduced.

Mapped saved Python source is syntax-checked without execution. Its static
imports become hidden imports for the freezer because JSON-held source is
otherwise invisible to analysis. Unmapped source remains verbatim, including
unfinished drafts. Missing imported packages fail with actionable errors.
Explicit external handler registrations and additional application data
are not automatically exported. CLI users may supply extra hidden imports.

All windows, stable IDs and source are included, while launch uses the configured
startup ID rather than the currently selected designer form. The generated entry
point resolves project resources with pathlib relative to `__file__`, including
PyInstaller's internal resource directory, independent of the working directory.
Folder distributions are zipped under a portable application name and accompanied
by recipient instructions. Temporary staging is cleaned; a sibling temporary ZIP
is atomically promoted only after success, preserving previous output on failure.
CLI replacement is explicit; GUI destinations use the native save dialog.

File and Run share one enabled Build / Package action. Bridge captures the
project before the destination picker, starts a worker, and returns a job ID.
`build-status` exposes progress, completion paths and failures without holding
the bridge lock during packaging. Duplicate builds are rejected. Source edits
can continue against their own state. Cancelling does not build. The worker
finishes an in-flight build even if the designer window closes. Startup errors
use a native error message and a temporary log rather than a missing console.

Build tools are an optional dependency on the authoring machine. Recipients need
neither Python nor Viper, but must have WebView2 Runtime and .NET Framework 4.8.
This is a Windows application folder/ZIP, without an installer, prerequisite
bootstrapper, code signing, cross-compilation or Linux packaging. Current window
navigation capabilities are unchanged. Linux native verification remains pending.

Verification: 82 Python tests pass, including archive/source preservation,
startup selection, portable paths, import analysis, failure/overwrite protection,
async build snapshots, progress, cancellation, duplicate guards and startup error
reporting. WebView2 Designer passes existing suites plus ten build command cases;
main and secondary runtimes pass their existing suites. A real PyInstaller 6.22.3
ZIP was extracted into a different directory with spaces, launched from an
unrelated cwd without Python on PATH, and driven over a test-only local CDP
connection. It rendered actual controls for a secondary startup form and ran a
saved handler importing fractions plus the label's change handler. The test
preserved user input and confirmed no designer document was shipped. A clean
Windows VM without Python, prerequisite installation and native dialog interaction
remain unverified.

## Inactive event mappings during export (2026-10-15)

Export ignores event mappings with absent, empty or whitespace-only source, matching
the shared dispatcher's no-handler behavior. Mappings/source remain untouched in
both the project and archive. Nonempty mapped source still undergoes syntax/import
checks. Designer builds explicitly reject registered external Python overrides so
their behavior cannot silently disappear from an export. The Events editor shows
suggested names as placeholders for unassigned events; viewing an event or editing
an empty source field does not assign it. Create handler and typing source directly
continue to connect handlers, preserving existing source verbatim.

Verification: 85 Python tests pass, including the reported Launch/change mapping
with missing, empty and whitespace-only source, archive preservation, runtime
no-op parity and external-registration protection. WebView2 Designer passes 29
event-tab checks, including unassigned suggestions and direct source authoring.
The packaged smoke fixture includes the reported empty Launch/change mapping.

## Executable and Python project export choices (2026-10-15)

Build / Package now opens a modal format choice: Python project or Windows
executable, both ZIP outputs. The existing executable format remains the CLI/API
default; `--format python` or `format='python'` selects source export. The bridge
validates the chosen format and records it on the existing build job. Python
exports bypass the native builder and PyInstaller availability check, while
sharing snapshot validation, background progress, cancellation, atomic ZIP output
and the exact Build complete message. Suggested Python ZIP names gain `_python`.

Python output includes app.py, project.json, requirements.txt, all original Python
modules in viper/ and hosts/, plus only the shared runtime frontend assets. The
entry point calls the existing packaged.launch/Runtime with pathlib paths relative
to itself. No separate runtime implementation, code regeneration, platform
designer or absolute development path is introduced. Source, window definitions,
IDs, startup choice, empty mappings and unmapped drafts remain verbatim.

Requirements include pywebview with a Windows marker and installed-distribution
versions for third-party static imports. Standard-library, bundled Viper and
system GTK bindings are handled separately. Unknown local dependency distributions
fail with an actionable error rather than silently producing an incomplete ZIP.
CLI hidden imports can also add dependency distributions. Extra user data files
remain outside automatic export. Recipients install requirements once and run
py app.py; Python is required, Viper and PyInstaller installations are not.
The existing host selection remains under hosts/, and the GTK adapter now supplies
its ZIP save dialog. Linux GTK 4/WebKitGTK 6.0/PyGObject require system installation
and native verification; no Linux execution claim is made.

Verification: 90 Python tests pass, including byte-identical runtime copying,
verbatim project/startup preservation, dependency generation, absence of frozen
binaries, no-PyInstaller source export and format validation. An isolated Python
process launched the relocated app.py using the bundled package, dispatched saved
Python source and confirmed the selected startup window. Native Windows Designer
passes fifteen export-command checks covering format choice, cancellation, both
payloads, progress and the unchanged completion text. Relocated Python app.py and
executable exports are exercised by windows_export_smoke.py with the same actual
WebView2 controls and button/change handlers.

## Application CSS themes and rich Inspector (2026-10-15)

Project owns embedded themes keyed by portable CSS filenames and an optional
active_theme. Components retain their original style dictionaries and add explicit
style_overrides; existing projects migrate with no theme and no overrides. The
Inspector offers automatic framework selection/import/refresh, font/color/border/
padding/alignment/wrapping/overflow overrides, and Visible/Enabled editing. Blank
fields inherit the theme or original styling. Reset clears overrides. No control
name, ID, event mapping or user-authored Python source changes when switching CSS.

themes.py uses tinycss2 for local stylesheet imports and image/font embedding,
with size limits, cycle detection, portable filenames and network-resource errors.
Imported CSS is copied to viper/themes/ without replacing existing different files;
selected theme source is embedded in project JSON for reopening and Run snapshots.
Bootstrap 5.3.3 and Milligram 1.4.1 are bundled with full MIT notices in their CSS.
NativeHost adds a CSS chooser implemented by the existing Windows and GTK adapters.

assets/appearance.js provides one ViperApplicationSurface used by Designer,
Preview and runtime. Themed controls render in a same-origin sandboxed iframe with
scripts disabled and a restrictive resource policy. Each theme gets real html/body
and rem sizing without touching IDE chrome. CSS is inserted with textContent.
Unthemed projects retain their original rendering surface. Shared components.js
adds common framework classes automatically while preserving Python control names.
Explicit Inspector overrides take priority over theme rules. The shared anchor
solver continues to own rectangles; rendered geometry, visibility and depth take
priority over CSS. There is no continuous layout loop or second solver/renderer.

Designer wrappers retain selection, logical-coordinate drag/resize, anchors,
context menus, keyboard commands, palette drops and board pan/zoom inside the
application document. Host transport remains exclusively assets/host.js. Native
window decorations are outside CSS styling. WindowSettings.use_theme_background
can defer to theme body styling or retain the authored window background.

Both export formats include appearance.js and the project's portable CSS files.
Python exports place themes/ beside app.py; the Windows packager puts themes/
beside project.json in _internal/. packaged.launch reads these editable CSS files
when present and falls back to embedded project CSS. Runtime does not need the
CSS parser to apply already imported themes. Framework JavaScript widgets,
arbitrary framework-specific markup, remote dependencies, and @import
layer/supports qualifiers remain outside this implementation.

Verification: 110 automated Python tests pass. Native Windows WebView2 Designer
checks cover both real frameworks, editor isolation, rem sizing, overrides/reset,
geometry, event execution, persistence, visibility, pan/zoom, drag/resize, context
menus, menu shortcuts and Events tabs. Existing Designer and main/secondary
runtime smoke groups pass. Relocated Python/Bootstrap and executable/Milligram
ZIPs start in unrelated working directories, display framework styling, and
execute saved button/change handlers. Linux GTK 4/WebKitGTK 6.0 remains unverified.

## Theme palette and explicit color confirmation (2026-10-15)

Native input[type=color] popups are replaced by a designer-owned modal with named
theme swatches, a draft preview, optional custom CSS/hex and RGB controls, and
explicit Apply/Cancel. Escape cancels. Palette buttons support keyboard navigation
and a single tab stop. Inspector color buttons show computed effective colors,
including theme-owned window backgrounds. Applying a window color automatically
disables use_theme_background and suppresses a theme background image; restoring
theme background removes both overrides. This fixes the previously masked picker
selection and its stale swatch without changing IDE styling.

Shared assets/theme-colors.js derives semantic roles from the active theme's
computed CSS variables and sample controls, and exposes additional CSS colors.
The same palette is built by ViperApplicationSurface in Designer, Preview and Run.
Palette aliases are scoped to the app document/canvas, keeping IDE chrome isolated.
Component color overrides use CSS var(--viper-color-ROLE, FALLBACK) references.
WindowSettings.background_theme_color records the selected role while keeping
background_color as a native-safe hex fallback. Roles follow theme switches;
missing colors retain their saved fallback and custom colors stay fixed. Old
projects default to an empty role. IDs, layout and Python source remain intact.

Both export formats include the shared palette asset and preserve references in
project JSON. Windows integration checks cover effective swatches, explicit draft
confirmation/cancellation, automatic background override, keyboard selection,
custom colors, both real framework palettes, imported CSS variables, gradients,
theme switching, missing-role fallbacks and save/reload. Python model tests cover
round-trip/migration and role validation. Native Linux verification is pending.

## Pointer and keyboard button focus (2026-10-15)

Milligram's :focus rule uses its hover color, leaving a clicked button dark even
after mouse exit. The shared application surface now adapts theme CSSOM selectors
so :focus visual rules require :focus-visible on button.component. Other controls
retain pointer focus styling; :hover, :focus-visible and :focus-within are intact.
The :where guard preserves selector specificity. Selector strings, escaped tokens,
comments and attribute values are preserved. Nested CSS rule groups are adapted.
Project CSS source stays unchanged, including existing embedded/imported themes.
No blur handlers or lost keyboard focus are introduced; the same adaptation serves
Preview, Run and exports. IDE chrome remains outside the adapted stylesheet.

Windows CDP regression checks reproduce the original color mismatch with real
pointer input, verify restored colors while focus remains, and check visible Tab
focus and Enter activation of saved Python handlers. Designer integration also
checks selector preservation and shared-surface adaptation. Linux is unverified.

## Inspector ownership of global settings (2026-10-15)

Application appearance (CSS theme, import, refresh and theme folder) now belongs
inside project-properties alongside project name, description and startup window.
The existing project selection visibility controls the whole group. Global theme
controls appear only when the parent project is selected; window/component
selection shows properties owned by that item. Component appearance and per-window
background overrides stay with their owners. No model, theme application, event
source, export format or rendering behavior changes.

## Window-owned Python imports and compact Events editor (2026-10-15)

WindowDefinition.imports stores a verbatim source block, defaulting to empty for
existing projects/new windows. Window properties expose a monospace Imports field;
the Events toolbar has a Window imports shortcut that selects its owning window
and focuses the field. The two explanatory paragraphs above event source are
removed. Handler authoring, status/error feedback and project source are retained.

event_imports.py validates import-only syntax on use/export, including aliases,
absolute import paths and reserved event API names. Incomplete drafts can still
save and reopen. Runtime lazily executes each window's block once per session,
caches its imported bindings, and seeds each saved handler's existing per-window/
per-handler namespace. Aliases override automatic control bindings; explicit
event.controls lookup remains available. Registered external handlers keep their
own globals. Failed imports identify the window and do not cache partial bindings.
Modules themselves retain normal Python sys.modules caching; this is namespace
ownership, not separate interpreters or module instances. Preview edits reset the
same existing bridge Runtime. Event code is never rewritten or concatenated.

The exporter statically gathers imports from all windows and mapped event source
without executing user code. Python requirements and Windows hidden imports use
that combined module set. Both existing export formats copy the same runtime and
window source. No package auto-installation, second dispatcher, native dependency
or platform-specific shared logic is introduced.

Verification: 125 Python tests pass, including import aliases, shared bindings,
window isolation, lazy loading, errors, name collisions, source/draft persistence,
Preview reset and export dependency metadata. Windows Designer passes ten new
import checks alongside its existing groups. Relocated Python and executable
smoke fixtures use a window-level Fraction import from saved event code. Native
Linux behavior remains unverified.

## Click activation of docked tool tabs (2026-10-15)

Workspace pointer capture retargets a tab's pointerup/click to the workspace, so
native clicks failed even though scripted element.click() tests passed. Pending
gestures now retain their pressed tab. A release inside that tab below the drag
threshold explicitly activates it and focuses the replacement tab. Drag capture,
threshold, cancellation, placement and keyboard activation keep their existing
paths. Application definitions, geometry and event source remain unchanged.

windows_smoke.py --pointer adds real WebView2 CDP mouse/keyboard input rather than
synthetic tab clicks. It reproduces the original failure and verifies fourteen
checks for single clicks, active tabs, pointer jitter, keyboard switching, docking
an individual tab, floating tab groups, clicks after dragging and project-data
preservation. Existing forty-five workspace checks and all other Designer groups
pass; 125 Python tests pass. Native Linux behavior remains unverified.

## Overflowing tool-tab labels (2026-10-15)

The tab strip now uses intrinsic height with a minimum height on each tab, so a
native horizontal scrollbar gets space below the labels. Vertical overflow is
hidden and labels stay on one line. The previous fixed strip height included the
scrollbar, squeezing/cropping labels when three tools shared a narrow dock.
Windows --pointer smoke reproduces that clipping before the fix and now passes
fifteen checks, including text bounds above the scrollbar in a three-tool dock,
alongside the existing Designer groups. Native Linux verification is pending.

## Compact component size dropdown (2026-10-15)

Designer size controls retain the native select and existing Fixed/Stretch values
but show only a 20px corner chevron while closed. Option labels remain readable
when opened, with the existing accessible name and a Size behavior tooltip. The
same editor styling applies to default and themed application surfaces. Layout,
size-mode callbacks and Preview/Run behavior are unchanged. Windows verification
covers real mouse opening and keyboard selection in default and Bootstrap canvases,
plus the existing Designer/docking smoke groups. Linux remains unverified.

## NumPy Studio example (2026-10-15)

`examples/numpy_studio/project.json` is a complete editable dashboard with an
embedded local CSS theme, standard Viper controls, directed card-content anchors
and a sidebar filling between opposing window anchors. Separate relative-path
launchers open the same JSON in Designer or Runtime. The original starter fixture
is retained. NumPy is an optional example dependency, loaded by the window's
`import numpy as np` block rather than an external handler registration.

Saved events implement presets, random data generation, validated numeric input,
mean/median/population deviation, IQR outlier detection and an eight-bin histogram.
The histogram uses ordinary label Text updates. Standardizing produces z-scores
without replacing raw input; constant datasets become zeros. Invalid input keeps
the previous valid analysis and displays an inline error. A MeanValue change
handler demonstrates Python property-change notifications. No runtime, host,
solver, component or event API changes were needed.

Verification: 136 Python tests pass, including eleven example cases covering
known statistics, invalid input and recovery, normalization, outliers, random
generation and NumPy dependency collection in Python export. Native Windows
WebView2 checks pass for the actual example in Runtime and Designer Preview,
including styling, histogram totals, minimum-size layout and resize/input state.
The bundled preview image comes from the real runtime. Linux remains unverified.

## Selecting and deleting connected anchors (2026-10-15)

Creating a hard link now returns to selection mode. Previously the connection
tool remained active, disabling line hit targets, while ordinary anchor clicks
outside that tool did nothing. The existing Delete command also ignored link
selection and could delete the selected control or ask to delete the window.

The link editor now renders keyboard-focusable endpoint circles in its existing
SVG overlay, above controls and themed application documents. Clicking a line or
connected anchor selects its link, clears component selection and opens Inspector.
Repeated clicks on a shared endpoint cycle its links. Coincident endpoints remain
selectable when a line has zero length. Component, window and project selection
clear link selection. Delete and Inspector's Delete link use the same removal
method, which rebases the follower's authoring rectangle from its solved position
and size before removing the constraint. Remaining links and size mode are kept.
Input fields retain their native Delete behavior. No solver, host, runtime or
user event source changes are involved.

Verification: 136 Python tests pass. Windows WebView2 --pointer smoke reproduces
the original selection-mode failure and now passes 38 real mouse/keyboard checks
for default and Bootstrap canvases, alongside all existing Designer groups and
15 docking pointer checks. Coverage includes anchor/line selection, hidden
Inspector reopening, both deletion paths, shared anchors, coincident endpoints,
text editing, geometry preservation, persisted state and unchanged Python source.
Linux native verification remains pending.

## Document saving, title state and undo/redo (2026-10-15)

ViperApp owns the current project path and an independent saved-content checkpoint.
Load associates its path; New clears it. The native IDE title shows project name,
filename and a `*` when project contents differ from that checkpoint. Legacy
percentage-to-rectangle initialization and insignificant conversion roundoff do
not count as edits. This comparison does not mutate authored definitions or invoke
the hard-anchor solver. Native title changes use the existing host contract.

Save writes directly to a known path, including projects opened through the API.
Only a first save with no path asks for a destination. Save As is a separate bridge
command and always invokes the native picker. Successful saves establish the new
checkpoint/path; cancellation or write failure leaves both intact. A save dialog
captures its project and document identity so later edits remain dirty and a late
callback cannot associate another document. The serializer writes a complete
sibling temporary file before replacement, preserving previous bytes on failure.
Save commits pending Inspector fields while retaining focus. Preview's unchanged
dispatcher is preserved. Session paths/checkpoints never enter project JSON.

`assets/designer-history.js` holds bounded, headless project snapshots: at most 50
prior steps, trimmed further by a string-storage budget (retaining the latest
undo step). The existing sync boundary records edits, with completed gestures as
one step and consecutive event/import typing grouped within 900 milliseconds.
Menus, toolbar, Ctrl+Z and Ctrl+Shift+Z use the same actions. Inputs retain native
text undo. Restoring a snapshot preserves valid active documents/view state,
prunes stale documents and refreshes the same renderer/solver and Python bridge.
Undo/redo intentionally restore exact authored source without regenerating it.
Project history excludes workspace tools, document tabs, zoom and Preview state.
Saving keeps history; New/Open reset it; a new edit clears redo. Preview disables
project undo/redo. The native saved-content comparison handles revisiting the save
checkpoint in either direction, independently of the history storage limit.

Verification: 146 Python tests pass, including ten document-save cases for file
association, first/subsequent saves, cancellation, failed writes, source/style
checkpoints, portable API loading, migration normalization and delayed callbacks.
Windows WebView2 passes all existing Designer/pointer groups and 38 new document
checks with actual bridge/file writes, controlled picker responses and actual
native title changes. Coverage includes save checkpoints, pending Inspector edits,
typing groups, geometry, anchors, controls, sibling/startup/final-form deletion,
verbatim incomplete code/imports, history branching, limits and document resets.
The NumPy designer launcher now calls app.load so Save remembers its JSON path.
Linux native verification remains outstanding.
