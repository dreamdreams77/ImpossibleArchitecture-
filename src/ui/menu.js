// Whether a menu view belongs on the quiet title-screen backdrop rather than over the editor.
// The pause menu always remains an overlay on the live game, even when it was opened
// after returning from the title screen.
export function isLandingMenuView(view, parent) {
  return view === 'title' || (view !== 'pause' && parent === 'title');
}
