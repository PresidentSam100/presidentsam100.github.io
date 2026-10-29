/* =====================================================================
   Potting Shed: the art, shared by the game (game.js) and the shed editor
   (editor.js). Each draws one cell's worth on a 2-D canvas context g, its
   top left at x, y and s across: the brick floor, a bench, a patch of sun,
   a pot (with its flower as far open as `bloom`), the gardener.
   ===================================================================== */
(function () {
  "use strict";

  // herringbone: two bricks a cell, turned by the cell's place (k, in a shed w cells across)
  function brick(g, x, y, s, k, w) {
    g.fillStyle = (Math.floor(k / w) + k) % 2 ? "#b8673f" : "#b05f39";
    g.fillRect(x, y, s, s);
    g.strokeStyle = "rgba(70, 30, 15, 0.35)"; g.lineWidth = 1;
    g.beginPath();
    if ((k + Math.floor(k / w)) % 2) { g.moveTo(x, y + s / 2 + 0.5); g.lineTo(x + s, y + s / 2 + 0.5); g.moveTo(x + s / 2 + 0.5, y); g.lineTo(x + s / 2 + 0.5, y + s / 2); }
    else { g.moveTo(x + s / 2 + 0.5, y); g.lineTo(x + s / 2 + 0.5, y + s); g.moveTo(x + s / 2, y + s / 2 + 0.5); g.lineTo(x + s, y + s / 2 + 0.5); }
    g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    g.stroke();
  }
  function bench(g, x, y, s) {
    g.fillStyle = "#6e4a2c"; g.fillRect(x, y, s, s);
    g.fillStyle = "#83593a";
    for (var i = 0; i < 3; i++) g.fillRect(x + 2, y + 2 + i * (s / 3), s - 4, s / 3 - 4);
    g.fillStyle = "rgba(40, 24, 10, 0.35)"; g.fillRect(x, y + s - 4, s, 4);
  }
  function sun(g, x, y, s) {
    var gr = g.createRadialGradient(x + s / 2, y + s / 2, 2, x + s / 2, y + s / 2, s * 0.7);
    gr.addColorStop(0, "rgba(255, 238, 160, 0.95)"); gr.addColorStop(1, "rgba(255, 214, 110, 0.15)");
    g.fillStyle = gr; g.fillRect(x + 2, y + 2, s - 4, s - 4);
    g.strokeStyle = "rgba(255, 246, 200, 0.9)"; g.lineWidth = 2;
    g.strokeRect(x + 4, y + 4, s - 8, s - 8);
  }
  // bloom: how far its flower is open (0 none, 1 full): opening in the sun, closing out of it
  function pot(g, x, y, s, bloom) {
    var c = x + s / 2, top = y + s * 0.3, bot = y + s * 0.88;
    // its shadow, the pot, its rim
    g.fillStyle = "rgba(60, 25, 10, 0.3)"; g.beginPath(); g.ellipse(c, bot, s * 0.3, s * 0.08, 0, 0, 7); g.fill();
    g.fillStyle = "#c9663d";
    g.beginPath(); g.moveTo(c - s * 0.3, top); g.lineTo(c + s * 0.3, top); g.lineTo(c + s * 0.22, bot); g.lineTo(c - s * 0.22, bot); g.closePath(); g.fill();
    g.fillStyle = "#df7c4f"; g.fillRect(c - s * 0.34, top - s * 0.08, s * 0.68, s * 0.12);
    g.strokeStyle = "#7a3416"; g.lineWidth = 1.5; g.strokeRect(c - s * 0.34, top - s * 0.08, s * 0.68, s * 0.12);
    // the seedling, and in the sun its flower
    g.strokeStyle = "#3f7a2c"; g.lineWidth = Math.max(2, s * 0.05);
    g.beginPath(); g.moveTo(c, top - s * 0.08); g.lineTo(c, top - s * 0.28); g.stroke();
    g.fillStyle = "#5c9a3a";
    g.beginPath(); g.ellipse(c - s * 0.09, top - s * 0.2, s * 0.09, s * 0.045, -0.5, 0, 7); g.fill();
    g.beginPath(); g.ellipse(c + s * 0.09, top - s * 0.24, s * 0.09, s * 0.045, 0.5, 0, 7); g.fill();
    if (bloom > 0) {
      var r = s * 0.12 * Math.min(1, bloom);
      g.fillStyle = "#f2c230";
      for (var i = 0; i < 5; i++) { var a = i * Math.PI * 2 / 5; g.beginPath(); g.arc(c + Math.cos(a) * r, top - s * 0.32 + Math.sin(a) * r, r * 0.75, 0, 7); g.fill(); }
      g.fillStyle = "#8a4a12"; g.beginPath(); g.arc(c, top - s * 0.32, r * 0.6, 0, 7); g.fill();
    }
  }
  // facing: the way it last went (-1 left, 1 right), where its eyes look
  function gardener(g, x, y, s, facing) {
    var c = x + s / 2, m = y + s / 2;
    g.fillStyle = "rgba(60, 25, 10, 0.28)"; g.beginPath(); g.ellipse(c, y + s * 0.86, s * 0.26, s * 0.08, 0, 0, 7); g.fill();
    // apron and shirt
    g.fillStyle = "#3f6b8a"; g.beginPath(); g.ellipse(c, m + s * 0.12, s * 0.26, s * 0.3, 0, 0, 7); g.fill();
    g.fillStyle = "#a9c1a0"; g.fillRect(c - s * 0.13, m, s * 0.26, s * 0.36);
    // head and a wide straw hat
    g.fillStyle = "#f0c9a4"; g.beginPath(); g.arc(c, m - s * 0.16, s * 0.14, 0, 7); g.fill();
    g.fillStyle = "#e3c06a"; g.beginPath(); g.ellipse(c, m - s * 0.24, s * 0.3, s * 0.09, 0, 0, 7); g.fill();
    g.fillStyle = "#d4ac4f"; g.beginPath(); g.ellipse(c, m - s * 0.3, s * 0.14, s * 0.1, 0, 0, 7); g.fill();
    g.fillStyle = "#b5402f"; g.fillRect(c - s * 0.14, m - s * 0.27, s * 0.28, s * 0.04);
    // eyes, looking the way it last went
    g.fillStyle = "#2a1a10"; g.beginPath(); g.arc(c - s * 0.04 + facing * s * 0.025, m - s * 0.15, s * 0.018, 0, 7); g.arc(c + s * 0.04 + facing * s * 0.025, m - s * 0.15, s * 0.018, 0, 7); g.fill();
  }

  window.PottingShedArt = { brick: brick, bench: bench, sun: sun, pot: pot, gardener: gardener };
})();
