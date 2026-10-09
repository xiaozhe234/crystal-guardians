(function () {
  const G = window.G = window.G || {};

  G.TAU = Math.PI * 2;
  G.rand = (a, b) => a + Math.random() * (b - a);
  G.randint = (a, b) => Math.floor(G.rand(a, b + 1));
  G.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  G.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  G.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  G.nearestPlayer = function (game, x, y) {
    const list = game.players && game.players.length ? game.players : (game.player ? [game.player] : []);
    let best = null, bd = Infinity;
    for (const p of list) {
      if (p.dead) continue;
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  G.angle = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  G.wrapAngle = (a) => {
    let r = a % G.TAU;
    if (r > Math.PI) r -= G.TAU;
    if (r < -Math.PI) r += G.TAU;
    return r;
  };

  G.roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  G.text = function (ctx, str, x, y, size, color, align, bold) {
    ctx.font = (bold ? 'bold ' : '') + size + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  };

  G.drawBar = function (ctx, x, y, w, h, ratio, color, back) {
    ratio = G.clamp(ratio, 0, 1);
    ctx.fillStyle = back || 'rgba(0,0,0,0.55)';
    G.roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    if (ratio > 0.01) {
      ctx.fillStyle = color;
      G.roundRect(ctx, x + 1, y + 1, (w - 2) * ratio, h - 2, (h - 2) / 2); ctx.fill();
    }
  };
})();
