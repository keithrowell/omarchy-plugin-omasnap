import QtQuick
import QtQuick.Window
import Quickshell
import Quickshell.Io

// Entry point: `qs -p app/Main.qml` (via bin/omasnap). Placeholder window for
// spec 0001 (packaging): proves the launcher, the plugin symlink and a themed
// window all work end to end before any snapping behaviour exists.
//
// Colours come from ~/.local/state/omarchy/current/theme/colors.toml, read
// live through a FileView (no restart needed on a theme switch). Until the
// file loads, or a key is missing, this falls back to Qt's system palette —
// never to a literal colour. Spec 0003 replaces this inline reading with
// lib/theme.mjs and a Theme singleton; this stays small on purpose so that
// swap is a deletion.
ShellRoot {
    FloatingWindow {
        id: window
        title: "Omasnap"
        implicitWidth: 640
        implicitHeight: 360

        readonly property string colorsPath: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/colors.toml"

        // Empty string means "not loaded (yet)"; readColor only ever returns
        // a value it found in the file, so a missing key falls through too.
        property string themeBackground: ""
        property string themeForeground: ""

        // Pulls one `key = "#rrggbb"`-shaped line out of colors.toml's text.
        // Theme-parsing code: the hex pattern here is a regex, not a literal.
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
