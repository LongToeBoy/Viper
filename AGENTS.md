# Viper project instructions

Read ARCHITECTURE.md and README.md before changing the project. Preserve working
code and deliver incrementally; do not introduce separate platform designers.

Only viper/hosts/ may select the OS or import native GUI libraries. Windows must
explicitly use WebView2; Linux must use GTK 4 and WebKitGTK 6.0. Shared modules and
frontend application logic must be independent of the rendering engine.
viper/assets/host.js is the transport counterpart of the native adapters.

Designer, Preview and Run must share project definitions, the headless hard-anchor solver, component rendering,
styles and the event dispatch API. Never overwrite user-authored event code.
Use pathlib and relative paths in portable project launchers. Do not claim an OS
works without native verification. Run the relevant automated tests and Windows
integration smoke test for host or frontend changes when GUI access is available.

Hard anchor links use signed, dimensionless X/Y distances relative to the window
client dimensions. Links are directed from reference to follower. Constant-size
elements keep their size; stretch elements scale or fill between opposing anchors.
Reject cycles and conflicting constraints instead of silently breaking a link.
Keep the solver independent of the DOM and native hosts. Render with transforms
on changes only; do not reintroduce physics or a continuous animation loop.
