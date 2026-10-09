(function () {
  const G = window.G;

  G.Weapon = function (def) {
    this.id = def.id; this.name = def.name; this.emoji = def.emoji; this.type = def.type;
    this.dmg = def.dmg; this.rate = def.rate; this.pellets = def.pellets || 1;
    this.spread = (def.spread || 0) * Math.PI / 180;
    this.bSpeed = def.bSpeed || 500; this.bSize = def.bSize || 3;
    this.energyCost = def.energyCost || 0; this.range = def.range || 0;
    this.color = def.color; this.price = def.price || 0; this.crit = def.crit || 0;
    this.pierce = def.pierce || 0; this.knock = def.knock || 0; this.aoe = def.aoe || 0;
    this.slow = def.slow || 0; this.burn = def.burn || 0; this.poison = def.poison || 0; this.arc = def.arc || 0;
    this.chargeTime = def.charge || 0;
    this.cd = 0; this.charge = 0; this.swingT = 0; this.swingHit = {};
  };

  G.Weapon.prototype.rateMult = function (player) {
    return player.fireRateMult * (player.fireBuffT > 0 ? 2 : 1);
  };

  G.Weapon.prototype.update = function (player, game, dt, holding, released, triggered) {
    const autofire = G.save.autofire || player.autofire;
    this.cd -= dt;
    if (this.swingT > 0) {
      this.swingT -= dt;
      this.updateSwing(player, game, dt);
    }
    if (this.type === 'melee') {
      if ((triggered || (autofire && holding)) && this.cd <= 0) {
        this.cd = 1 / (this.rate * this.rateMult(player));
        this.swingT = 0.28;
        this.swingHit = {};
        G.audio.play('swing');
      }
      return;
    }
    if (this.type === 'bow') {
      if (holding && this.cd <= 0) {
        this.charge = Math.min(1, this.charge + dt / (this.chargeTime / this.rateMult(player)));
        player.drawBowCharge = this.charge;
        if (released || (autofire && this.charge >= 1)) {
          this.fire(player, game, this.charge);
          this.charge = 0;
          player.drawBowCharge = 0;
          this.cd = 1 / (this.rate * this.rateMult(player));
        }
      } else if (!holding) {
        if (this.charge > 0) {
          this.fire(player, game, this.charge);
          this.charge = 0;
          player.drawBowCharge = 0;
          this.cd = 1 / (this.rate * this.rateMult(player));
        }
        player.drawBowCharge = 0;
      }
      return;
    }
    const auto = this.type === 'auto' || autofire;
    if (auto) {
      if (holding && this.cd <= 0) {
        this.cd = 1 / (this.rate * this.rateMult(player));
        this.fire(player, game, 1);
      }
    } else if (triggered && this.cd <= 0) {
      this.cd = 1 / (this.rate * this.rateMult(player));
      this.fire(player, game, 1);
    }
  };

  G.Weapon.prototype.fire = function (player, game, charge) {
    charge = charge || 1;
    const cost = game.infiniteEnergy ? 0 : this.energyCost;
    if (cost > 0 && player.energy < cost) { G.audio.play('dry'); return; }
    player.energy -= cost;
    const aim = player.aimAngle;
    const dmgBase = (this.type === 'bow' ? this.dmg + 10 * charge : this.dmg) * player.dmgMult;
    const critRoll = Math.random() * 100 < player.crit + this.crit;
    const dmg = dmgBase * (critRoll ? 2 : 1);
    for (let i = 0; i < this.pellets; i++) {
      const a = aim + G.rand(-this.spread, this.spread);
      const spd = this.bSpeed * (this.type === 'bow' ? 0.7 + 0.5 * charge : 1);
      const b = new G.Bullet({
        x: player.x + Math.cos(aim) * 18, y: player.y + Math.sin(aim) * 18,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        dmg: dmg, r: this.bSize, color: this.color, friendly: true, owner: player.netId || player.id || '',
        pierce: this.pierce, knock: this.knock, slow: this.slow, burn: this.burn, poison: this.poison, aoe: this.aoe, crit: critRoll
      });
      game.bullets.push(b);
    }
    player.recoil = Math.min(6, player.recoil + 2.5);
    G.audio.play(this.type === 'bow' ? 'bow' : 'shoot');
    if (cost > 0) G.FX.burst(player.x + Math.cos(aim) * 20, player.y + Math.sin(aim) * 20, this.color, 4, 90, 2);
  };

  G.Weapon.prototype.updateSwing = function (player, game, dt) {
    const dir = player.aimAngle;
    for (const e of game.enemies) {
      if (e.dead || this.swingHit[e.id] || e.spawnIn > 0) continue;
      const d = G.dist(player.x, player.y, e.x, e.y);
      if (d < this.range + e.r) {
        const da = Math.abs(G.wrapAngle(Math.atan2(e.y - player.y, e.x - player.x) - dir));
        if (da < this.arc / 2 || d < this.range * 0.45) {
          this.swingHit[e.id] = true;
          const crit = Math.random() * 100 < player.crit + this.crit;
          const swingDmg = this.dmg * player.dmgMult * (crit ? 2 : 1);
          e.takeDamage(swingDmg, game, { crit: crit });
          // 元晶守卫战：近战也触发穿甲弹减速 / 嗜血吸血
          if (G.Siege && G.Siege.onPlayerHit) G.Siege.onPlayerHit(e, swingDmg);
          e.knockback(this.knock || 100, Math.cos(dir), Math.sin(dir));
          G.FX.burst(e.x, e.y, this.color, 6, 150, 3);
        }
      }
    }
    for (const ob of game.room.obstacles) {
      if (!ob.dead && G.dist(player.x, player.y, ob.x, ob.y) < this.range + ob.r) {
        ob.dead = true;
        G.FX.burst(ob.x, ob.y, '#b98a5f', 8, 150, 3);
      }
    }
  };

  G.shopWeapons = function () {
    const pool = Object.keys(G.WEAPONS).map(k => G.WEAPONS[k]).filter(w => w.price >= 25);
    return G.shuffle(pool.slice()).slice(0, 4);
  };

  G.weaponStatLines = function (w) {
    const lines = [];
    const typeName = { pistol: '单发', auto: '自动连射', melee: '近战', bow: '蓄力弓' }[w.type] || '远程';
    lines.push('类型: ' + typeName);
    if (w.type === 'melee') {
      lines.push('伤害: ' + w.dmg + ' · 范围: ' + (w.range || 0));
      lines.push('攻速: ' + w.rate.toFixed(1) + '/秒');
    } else if (w.type === 'bow') {
      lines.push('伤害: ' + w.dmg + (w.pellets > 1 ? '×' + w.pellets : '') + ' · 蓄力 ' + (w.charge || 0.7) + 's');
    } else {
      lines.push('伤害: ' + w.dmg + (w.pellets > 1 ? '×' + w.pellets : '') + ' · 射速 ' + w.rate.toFixed(1) + '/秒');
    }
    lines.push('耗能: ' + (w.energyCost || 0) + '/发 · 暴击: ' + (w.crit || 0) + '%');
    const extra = [];
    if (w.burn) extra.push('灼烧');
    if (w.poison) extra.push('剧毒' + w.poison + 's');
    if (w.slow) extra.push('减速');
    if (w.aoe) extra.push('范围爆炸' + w.aoe);
    if (w.pierce) extra.push('穿透' + w.pierce + '目标');
    if (w.knock) extra.push('击退');
    if (w.bSpeed && w.type !== 'melee') extra.push('弹速' + w.bSpeed);
    if (extra.length) lines.push('特效: ' + extra.join(' / '));
    return lines;
  };
})();
