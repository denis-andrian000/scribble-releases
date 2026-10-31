// The web page's buddy (page-buddy.html, in a small frame in the corner) talks to the page through this.
window.scribble = (parent && parent.__buddyApi) || { getAvatar: async () => null, onAvatar() {}, onState() {}, onPanel() {}, onMotion() {}, onLand() {}, onCursor() {}, onTyping() {}, onEdge() {}, dragStart() {}, dragEnd() {}, menu() {}, click() {}, walk: async () => ({ dx: 0 }) };
