(function () {
  const G = window.G;
  G.FX = {
    parts: [], floats: [], lines: [], ambient: [], shake: 0, flash: 0,
    ambientTheme: 0, ambientRect: null, ambientSpawnT: 0,
    reset() {
      this.parts.length = 0; this.floats.length = 0; this.lines.length = 0;
      this.ambient.length = 0; this.ambientTheme = 0; this.ambientRect = null;
      this.shake = 0; this.flash = 0;
    },
    burst(x, y, color, n, spd, size) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * G.TAU, s = G.rand(spd * 0.3, spd);
        this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: G.rand(size * 0.5, size * 1.3), color, t: G.rand(0.25, 0.5), max: 0.5 });
      }
    },
    lightning(x1, y1, x2, y2, color) {
      this.lines.push({ x1, y1, x2, y2, color, t: 0.16, max: 0.16 });
    },
    float(x, y, str, color, size) {
      this.floats.push({ x: x + G.rand(-6, 6), y, str, color, size: size || 15, t: 0.9, max: 0.9 });
    },
    addShake(n) { this.shake = Math.min(20, this.shake + n); },
    addFlash(n) { this.flash = Math.min(1, this.flash + (n || 0.3)); },
    update(dt) {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i]; p.t -= dt;
        if (p.t <= 0) { this.parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9;
      }
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i]; f.t -= dt; f.y -= 30 * dt;
        if (f.t <= 0) this.floats.splice(i, 1);
      }
      for (let i = this.lines.length - 1; i >= 0; i--) {
        const l = this.lines[i]; l.t -= dt;
        if (l.t <= 0) this.lines.splice(i, 1);
      }
      this.shake = Math.max(0, this.shake - 30 * dt);
      this.flash = Math.max(0, this.flash - 2.5 * dt);
    },
    draw(ctx) {
      ctx.save();
      if (this.shake > 0) ctx.translate(G.rand(-this.shake, this.shake), G.rand(-this.shake, this.shake));
      for (const l of this.lines) {
        ctx.strokeStyle = l.color;
        ctx.globalAlpha = G.clamp(l.t / l.max, 0, 1);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(l.x1, l.y1);
        const mx = (l.x1 + l.x2) / 2 + G.rand(-24, 24), my = (l.y1 + l.y2) / 2 + G.rand(-24, 24);
        ctx.lineTo(mx, my); ctx.lineTo(l.x2, l.y2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const p of this.parts) {
        ctx.globalAlpha = G.clamp(p.t / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, G.TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const f of this.floats) {
        ctx.globalAlpha = G.clamp(f.t / f.max, 0, 1);
        G.text(ctx, f.str, f.x, f.y, f.size, f.color, 'center', true);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },
    initAmbient(theme, room) {
      this.ambientTheme = theme;
      this.ambientRect = room;
      this.ambient.length = 0;
      this.ambientSpawnT = 0;
    },
    updateAmbient(dt) {
      if (!this.ambientRect) return;
      const r = this.ambientRect;
      this.ambientSpawnT -= dt;
      // 每帧生成粒子
      if (this.ambientSpawnT <= 0) {
        const theme = this.ambientTheme;
        const rate = theme === 1 ? 0.06 : theme === 2 ? 0.08 : 0.1;
        this.ambientSpawnT = rate;
        const count = theme === 2 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const x = r.x + G.rand(0, r.w);
          const y = theme === 2 ? r.y - 10 : r.y + r.h + 10;
          let p;
          if (theme === 1) {
            // 外层：绿色孢子向上飘
            p = { x, y, vx: G.rand(-8, 8), vy: G.rand(-30, -15), r: G.rand(1.5, 3.5),
              color: G.rand(0, 1) < 0.5 ? '#4ade80' : '#a3e635', t: G.rand(2, 4), max: 4, glow: true };
          } else if (theme === 2) {
            // 中层：雪花飘落
            p = { x, y, vx: G.rand(-5, 5), vy: G.rand(15, 35), r: G.rand(1, 3),
              color: '#e0f2fe', t: G.rand(3, 6), max: 6, glow: true };
          } else {
            // 核心：黑色灰烬
            p = { x, y, vx: G.rand(-15, 15), vy: G.rand(-25, -5), r: G.rand(1, 3),
              color: G.rand(0, 1) < 0.5 ? '#1c1917' : '#292524', t: G.rand(1.5, 3.5), max: 3.5, glow: false };
          }
          this.ambient.push(p);
        }
      }
      // 更新粒子
      for (let i = this.ambient.length - 1; i >= 0; i--) {
        const p = this.ambient[i];
        p.t -= dt;
        if (p.t <= 0) { this.ambient.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (this.ambientTheme === 3) {
          p.vx += G.rand(-30, 30) * dt;
          p.vy += G.rand(-30, 30) * dt;
        }
        if (p.x < r.x - 30 || p.x > r.x + r.w + 30 || p.y < r.y - 30 || p.y > r.y + r.h + 30) {
          this.ambient.splice(i, 1);
        }
      }
    },
    drawAmbient(ctx) {
      for (const p of this.ambient) {
        const alpha = G.clamp(p.t / p.max, 0, 1) * (p.glow ? 0.7 : 0.5);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, G.TAU); ctx.fill();
        if (p.glow) {
          ctx.globalAlpha = alpha * 0.3;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.5, 0, G.TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  };
})();
