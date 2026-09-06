import QtQuick
import Quickshell
import Quickshell.Io

// Marketplace entry point (ADR-0003): the Omarchy shell loads exactly one
// of these, once, for as long as this plugin is enabled
// (`omarchy plugin enable com.keithrowell.omasnap`), parented under its
// own non-visual `serviceHost` item — see `shell.qml`'s `ensureService()`.
// It owns no UI itself; it only exposes an IPC target so `bin/omasnap`
// (already running the selection/highlight pipeline as a plain script) can
// ask the *already-running* shell to show a preview, instead of spawning a
// fresh `qs` process per snap the way the old standalone design did.
//
//   qs ipc call omasnap show <input> <request> <root> <previewPng> <auto> <shotPath>
//   omarchy-shell omasnap show <input> <request> <root> <previewPng> <auto> <shotPath>
//
// A second call while a preview is already open destroys the old one first
// — the direct replacement for the old design's `qs kill -p .../Main.qml`.
//
// `inputPath`/`requestPath`/`previewPngPath` are per-run scratch files
// under `$XDG_RUNTIME_DIR/omasnap/`; the old standalone-process design let
// `bin/omasnap`'s own EXIT trap delete them once `qs` (which it ran
// synchronously) finished. Now that call returns immediately, long before
// the overlay it triggered is closed — the overlay reads `requestPath` and
// writes `previewPngPath` for as long as it stays open, potentially
// minutes later — so cleanup moves here, firing once the overlay this
// service created actually closes.
QtObject {
    id: root

    // Set by the host when present (see shell.qml's ensureService(), which
    // copies these onto the instance if the property exists) — none of
    // them are used here, but declaring them means the host's generic
    // property assignment is a no-op instead of a QML warning.
    property var shell
    property var manifest
    property var pluginRegistry
    property var barWidgetRegistry
    property string omarchyPath: ""

    // The one live Overlay instance, or null, and the scratch files it was
    // given — tracked together so a second `show()` (replacing an open
    // preview) and a self-close (Esc, Close, an OMASNAP_AUTO run finishing)
    // both retire the same way.
    property var _overlay: null
    property var _overlayFiles: null

    function _retire(overlay) {
        if (root._overlay !== overlay) return;
        root._overlay = null;
        if (root._overlayFiles !== null) {
            root.cleanupProcess.command = ["rm", "-f",
                root._overlayFiles.inputPath, root._overlayFiles.requestPath, root._overlayFiles.previewPngPath];
            root.cleanupProcess.running = true;
        }
        root._overlayFiles = null;
        overlay.destroy();
    }

    function show(inputPath, requestPath, rootDir, previewPngPath, auto, shotPath) {
        if (root._overlay !== null) {
            root._retire(root._overlay);
        }
        const component = Qt.createComponent(Qt.resolvedUrl("Overlay.qml"));
        if (component.status !== Component.Ready) {
            console.error("omasnap: failed to load Overlay.qml: " + component.errorString());
            return;
        }
        const overlay = component.createObject(root, {
            inputPath: inputPath,
            requestPath: requestPath,
            rootDir: rootDir,
            previewPngPath: previewPngPath,
            autoMode: auto,
            shotPathOverride: shotPath,
        });
        if (overlay === null) {
            console.error("omasnap: could not create the preview window");
            return;
        }
        overlay.overlayClosed.connect(function () { root._retire(overlay); });
        root._overlay = overlay;
        root._overlayFiles = { inputPath: inputPath, requestPath: requestPath, previewPngPath: previewPngPath };
    }

    // Same "no default property" reason as `ipc` above.
    property Process cleanupProcess: Process {
        stdinEnabled: false
    }

    // `QtObject` has no default property, unlike `Item`, so the handler
    // must be assigned explicitly rather than nested as a plain child.
    property IpcHandler ipc: IpcHandler {
        target: "omasnap"

        function show(inputPath: string, requestPath: string, rootDir: string, previewPngPath: string, auto: string, shotPath: string): void {
            root.show(inputPath, requestPath, rootDir, previewPngPath, auto, shotPath);
        }
    }
}
