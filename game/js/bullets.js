(function () {
  const G = window.G;

  G.Bullet = function (o) {
    this.id = (G.bulletSeq = (G.bulletSeq || 0) + 1);
    this.x = o.x; this.y = o.y; this.vx = o.vx; this.vy = o.vy;
    this.dmg = o.dmg; this.r = o.r || 3; this.color = o.color || '#ffe08a';
    this.friendly = !!o.friendly; this.owner = o.owner || ''; this.life = o.life || 2.6;
    this.pierce = o.pierce || 0; this.knock = o.knock || 0;
    this.slow = o.slow || 0; this.burn = o.burn || 0; this.aoe = o.aoe || 0;
    this.poison = o.poison || 0; this.gravity = o.gravity || 0;
    this.lifesteal = o.lifesteal || 0; this.ownerId = o.ownerId || 0;
    this.crit = !!o.crit; this.hit = {}; this.dead = false;
  };

  // 扫掠检测：子弹在本帧移动前后连成线段，与障碍物圆形做线段-圆相交测试。
  // 覆盖两种此前漏检：贴脸射击时子弹出生点（玩家前 18px）已在障碍物碰撞圆内，
  // 仅终点检测会在第一步后放行导致穿箱；以及高速子弹在 30Hz 大步长下"跳过"
  // 薄障碍物（隧道效应）。命中返回最近接触点，未命中返回 null。
  G.segmentHitsObstacle = function (x0, y0, x1, y1, ob, br) {
    const R = ob.r + br;
    const ex = x1 - x0, ey = y1 - y0;
    let t = 0;
    const ex2 = ex * ex + ey * ey;
    if (ex2 > 0) t = Math.max(0, Math.min(1, ((ob.x - x0) * ex + (ob.y - y0) * ey) / ex2));
    const cx = x0 + ex * t, cy = y0 + ey * t;
    if ((cx - ob.x) * (cx - ob.x) + (cy - ob.y) * (cy - ob.y) >= R * R) return null;
    return { x: cx, y: cy };
  };

  G.Bullet.prototype.update = function (game, dt) {
    const px = this.x, py = this.y;
    if (this.gravity) this.vy += this.gravity * dt;
    this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt;
    const r = game.room;
    if (this.life <= 0 || this.x < r.x - 20 || this.x > r.x + r.w + 20 || this.y < r.y - 20 || this.y > r.y + r.h + 20) {
      this.dead = true; return;
    }
    for (const ob of r.obstacles) {
      if (ob.dead) continue;
      const hit = G.segmentHitsObstacle(px, py, this.x, this.y, ob, this.r);
      if (hit) {
        if (this.friendly) {
          ob.hp -= this.dmg;
          G.FX.burst(hit.x, hit.y, '#b98a5f', 5, 120, 3);
          if (ob.hp <= 0) ob.dead = true;
        }
        this.dead = true; return;
      }
    }
    if (this.friendly) {
      for (const e of game.enemies) {
        if (e.dead || this.hit[e.id] || e.spawnIn > 0) continue;
        const hit = G.segmentHitsObstacle(px, py, this.x, this.y, e, this.r);
        if (hit) {
          this.hit[e.id] = true;
          e.takeDamage(this.dmg, game, { crit: this.crit });
          if (this.knock) e.knockback(this.knock, this.vx, this.vy);
          if (this.slow) e.slowT = Math.max(e.slowT, 2);
          if (this.burn) e.burnT = Math.max(e.burnT, 3);
          if (this.poison) e.poisonT = Math.max(e.poisonT || 0, this.poison);
          // 元晶守卫战增益：穿甲弹 / 嗜血
          const sb = game && game.waveBuffs;
          let apHit = false;
          if (sb) {
            if (sb.indexOf('armor_pierce') >= 0 && (e.elite || e.boss)) {
              apHit = true;
              e.slowT = Math.max(e.slowT || 0, 1);
              e.empSlow = 0.3;
              this.apPierce = (this.apPierce || 0) + 1;
            }
            if (sb.indexOf('lifesteal') >= 0 && G.Siege) G.Siege.onPlayerHit(e, this.dmg);
          }
          if (this.aoe > 0) {
            G.FX.burst(hit.x, hit.y, '#fbbf24', 14, 240, 4);
            G.FX.addShake(4);
            G.audio.play('boom');
            for (const e2 of game.enemies) {
              if (e2.dead || e2.spawnIn > 0) continue;
              if (G.dist(hit.x, hit.y, e2.x, e2.y) < this.aoe + e2.r) e2.takeDamage(this.dmg * 0.8, game, { crit: false });
            }
            for (const ob of r.obstacles) {
              if (!ob.dead && G.dist(hit.x, hit.y, ob.x, ob.y) < this.aoe + ob.r) ob.dead = true;
            }
          }
          if (apHit) {
            if (this.apPierce > 2) this.dead = true; // 穿甲弹：最多额外穿透2个精英/Boss
          } else if (this.pierce > 0) {
            this.pierce--;
          } else {
            this.dead = true;
          }
          if (this.dead) break;
        }
      }
    } else {
      const plist = game.players && game.players.length ? game.players : [game.player];
      for (const pl of plist) {
        if (pl.dead || pl.invuln > 0) continue;
        if (G.dist(this.x, this.y, pl.x, pl.y) < pl.r + this.r) {
          // 元晶守卫战·掩体模式：站在晶防装置120px内时远程伤害-80%
          let pDmg = this.dmg;
          if (game && game.waveBuffs && game.waveBuffs.indexOf('cover') >= 0 && G.Siege) {
            pDmg = G.Siege.coverReduce(pl, pDmg);
          }
          pl.takeDamage(pDmg, game);
          // 子弹减速效果
          if (this.slow) pl.slowT = Math.max(pl.slowT || 0, this.slow);
          // 残虚术者吸血：子弹命中玩家时恢复敌人HP
          if (this.lifesteal && this.ownerId) {
            for (const e of game.enemies) {
              if (e.dead || e.id !== this.ownerId) continue;
              e.hp = Math.min(e.maxHp, e.hp + this.lifesteal);
              break;
            }
          }
          this.dead = true;
          break;
        }
      }
    }
  };
})();
