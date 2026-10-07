Viewport behavior

Zoom side panel:
- Maximum observed width: approximately 900px.
- The majority of in-meeting usage should be assumed to happen between narrow and 900px.
- The interface must be fully usable without requiring pop-out mode.

Pop-out:
- Can grow beyond 900px up to the available screen width.
- Wider layouts may be used when enough space exists.
- Pop-out should provide additional breathing room or additional columns, not unlock essential functionality.

Measured maximum side-panel size:
- MacBook Pro 14": 900 × 721, DPR 2, aspect ratio about 1.25
- 27" monitor: 900 × 896, DPR 1, aspect ratio about 1.00

Responsive structure:
- Narrow: <640px
- Medium: 640–900px
- Wide/pop-out: >900px
- Optional extra-wide behavior may be introduced for large pop-out windows.

Responsive principle:
- Width controls structural layout.
- Height controls density.
- Side-panel layouts are the primary design target.
- Pop-out layouts are progressive enhancements.