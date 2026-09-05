import QtQuick
import QtQuick.Window
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import "Grab.js" as Grab

// Entry point: `qs -p app/Main.qml` (via bin/omasnap). Three modes, chosen
// by environment variables `bin/omasnap` sets (see the plans for specs
// 0004 and 0006 — `qs` forwards no CLI arguments to QML):
//
// - `OMASNAP_MODE=preview`: the live preview (spec 0006). Loads
//   `Preview.qml`, which reads `OMASNAP_INPUT`/`OMASNAP_REQUEST` itself.
// - `OMASNAP_INPUT` set (and not preview mode): render mode. Load the JSON
//   at that path (built by `lib/input.mjs` from a fixture and the current
//   theme), show it in `Snap`, and once it settles, grab it to a PNG at
//   `OMASNAP_OUT` and quit.
// - Otherwise: the placeholder window from spec 0001.
ShellRoot {
    id: root

    readonly property string mode: Quickshell.env("OMASNAP_MODE") || ""
    readonly property string inputPath: Quickshell.env("OMASNAP_INPUT") || ""
    readonly property string outPath: Quickshell.env("OMASNAP_OUT") || ""

    // How long after `Snap.ready` becomes true to wait before grabbing, so
    // the last frame (blur, SVG decode) has settled.
    readonly property int settleDelayMs: 250
    // How long to wait for a render before giving up and quitting anyway.
    readonly property int renderTimeoutMs: 5000

    Loader {
        active: root.mode === "preview"
        sourceComponent: previewWindow
    }
    Loader {
        active: root.mode !== "preview" && root.inputPath !== ""
        sourceComponent: renderWindow
    }
    Loader {
        active: root.mode !== "preview" && root.inputPath === ""
        sourceComponent: placeholderWindow
    }

    Component {
        id: previewWindow
        Preview {}
    }

    Component {
        id: renderWindow

        FloatingWindow {
            id: renderFloating
            title: "Omasnap"
            implicitWidth: snapItem.width > 0 ? snapItem.width : 640
            implicitHeight: snapItem.height > 0 ? snapItem.height : 360

            property var parsedInput: null
            property bool grabbed: false

            // `grabToImage`'s `targetSize` is scaled again by the window's
            // actual on-screen (Hyprland) scale before rasterising — Qt's own
            // `Screen.devicePixelRatio` under-reports it (rounds 1.6 up to
            // 2), so a plain `width * exportScale` target came out at
            // `exportScale * 1.6`, not `exportScale`, on this monitor (see
            // the plan's environment facts; that mismatch was found here, in
            // the render itself, not at plan time). Dividing the target by
            // Hyprland's own reported scale for this screen cancels it out.
            readonly property var monitor: Hyprland.monitors.values.find(m => renderFloating.screen && m.name === renderFloating.screen.name) ?? null
            readonly property real screenScale: monitor && monitor.scale > 0 ? monitor.scale : Screen.devicePixelRatio

            function fail(message) {
                console.error("render: " + message);
                Qt.quit();
            }

            function grab() {
                if (renderFloating.grabbed) return;
                renderFloating.grabbed = true;
                const size = Grab.exportSize(snapItem, snapItem.exportScale, renderFloating.screenScale);
                snapItem.grabToImage(function (result) {
                    const ok = result.saveToFile(root.outPath);
                    console.info("render: " + (ok ? "wrote " : "FAILED to write ") + root.outPath
                        + " (" + snapItem.width + "x" + snapItem.height + " logical, "
                        + Math.round(size.width) + "x" + Math.round(size.height) + " px requested, screen scale "
                        + renderFloating.screenScale + ")");
                    Qt.quit();
                }, Qt.size(size.width, size.height));
            }

            FileView {
                id: inputFile
                path: root.inputPath
                blockLoading: true
                printErrors: false
                onLoaded: {
                    try {
                        renderFloating.parsedInput = JSON.parse(text());
                    } catch (e) {
                        renderFloating.fail("invalid input JSON at " + root.inputPath + ": " + e);
                    }
                }
                onLoadFailed: (error) => renderFloating.fail("could not read " + root.inputPath + ": " + error);
            }

            Snap {
                id: snapItem
                input: renderFloating.parsedInput
                visible: input !== null

                onReadyChanged: if (ready) settleTimer.start()
            }

            Timer {
                id: settleTimer
                interval: root.settleDelayMs
                onTriggered: renderFloating.grab()
            }

            Timer {
                id: guardTimer
                interval: root.renderTimeoutMs
                running: true
                onTriggered: renderFloating.fail("timed out after " + root.renderTimeoutMs + "ms")
            }

            onClosed: Qt.quit()
        }
    }

    // Placeholder window for spec 0001 (packaging): proves the launcher, the
    // plugin symlink and a themed window all work end to end before any
    // snapping behaviour exists.
    //
    // Colours come from ~/.local/state/omarchy/current/theme/colors.toml,
    // read live through a FileView (no restart needed on a theme switch).
    // Until the file loads, or a key is missing, this falls back to Qt's
    // system palette — never to a literal colour. Spec 0003 replaces this
    // inline reading with lib/theme.mjs and a Theme singleton; this stays
    // small on purpose so that swap is a deletion.
    Component {
        id: placeholderWindow

        FloatingWindow {
            id: window
            title: "Omasnap"
            implicitWidth: 640
            implicitHeight: 360

            readonly property string colorsPath: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/colors.toml"

            // Empty string means "not loaded (yet)"; readColor only ever
            // returns a value it found in the file, so a missing key falls
            // through too.
            property string themeBackground: ""
            property string themeForeground: ""

            // Pulls one `key = "#rrggbb"`-shaped line out of colors.toml's
            // text. Theme-parsing code: the hex pattern here is a regex, not
            // a literal.
            function readColor(text, key) {
                const re = new RegExp("^\\s*" + key + "\\s*=\\s*\"(#[0-9a-fA-F]{3,8})\"", "m");
                const match = re.exec(text);
                return match ? match[1] : "";
            }

            color: themeBackground !== "" ? themeBackground : systemPalette.window

            SystemPalette {
                id: systemPalette
            }

            FileView {
                id: colorsFile
                path: window.colorsPath
                watchChanges: true
                printErrors: false
                onLoaded: {
                    const contents = text();
                    window.themeBackground = window.readColor(contents, "background");
                    window.themeForeground = window.readColor(contents, "foreground");
                }
                onLoadFailed: {
                    window.themeBackground = "";
                    window.themeForeground = "";
                }
                onFileChanged: reload()
            }

            FocusScope {
                id: input
                anchors.fill: parent
                focus: true
                Keys.onEscapePressed: Qt.quit()

                Column {
                    anchors.centerIn: parent
                    spacing: 12

                    Text {
                        anchors.horizontalCenter: parent.horizontalCenter
                        text: "Omasnap"
                        color: window.themeForeground !== "" ? window.themeForeground : systemPalette.windowText
                        font.family: "monospace"
                        font.pixelSize: 32
                    }

                    Text {
                        anchors.horizontalCenter: parent.horizontalCenter
                        text: "Select code, press the binding."
                        color: window.themeForeground !== "" ? window.themeForeground : systemPalette.windowText
                        font.family: "monospace"
                        font.pixelSize: 16
                    }
                }
            }

            onClosed: Qt.quit()
        }
    }
}
