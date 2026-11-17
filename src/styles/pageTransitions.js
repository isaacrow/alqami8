// Runs in the <head> of every page (injected by vite.config.ts), before the page draws: decides how this page change
// should look and hands it to the next page. See pageTransitions.css for the looks.
//  - From the home grid (navigateFrom in viewTransition.ts): "open", and the new page takes over the icon's name, so
//    the icon grows into it.
//  - Character to character: "next" or "prev", by their order in the switcher.
//  - Back to the home page: "to-home", the page shrinks into the middle.
(function () {
  if (!('onpagereveal' in window)) return;
  var S = window.sessionStorage;
  var K = 'alqami-vt';
  var CHARS = ['jawahiri.html', 'mutanabbi.html', 'waili.html'];
  function page(u) {
    var p = String(u || '').split(/[?#]/)[0].split('/').pop();
    return p && p !== 'index.html' ? p : '';
  }
  function get(k) {
    try { return S.getItem(k); } catch (e) { return null; }
  }
  function set(k, v) {
    try { v == null ? S.removeItem(k) : S.setItem(k, v); } catch (e) { /* private mode */ }
  }
  // Where a tapped link goes (for browsers whose pageswap does not say).
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && a.origin === location.origin) set(K + '-dest', page(a.href));
  }, true);

  window.addEventListener('pageswap', function (e) {
    if (!e.viewTransition) return;
    var dest = e.activation && e.activation.entry ? page(e.activation.entry.url) : get(K + '-dest');
    set(K + '-dest', null);
    if (dest == null) return;
    var here = page(location.href);
    var a = CHARS.indexOf(here);
    var b = CHARS.indexOf(dest);
    var type = get(K);
    if (a >= 0 && b >= 0 && a !== b) type = b > a ? 'next' : 'prev';
    else if (dest === '' && here) {
      type = 'to-home';
      document.body.style.viewTransitionName = 'app-morph';
    }
    set(K, type);
    if (type && e.viewTransition.types) e.viewTransition.types.add(type);
  });

  window.addEventListener('pagereveal', function (e) {
    var type = get(K);
    set(K, null);
    if (!e.viewTransition || !type) return;
    if (e.viewTransition.types) e.viewTransition.types.add(type);
    if (type === 'open') {
      document.body.style.viewTransitionName = 'app-morph';
      e.viewTransition.finished.finally(function () {
        document.body.style.viewTransitionName = '';
      });
    }
  });
})();
