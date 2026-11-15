// "Sam Lu's PC": an icon on the teal desktop, top left like My Computer,
// where the open windows leave that corner of the desktop clear (a laptop,
// a phone on its side). Where they don't (an upright phone, a board as wide
// as the window), it sits after the windows at the foot of the page in the
// small-icons view, its 16px picture beside its name. It's decoration: not a
// link, nothing happens on a click. Placed again whenever a window changes
// size (a new level, a resize) and once the lettering has come.
(function () {
  "use strict";
  var icon = document.getElementById("deskIcon");
  if (!icon) return;
  var GAP = 8;
  var others = function () { return document.querySelectorAll(".wrap > .window, .nav-back-games, .gs-corner > *"); };
  function place() {
    icon.classList.add("on-desk");
    var r = icon.getBoundingClientRect(), y = window.scrollY || 0, W = document.documentElement.clientWidth;
    var t = r.top + y, b = r.bottom + y;
    var clash = r.right + GAP > W || [].some.call(others(), function (el) {
      var q = el.getBoundingClientRect();
      if (!q.width || !q.height) return false;
      // (the corner buttons are fixed to the window, the windows scroll with the page)
      var fixed = !el.closest(".wrap"), qt = q.top + (fixed ? 0 : y), qb = q.bottom + (fixed ? 0 : y);
      return q.left < r.right + GAP && q.right > r.left - GAP && qt < b + GAP && qb > t - GAP;
    });
    if (clash) icon.classList.remove("on-desk");
  }
  place();
  window.addEventListener("resize", place);
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(place);
    [].forEach.call(document.querySelectorAll(".wrap > .window"), function (el) { ro.observe(el); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
})();
