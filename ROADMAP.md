# Viper roadmap

The next major focus is expanding the element library so more complete desktop
applications can be built in the designer. These are planned additions, with
priorities refined as the existing controls and workflows are exercised.

See the [README](README.md#what-you-can-build-today) for current capabilities.

## More elements

### Inputs and selection

- [ ] Dropdowns and combo boxes.
- [ ] Radio buttons and radio groups.
- [ ] Sliders and numeric inputs with stepping.
- [ ] Multiline text areas and password inputs.
- [ ] Date and time pickers.
- [ ] Toggle switches.

### Data and feedback

- [ ] Lists and selectable list boxes.
- [ ] Tables and data grids.
- [ ] Tree views for application data.
- [ ] Progress bars and activity indicators.
- [ ] Images, icons and image previews.
- [ ] Tooltips, status messages and notifications.
- [ ] Charts for simple data visualization.

### Layout and navigation

- [ ] Nested containers with their own coordinate systems.
- [ ] Scrollable panels and split views.
- [ ] Tabs and grouped content inside applications.
- [ ] Application menus, toolbars and status bars.
- [ ] Reusable component groups and templates.

Every new element should support the same core workflow: visual editing,
Inspector properties, saved project definitions, Python events, Preview, Run,
themes and export. New container layouts must keep hard anchors predictable.

## A faster editing workflow

- [ ] Multiple selection and group editing.
- [ ] Cut, copy and paste for controls and groups.
- [ ] Alignment and distribution tools.
- [ ] Recent projects and easier project reopening.
- [ ] More starter projects and examples for common desktop tasks.

## Application behavior

- [ ] Open, close and switch application windows from Python handlers.
- [ ] Application dialogs and file/folder selection from Python.
- [ ] Richer control APIs for selected values, items and data collections.
- [ ] Clearer event errors and easier navigation between handlers and controls.
- [ ] Better packaging of local helper modules and application data files.

## Platforms and distribution

- [ ] Verify the designer and runtime natively on Linux with GTK 4 / WebKitGTK 6.0.
- [ ] Check styling and interactions across both rendering engines.
- [ ] Exercise exports on a clean Windows machine and verify native file dialogs manually.
- [ ] Linux desktop integration and standalone application export.
- [ ] Installers and a simpler prerequisite/setup experience.

Implementation should extend the shared component renderer, layout solver and
event API. Platform-specific behavior stays in the native host adapters.
