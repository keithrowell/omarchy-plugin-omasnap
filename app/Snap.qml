import QtQuick
import QtQuick.Effects
import Qt5Compat.GraphicalEffects

// The frame: backdrop (blurred wallpaper) -> shadow -> window (title bar,
// line-number gutter, code). Renders one `input` document — the JSON built
// by `lib/input.mjs` from a fixture (or, from spec 0006, a live selection)
// plus the current Omarchy theme — set once by `Main.qml`'s render mode.
// Every colour below comes from `input.theme`; nothing is a literal.
//
// Sizing follows content (see `buildFrame()`): the window is as wide as its
// longest line, clamped to [minWidth, maxWidth] with over-width lines
// clipped to an ellipsis, and as tall as its line count (at least
// `minLines`). This item's own size is that window plus `backdropPadding`
// on every side, which is what `Main.qml` grabs to a PNG.
//
// `frame` is a single plain property holding everything the visual tree
// below reads (colours, font, geometry): it is (re)built once, atomically,
// `onInputChanged`, from `input` directly — never from intermediate
// reactive properties like `input.snap`. Two reasons: `buildFrame` both
// reads and writes `charMetrics` (it measures each line by setting
// `charMetrics.text`), so evaluating it as a property *binding* creates a
// self-referential binding loop; and `onInputChanged` fires as soon as
// `input` changes, before any sibling *bindings* also depending on `input`
// are guaranteed to have refreshed, so a delegate reading (say)
// `input.snap.font.family` directly as a binding could transiently observe
// a stale/null value the moment it is first created and throw — which was
// observed in practice (every code and gutter `Text` threw once on first
// render, before recovering). Routing every delegate through the one
// `frame` object sidesteps this: a JS object is handed to listeners whole,
// so there is no "half-updated" state to observe.
//
// The plan called for `font.styleHint: Font.Monospace` on every code `Text`
// so an unavailable family substitutes to a monospace font; this
// Quickshell/Qt build's QML `font` grouped property does not expose
// `styleHint` at all (confirmed with a two-line repro against both `Text`
// and `TextMetrics`), so it is omitted everywhere below. The rendered
// evidence uses JetBrainsMono Nerd Font, which is installed, so this has no
// visible effect here.
Item {
    id: root

    property var input: null

    // --- Named constants (every size/radius/opacity below is one of these; nothing inline) ---
    readonly property int exportScale: 2
    readonly property int windowRadius: 14
    readonly property int backdropPadding: 72
    readonly property int minWidth: 480
    readonly property int maxWidth: 1600
    readonly property int minLines: 3
    readonly property real blurStrength: 1.0
    readonly property int blurMax: 64
    // The backdrop is blurred anyway; a small decode source keeps MultiEffect cheap.
    readonly property int wallpaperSourceWidth: 960
    readonly property real overlayOpacity: 0.4
    readonly property int shadowOffsetY: 18
    readonly property real shadowBlur: 1.0
    readonly property real shadowOpacity: 0.55
    readonly property int gutterDigitsMin: 2
    readonly property string ellipsis: "…"
    // assets/omarchy-logo.svg's own viewBox (1215x285) — the wordmark's fixed aspect ratio.
    readonly property real logoAspectRatio: 1215 / 285
    // A safe, arbitrary size for the mark before `frame` exists.
    readonly property int defaultTitleBarHeight: 26

    readonly property int markHeight: frame ? frame.titleBarHeight : defaultTitleBarHeight
    // The mark sits below the window, vertically centred in the empty
    // `backdropPadding` strip between the window's bottom edge and the
    // canvas edge (the mark is wider than `backdropPadding` at this aspect
    // ratio, so it cannot also fit beside the window on the right without
    // overlapping it — see the mark's own comment below).
    readonly property int markMargin: Math.max(0, Math.round((backdropPadding - markHeight) / 2))

    // --- The one atomic snapshot the whole visual tree reads (see the header comment) ---
    property var frame: null
    onInputChanged: frame = input ? buildFrame(input) : null

    readonly property int winWidth: frame ? frame.winWidth : minWidth
    readonly property int winHeight: frame ? frame.winHeight : defaultTitleBarHeight * 2 + minLines * 20

    width: winWidth + 2 * backdropPadding
    height: winHeight + 2 * backdropPadding

    readonly property bool wallpaperSettled: !frame || !frame.wallpaper
        || wallpaperImage.status === Image.Ready || wallpaperImage.status === Image.Error
    readonly property bool logoSettled: logoImage.status === Image.Ready || logoImage.status === Image.Error
    readonly property bool ready: frame !== null && wallpaperSettled && logoSettled

    function clamp(value, lo, hi) {
        return Math.max(lo, Math.min(hi, value));
    }

    // Truncate `spans` to its first `count` characters, preserving each span's style.
    function clipSpans(spans, count) {
        const result = [];
        let remaining = count;
        for (const span of spans) {
            if (remaining <= 0) break;
            if (span.text.length <= remaining) {
                result.push(span);
                remaining -= span.text.length;
            } else {
                result.push({ text: span.text.slice(0, remaining), color: span.color, fontStyle: span.fontStyle, fontWeight: span.fontWeight });
                remaining = 0;
            }
        }
        return result;
    }

    function measureWidth(text, family, pixelSize) {
        charMetrics.font.family = family;
        charMetrics.font.pixelSize = pixelSize;
        charMetrics.text = text;
        return charMetrics.width;
    }

    // Build the one snapshot the visual tree renders from `inputData`
    // (`input`, passed explicitly — see the header comment for why not the
    // `input` property read some other way). Colours, font and geometry are
    // all resolved here, once, so every delegate below reads a single
    // already-complete object instead of reaching back into `input`.
    function buildFrame(inputData) {
        const snapData = inputData.snap;
        const colors = inputData.theme.colors;
        const editor = inputData.theme.editor;
        const fontFamily = snapData.font.family;
        const fontSize = snapData.font.size;
        // Zed's "comfortable" line height, VS Code's default, a generic middle ground.
        const lineHeightFactor = snapData.editor === "zed" ? 1.618 : snapData.editor === "vscode" ? 1.35 : 1.5;
        const lineHeight = Math.round(fontSize * lineHeightFactor);
        const padding = lineHeight;
        const titleBarHeight = Math.round(lineHeight * 2);

        const lineCount = snapData.lines.length;
        const renderedLineCount = Math.max(lineCount, minLines);
        const digits = Math.max(gutterDigitsMin, String(renderedLineCount).length);
        // `TextMetrics.width` on a single "0" measures that glyph's own ink
        // extent, not the font's fixed per-character advance — for
        // JetBrainsMono Nerd Font at 13px this under-measured by roughly a
        // quarter (6px vs. the ~7.8px a `Text` actually advances per
        // character), so a long line's clip threshold came out *higher*
        // than its real character count and nothing got clipped at all
        // (confirmed: a 240-character fixture line rendered in full, well
        // past the window edge, instead of being truncated). Measuring many
        // repeated characters and dividing gives the true average advance.
        const charSampleCount = 64;
        const charAdvance = measureWidth("0".repeat(charSampleCount), fontFamily, fontSize) / charSampleCount;
        const gutterWidth = Math.ceil(digits * charAdvance + charAdvance);
        const maxCodeWidth = maxWidth - gutterWidth - 2 * padding;

        const outLines = [];
        let longest = 0;
        for (let i = 0; i < lineCount; i++) {
            const spans = snapData.lines[i];
            const text = spans.map(s => s.text).join("");
            let width = measureWidth(text, fontFamily, fontSize);
            let lineSpans = spans;
            if (width > maxCodeWidth && charAdvance > 0) {
                const charsThatFit = Math.max(0, Math.floor(maxCodeWidth / charAdvance) - 1);
                lineSpans = clipSpans(spans, charsThatFit).concat([{ text: ellipsis, color: colors.muted, fontStyle: null, fontWeight: null }]);
                width = measureWidth(lineSpans.map(s => s.text).join(""), fontFamily, fontSize);
            }
            outLines.push(lineSpans);
            if (width > longest) longest = width;
        }

        const codeWidth = Math.min(longest, maxCodeWidth);

        return {
            filename: snapData.filename,
            language: snapData.language,
            fontFamily: fontFamily,
            fontSize: fontSize,
            lineHeight: lineHeight,
            padding: padding,
            titleBarHeight: titleBarHeight,
            lines: outLines,
            renderedLineCount: renderedLineCount,
            gutterWidth: gutterWidth,
            charAdvance: charAdvance,
            winWidth: clamp(gutterWidth + codeWidth + 2 * padding, minWidth, maxWidth),
            winHeight: titleBarHeight + 2 * padding + renderedLineCount * lineHeight,
            colors: colors,
            editorBackground: editor.background,
            lineNumberColor: editor.lineNumber,
            wallpaper: inputData.theme.wallpaper,
        };
    }

    // Hidden text used only to measure glyph widths with the code font
    // (monospace, so one character's advance is every character's advance).
    // Its `font` is set imperatively by `measureWidth`, not bound, for the
    // same reason `buildFrame` takes `inputData` as a parameter above.
    TextMetrics {
        id: charMetrics
        text: "0"
    }

    // --- 1. Backdrop -----------------------------------------------------
    Rectangle {
        id: backdropBase
        anchors.fill: parent
        color: frame ? frame.colors.darker_background : Qt.rgba(0, 0, 0, 1)
    }

    Image {
        id: wallpaperImage
        anchors.fill: parent
        visible: false
        asynchronous: false
        source: frame && frame.wallpaper ? "file://" + frame.wallpaper : ""
        fillMode: Image.PreserveAspectCrop
        sourceSize.width: wallpaperSourceWidth
    }

    MultiEffect {
        id: wallpaperBlur
        anchors.fill: parent
        source: wallpaperImage
        visible: frame && frame.wallpaper && wallpaperImage.status === Image.Ready
        blurEnabled: true
        blur: blurStrength
        blurMax: blurMax
        autoPaddingEnabled: false
    }

    Rectangle {
        id: backdropOverlay
        anchors.fill: parent
        color: frame ? frame.colors.darker_background : Qt.rgba(0, 0, 0, 1)
        opacity: overlayOpacity
    }

    // --- 2. Window, centred with backdropPadding on every side -----------
    MultiEffect {
        id: windowShadow
        anchors.fill: win
        source: win
        shadowEnabled: true
        shadowColor: frame ? frame.colors.darker_background : Qt.rgba(0, 0, 0, 1)
        shadowBlur: root.shadowBlur
        shadowOpacity: root.shadowOpacity
        shadowVerticalOffset: shadowOffsetY
        autoPaddingEnabled: true
    }

    Item {
        id: win
        anchors.centerIn: parent
        width: winWidth
        height: winHeight

        Rectangle {
            id: windowBase
            anchors.fill: parent
            radius: windowRadius
            color: frame ? frame.editorBackground : Qt.rgba(0, 0, 0, 1)
        }

        // Rounded top corners only: a fully-rounded rect plus a square patch
        // over its bottom half (avoids a layer + OpacityMask for one shape).
        Rectangle {
            id: titleBar
            width: parent.width
            height: frame ? frame.titleBarHeight : defaultTitleBarHeight
            radius: windowRadius
            color: frame ? frame.colors.lighter_background : Qt.rgba(0, 0, 0, 1)
        }
        Rectangle {
            x: 0
            y: titleBar.height / 2
            width: parent.width
            height: titleBar.height / 2
            color: frame ? frame.colors.lighter_background : Qt.rgba(0, 0, 0, 1)
        }

        Text {
            anchors.centerIn: titleBar
            text: frame ? (frame.filename || frame.language || "snippet") : ""
            // filename/language come straight from the input JSON (ultimately
            // the selection's filename); without this, an HTML-looking
            // filename like "<b>x</b>.rs" renders as markup instead of text.
            textFormat: Text.PlainText
            color: frame ? frame.colors.foreground : Qt.rgba(0, 0, 0, 1)
            font.family: frame ? frame.fontFamily : "monospace"
            font.pixelSize: frame ? frame.fontSize : 13
        }

        // Gutter: right-aligned line numbers starting at 1, one per rendered
        // line (including the padded blank lines when lines < minLines).
        Column {
            id: gutterColumn
            x: frame ? frame.padding : 0
            y: frame ? frame.titleBarHeight + frame.padding : 0
            width: frame ? frame.gutterWidth - frame.charAdvance : 0
            spacing: 0
            Repeater {
                model: frame ? frame.renderedLineCount : 0
                delegate: Text {
                    required property int index
                    width: gutterColumn.width
                    height: frame.lineHeight
                    horizontalAlignment: Text.AlignRight
                    verticalAlignment: Text.AlignVCenter
                    text: String(index + 1)
                    color: frame.lineNumberColor
                    font.family: frame.fontFamily
                    font.pixelSize: frame.fontSize
                }
            }
        }

        // Code: a column of rows, each a row of styled spans.
        Column {
            id: codeColumn
            x: frame ? frame.padding + frame.gutterWidth : 0
            y: frame ? frame.titleBarHeight + frame.padding : 0
            width: frame ? parent.width - 2 * frame.padding - frame.gutterWidth : 0
            spacing: 0
            Repeater {
                model: frame ? frame.renderedLineCount : 0
                // A plain `Item`, not a `Row`, as the per-line delegate: a
                // `Row` whose only child `Text` has an empty string (a blank
                // source line) collapses to zero height in the parent
                // `Column` even with an explicit `height` set on the `Row`
                // itself (confirmed with a five-line repro — every blank
                // line vanished and the following lines shifted up to fill
                // the gap). `Item` does not have that behaviour.
                delegate: Item {
                    required property int index
                    width: codeColumn.width
                    height: frame.lineHeight
                    Row {
                        anchors.verticalCenter: parent.verticalCenter
                        Repeater {
                            model: index < frame.lines.length ? frame.lines[index] : []
                            delegate: Text {
                                required property var modelData
                                text: modelData.text
                                color: modelData.color
                                height: frame.lineHeight
                                verticalAlignment: Text.AlignVCenter
                                textFormat: Text.PlainText
                                font.family: frame.fontFamily
                                font.pixelSize: frame.fontSize
                                font.italic: modelData.fontStyle === "italic"
                                font.weight: modelData.fontWeight ? modelData.fontWeight : Font.Normal
                            }
                        }
                    }
                }
            }
        }
    }

    // --- 3. Omarchy mark, bottom-right, painted last -----------------------
    // On top of the window/shadow (not the backdrop layer just below them):
    // the shadow's `autoPaddingEnabled` spread can otherwise extend into
    // this corner and paint over it. Anchored *below* the window (not to the
    // canvas corner with the same `backdropPadding` the window itself is
    // inset by) because the mark, at this aspect ratio, is wider than
    // `backdropPadding` and would otherwise overlap the window rather than
    // sit beside it. The vendored SVG (assets/omarchy-logo.svg) is the
    // "omarchy" wordmark itself (seven letterform paths, no separate glyph
    // run), so there is no additional muted "omarchy" Text beside it.
    //
    // Recolouring uses `Qt5Compat.GraphicalEffects.ColorOverlay`, not
    // `QtQuick.Effects.MultiEffect`'s `colorization`: the SVG's paths are
    // solid black, and `MultiEffect.colorization` blends *toward* a tint by
    // multiplying the source's own luminance, so a zero-luminance (black)
    // source stays black at any `colorization` value (confirmed with a
    // three-line repro) — `ColorOverlay` replaces colour outright,
    // preserving only alpha, which is what a flat theme-coloured mark needs.
    Image {
        id: logoImage
        visible: false
        source: Qt.resolvedUrl("assets/omarchy-logo.svg")
        height: markHeight
        width: markHeight * logoAspectRatio
        sourceSize.height: markHeight * exportScale
        sourceSize.width: markHeight * exportScale * logoAspectRatio
        fillMode: Image.PreserveAspectFit
        anchors.top: win.bottom
        anchors.right: parent.right
        anchors.topMargin: markMargin
        anchors.rightMargin: markMargin
    }

    ColorOverlay {
        anchors.fill: logoImage
        source: logoImage
        color: frame ? frame.colors.accent : Qt.rgba(0, 0, 0, 1)
    }
}
