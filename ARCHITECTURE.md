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
handlers supplied explicitly through `Runtime(project, handlers)`. Preview uses
that same dispatcher through Bridge. Event mappings are serialized, Python source
is not. Automatic handler-module discovery and a visual event editor are deferred.

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
multi-selection/alignment/distribution, additional project windows, hierarchy,
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
