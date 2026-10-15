# Viper user guide

[Quick start](../README.md#install-and-run) · [NumPy demo](../examples/numpy_studio/README.md) · [Roadmap](../ROADMAP.md)

## Workspace and projects

Project Explorer shows **Project → Windows → Components**. Select the project
to edit its name, description, startup window and global application appearance.
Select a window or component to edit its own properties in Inspector. Hidden or
covered components remain accessible through the tree.

Add a form with **+ Window**, the document tab's **+**, or **Insert > New Window**.
All forms belong to the project. Closing a tab keeps its form; select it in
Explorer to reopen it. Deleting a window asks for confirmation. Deleting the
startup window chooses the first remaining sibling; an empty project can still
be saved and reopened. Deleting a component removes its links and Events tabs.
These deletions retain Python source, including shared and unmapped code.

**Preview** and **Run** use the active form. When the project is selected, they
use its configured startup window. Packaged and command-line applications also
use the configured startup window unless an explicit form ID is supplied.

Use **Windows** to open Project Explorer, Components and Inspector. Drag a tool's
title bar to float or dock its group; drag an individual tool tab to detach it.
Drop into an occupied dock or onto **Join tabs** to combine tools. Resize using
dock boundaries or floating handles. **Windows > Reset Workspace** restores the
default arrangement. Workspace placement persists locally, separately from projects.

### Window and component properties

Click the window frame, empty canvas or **View > Window Properties** to edit
client dimensions, minimum size, title, icon, background, decorations and initial
state. The outer corner handle resizes the design surface. Icons are embedded
in the project. Run applies these settings to the application window.

Drag the board or frame to pan; scroll to zoom around the pointer. Logical
dimensions stay the same. **Show Grid**, **Snap to Grid** and **Snap to Elements**
are independent preferences. Snapping defaults off and applies to movement.

**Depth (Z)** controls overlap: 0 Back, 1 Behind, 2 Normal, 3 Above and 4 Front.
Higher values draw above lower ones; equal depths follow component order, with
later controls on top. Selection keeps this order.

### Saving and history

**Save / Ctrl+S** uses the current file; the first save of a new project asks for
a destination. **Save As / Ctrl+Shift+S** always chooses another file. A successful
Save As makes that destination current. The title's `*` marks unsaved contents.
Cancelled or failed saves preserve the previous destination and saved checkpoint.

**Undo / Ctrl+Z** and **Redo / Ctrl+Shift+Z** restore project edits, including
geometry, links, forms, themes, event mappings and exact Python source. Completed
drags/resizes are single steps; consecutive event-source/import typing is grouped.
Inputs keep native text undo. Saving keeps history; New/Open reset it. A new edit
after Undo discards redo. History has a 50-step maximum and a memory limit, and is
disabled during Preview. Workspace placement, tabs and zoom are outside history.

Save before replacing a project with New or Open. Closing an Events tab keeps
its saved mappings and source; it does not delete the handler.

## Anchor layouts

Choose **Connect Anchors**, click the reference anchor, then the follower anchor.
The window always acts as a reference. A completed link returns to selection
mode; choose the tool again for another link. Escape cancels linking.

Click a line or connected anchor to select its link and open Inspector. Repeated
clicks on a shared endpoint cycle its links. Press **Delete** or use **Delete link**
to unlink while preserving the element's displayed size and position.

Links store signed, dimensionless distances relative to the client dimensions:

```text
follower_x = reference_x + distance_x × client_width
follower_y = reference_y + distance_y × client_height
```

For example, `0.1` means 10% of the corresponding dimension. Negative values
reverse the offset. Choose X and Y, X only or Y only in Inspector. Moving a
reference moves its followers, including chains. Deliberately dragging a follower
updates its incoming distance scalars.

**Fixed** controls retain their dimensions. **Stretch** controls scale with the
window or fill between opposing anchors. Adding opposing constraints enables
Stretch; remove them before switching back to Fixed. Cycles, conflicting links
and infeasible minimum sizes are rejected. Errors preserve the last valid layout.
Unlinked positions scale with the window. Panels can act as references in window
space; nested container coordinate systems are planned.

## Themes and appearance

Select the parent project, then **Project properties > Application appearance**
in Inspector. Choose Viper default, Bootstrap or Milligram, or use **Import CSS**
for a local stylesheet. Themes apply to Designer, Preview, Run and exports. IDE
chrome and native window decorations keep their own appearance.

Imported stylesheets are copied into `viper/themes/`; Inspector shows the folder.
Use **Refresh** to reload the active theme from disk. Projects embed their theme
CSS, so reopening a project does not require the original stylesheet.

Controls receive framework classes automatically:

| Control | Classes |
| --- | --- |
| Button | `btn btn-primary button is-primary` |
| Text input | `form-control input` |
| Label | `form-label` |
| Panel | `card card-body` |
| Checkbox | `form-check`, with `form-check-input` and `form-check-label` children |

Select a component's **Appearance** to override fonts, colors, borders, corner
radius, padding, alignment, wrapping and overflow. Blank fields inherit; **Reset
appearance** clears overrides. Themes retain authored geometry, anchors and depth.
Imported CSS supplies styling; framework JavaScript widgets and special markup
are outside the current component system.

Color buttons show the effective color. Choose a named palette role or custom
CSS/hex value, then **Apply**; Cancel/Escape discards the draft. Named roles follow
theme switches and retain a saved fallback when unavailable. Custom colors stay
fixed. A window background choice disables **Use CSS theme background**; restore
that setting to use the theme's background again.

Local CSS imports are combined and local images/fonts embedded. Download remote
resources before importing: network resources, import cycles and `@import
layer/supports` qualifiers are rejected. Combined CSS is limited to 8 MB,
individual images/fonts to 2 MB, and projects to 32 themes. Bundled framework CSS
includes its license notices.

## Python events and imports

Double-click a control or choose **Edit Events**. Select `click` or `change`,
choose **Create handler**, and edit its Python function. Existing source is
preserved when handlers are created, controls renamed or forms switched. Drafts,
including incomplete Python, can be saved; errors are reported on use or build.

Select a window's **Imports** field, or use **Window imports** in the Events
toolbar, to provide dependencies shared by that window's saved handlers:

```python
import numpy as np
from pathlib import Path
```

Install third-party packages into Viper's Python environment first. Imports load
on first handler use and are cached for that Preview/Run session. Each window
owns its aliases; Python's normal module cache still applies. This field accepts
import statements and comments, including aliases and absolute imports. Avoid
`import *` and aliases reserved by the event API: `controls`, `form` and `event`.
Imports inside event source continue to work.

### Accessing controls

Saved handlers can use a control's name directly within its window:

```python
def on_MainWindow_Launch_click(event):
    StatusLabel.Text = NameInput.Text
    Launch.Enabled = False
```

| Property | Support |
| --- | --- |
| `Text`, `Enabled`, `Visible` | All controls; writable |
| `Checked` | Checkboxes; writable |
| `Value` | Alias for text-input Text or checkbox Checked |
| `Name`, `Id` | Read-only |

Lowercase aliases work. Reads include current input and checkbox values, even
when those inputs have no handlers. Use `event.controls['NameInput']` or
`controls['NameInput']` for explicit lookup, and
`event.controls.by_id(component_id)` for duplicate names.

Direct control names must be Python identifiers without a leading underscore
and must not collide with builtins, handler names or API helpers. Import aliases
take precedence over automatic control names. Renaming a control changes its
runtime name; update references yourself or use stable IDs. Viper does not rewrite
Python source.

Events remain dictionaries with `window_id`, `component_id`, `event` and `value`.
`event.sender` exposes the source control, `event.controls` the window's controls,
and `event.form` its `id`, `name` and `controls`.

### Updates and change handlers

Runtime property writes update displayed controls and leave the saved design
unchanged. Restarting Preview restores authored values. Unchanged saves preserve
the current Preview session. The runtime property API covers content, visibility
and enabled state; layout editing uses anchors.

Changing `Text` or checkbox `Checked` from Python also invokes that control's
mapped `change` handler, including labels. It receives the new `value` and
`property='Text'` or `'Checked'`. Unchanged assignments and Enabled/Visible writes
do not notify. Multiple writes to one property in a handler notify its final value.

Change handlers can update other controls. The runtime applies the final updates
together; errors or a chain exceeding 64 events roll back that interaction's UI
writes while retaining received user input. Text-input browser change events occur
after an edit loses focus, and checkbox change events on toggle. Applying Python
updates does not synthesize duplicate browser events.

### Running a saved project from Python

```python
from pathlib import Path
from viper.runtime import Runtime
from viper.serializer import load_project

project = load_project(Path(__file__).resolve().parent / 'project.json')
Runtime(project).launch()
```

The CLI equivalent is `python -m viper.runtime project.json`. Supply
`--window FORM_ID` or `Runtime(project, window_id='FORM_ID')` for another form.
Viper must be installed for this API launcher; Python exports include their own
runtime package.

You can explicitly pass handlers with `Runtime(project, handlers={'launch': fn})`.
Registrations take precedence over saved source and retain their own Python
globals; use `event.controls` to access controls. External handler modules are
not discovered automatically. Move registered handlers into saved project source
before exporting.

## Exporting and sharing

Select the project's **Startup window**, then **File > Build / Package** or
**Run > Build / Package**. Builds capture the current project, including unsaved
edits, all forms, imports and saved source, and run in the background. Later edits
do not change that snapshot. Build is disabled during Preview or another build.
Cancellation leaves existing output intact; failed builds preserve previous ZIPs.

### Python project ZIP

The ZIP contains `app.py`, `project.json`, `requirements.txt`, the Viper runtime
package and application assets. Recipients need Python 3.11+ and the listed
dependencies; they do not install Viper or PyInstaller separately. Extract it and run:

```powershell
python -m pip install -r requirements.txt
python app.py
```

Linux also needs system GTK 4, WebKitGTK 6.0 and PyGObject; native Linux behavior
remains unverified. The launcher resolves resources relative to itself and works
from an unrelated working directory.

### Windows executable ZIP

Install build tools in Viper's environment:

```powershell
python -m pip install -e ".[build]"
```

Build on Windows for a compatible Windows architecture. Recipients extract the
whole folder and open its `.exe`; `_internal` must remain alongside it. Python,
Viper and imported modules are bundled. WebView2 Runtime and .NET Framework 4.8
are system prerequisites. This is a folder distribution; installers,
cross-compilation and Linux executable export are outside the current exporter.

Both formats include editable theme files: `themes/` beside `app.py` for Python,
and `_internal/themes/` for Windows. Launchers prefer those files when present
and fall back to embedded CSS. Keep exported folders together. Executable startup
errors show a native message and write `viper-application-error.log` in the system
temporary folder.

### Dependencies and CLI options

```powershell
python -m viper.build project.json --format python --output dist/MyApp_python.zip
python -m viper.build project.json --output dist/MyApp.zip
```

`viper-build` is equivalent. Executable export is the default; use `--overwrite`
to replace an existing ZIP. Both formats collect static imports from window
imports and mapped saved handlers without executing user code. Third-party
packages must be installed in the export environment. Python export pins their
installed distributions; executable export bundles their modules.

For dynamic imports, add `--hidden-import module_name`. Local helper modules
must be packaged so their distributions can be collected. Additional application
data files and external handler registrations are not exported automatically.
Missing or empty event source is inactive and does not block export. Nonempty
mapped source must pass syntax/import checks; unmapped drafts are retained verbatim.

## Validation

Run automated tests from the repository root:

```powershell
python -m pip install pytest
python -m pytest -q -p no:cacheprovider
```

Native Windows checks require GUI access and WebView2:

```powershell
python tests/windows_smoke.py --pointer
python tests/windows_smoke.py --runtime
python tests/windows_smoke.py --runtime --secondary
python tests/windows_export_smoke.py --build
python tests/windows_export_smoke.py --format python --build
```

Executable build checks require the optional build tools. The NumPy demo checks
also require its requirements file. Verification history and outstanding native
checks are recorded in [ARCHITECTURE.md](../ARCHITECTURE.md).
