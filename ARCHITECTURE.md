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

Windows .exe packaging and Linux .desktop installation are delivery targets,
not completed deployment systems in Milestone 1. A future exporter must package
the same runtime, assets and host adapters; Linux standalone bundling is later.
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
