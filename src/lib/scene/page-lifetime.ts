// A cached, disposed page must reload on restoration. Keep this callback outside
// the owner's closure so the history entry does not retain its scene/artifact.
function reloadRestoredPage(event: PageTransitionEvent) {
  if (event.persisted) window.location.reload();
}

/** Watch navigation as well as component unmount; detach before invoking cleanup. */
export function onPageExit(cleanup: () => void): () => void {
  const detach = () => window.removeEventListener('pagehide', hidden);
  const hidden = (event: PageTransitionEvent) => {
    detach();
    cleanup();
    if (event.persisted) window.addEventListener('pageshow', reloadRestoredPage, { once: true });
  };
  window.addEventListener('pagehide', hidden);
  return detach;
}
