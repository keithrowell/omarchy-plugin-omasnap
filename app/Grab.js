.pragma library

// The one place that computes a grabToImage() target size, shared by
// Main.qml's render mode and Preview.qml's Copy/Save actions.
//
// `grabToImage`'s `targetSize` is scaled again by the window's actual
// on-screen (Hyprland) scale before rasterising — Qt's own
// `Screen.devicePixelRatio` under-reports it (rounds 1.6 up to 2), so a
// plain `width * scale` target came out at `scale * 1.6`, not `scale`, on
// the monitor this was found on (see spec 0004's plan and Main.qml's render
// mode). Dividing the target by Hyprland's own reported scale for the
// screen the window is on cancels that out. Plain JS, no Qt: callers wrap
// the result in `Qt.size(...)` themselves.
function exportSize(item, scale, screenScale) {
    const s = screenScale && screenScale > 0 ? screenScale : 1;
    return { width: item.width * scale / s, height: item.height * scale / s };
}
