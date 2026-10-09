(function () {
  const G = window.G;

  G.Player = function (c) {
    this.character = c;
    this.name = c.name; this.emoji = c.emoji; this.color = c.color;
    this.maxHp = c.base.hp; this.hp = c.base.hp;
    this.maxArmor = c.base.armor; this.armor = c.base.armor;
    this.maxEnergy = c.base.energy; this.energy = c.base.energy;
    this.crit = c.base.crit; this.speed = c.base.speed; this.energyRegen = c.base.regen;
    this.dmgMult = 1; this.fireRateMult = 1; this.moveMult = 1;
    this.r = 14; this.x = 0; this.y = 0;
    this.aimAngle = 0;
    this.weapons = [new G.Weapon(G.WEAPONS.pistol)];
    this.cur = 0;
    this.skill = Object.assign({ cdLeft: 0 }, c.skill);
    this.invuln = 0; this.dashT = 0; this.dashDx = 0; this.dashDy = 0; this.fireBuffT = 0;
    this.healOverT = 0; this.healPerSec = 0; this.recoil = 0;
    this.coins = 0;
    this.petDmg = 2; this.drawBowCharge = 0;
    this.petRate = 1;  // 宠物攻击间隔倍率（永久强化可缩短）
    this.pet = { x: 0, y: 0, t: 0 };
    this.magnetRange = 60;    // 默认吸附范围（px）
    this.magnetMult = 1;       // 吸附倍率（晶悟可翻倍）
    this.armorRecoverDelay = 0; // 护甲恢复倒计时（5s不受伤害后开始恢复）
    this.dead = false;
  };

  G.Player.prototype.weapon = function () { return this.weapons[this.cur]; };

  G.Player.prototype.equip = function (weapon) {
    if (this.weapons.length < 2) this.weapons.push(weapon);
    else this.weapons[this.cur] = weapon;
  };

  G.Player.prototype.switchWeapon = function () {
    if (this.weapons.length < 2) return;
    this.cur = (this.cur + 1) % this.weapons.length;
    G.audio.play('switch');
  };

  G.Player.prototype.update = function (game, dt, input) {
    const k = (input && input.keys) ? input.keys : G.keys;
    const m = (input && input.mouse) ? input.mouse : null;
    const p = this;
    // 玩家眩晕：无法移动和操作
    p.stunT = Math.max(0, (p.stunT || 0) - dt);
    if (p.stunT > 0) {
      // 眩晕期间不能移动，但其他状态仍更新
      p.aimAngle = m ? Math.atan2(m.worldY - p.y, m.worldX - p.x) : p.aimAngle || 0;
      p.invuln = Math.max(0, p.invuln - dt);
      p.dashT = Math.max(0, p.dashT - dt);
      p.fireBuffT = Math.max(0, p.fireBuffT - dt);
      p.recoil = Math.max(0, p.recoil - 40 * dt);
      if (p.armor < p.maxArmor) {
        p.armorRecoverDelay -= dt;
        if (p.armorRecoverDelay <= 0) p.armor = Math.min(p.maxArmor, p.armor + 1 * dt);
      } else { p.armorRecoverDelay = 5; }
      if (p.healOverT > 0) { p.healOverT -= dt; p.hp = Math.min(p.maxHp, p.hp + p.healPerSec * dt); }
      p.skill.cdLeft = Math.max(0, p.skill.cdLeft - dt);
      p.updatePet(game, dt);
      return;
    }
    let dx = 0, dy = 0;
    // 凝霜蚀兽减速光环
    p.slowAuraMult = 1;
    for (const e of game.enemies) {
      if (e.dead || e.type !== 'ice_beast') continue;
      if (G.dist(p.x, p.y, e.x, e.y) < 120 + p.r) { p.slowAuraMult = 0.8; break; }
    }
    // 子弹减速效果
    p.slowT = Math.max(0, (p.slowT || 0) - dt);
    const slowMult = (p.slowT > 0 ? 0.8 : 1) * p.slowAuraMult;
    if (p.dashT > 0) {
      dx = p.dashDx; dy = p.dashDy;
    } else {
      if (k['w'] || k['arrowup']) dy -= 1;
      if (k['s'] || k['arrowdown']) dy += 1;
      if (k['a'] || k['arrowleft']) dx -= 1;
      if (k['d'] || k['arrowright']) dx += 1;
    }
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }
    const spd = p.speed * p.moveMult * slowMult * (p.dashT > 0 ? 3.2 : 1);
    // 被击退的力
    p.kx = (p.kx || 0) * Math.max(0, 1 - 10 * dt);
    p.ky = (p.ky || 0) * Math.max(0, 1 - 10 * dt);
    p.x += dx * spd * dt + (p.kx || 0) * dt;
    p.y += dy * spd * dt + (p.ky || 0) * dt;
    const r = game.room;
    p.x = G.clamp(p.x, r.x + 16, r.x + r.w - 16);
    p.y = G.clamp(p.y, r.y + 16, r.y + r.h - 16);
    for (const ob of r.obstacles) {
      if (ob.dead) continue;
      const d = G.dist(p.x, p.y, ob.x, ob.y), min = p.r + ob.r;
      if (d < min && d > 0) {
        p.x += (p.x - ob.x) / d * (min - d);
        p.y += (p.y - ob.y) / d * (min - d);
      }
    }
    // 火径/地面火焰碰撞
    p.fireTrailCd = Math.max(0, (p.fireTrailCd || 0) - dt);
    if (game.fireTrails && game.fireTrails.length > 0 && p.fireTrailCd <= 0 && p.invuln <= 0) {
      for (const ft of game.fireTrails) {
        if (G.dist(p.x, p.y, ft.x, ft.y) < ft.r + p.r) {
          p.takeDamage(ft.dmg, game);
          p.burnT = Math.max(p.burnT || 0, 2);
          p.fireTrailCd = 0.5;
          break;
        }
      }
    }
    p.aimAngle = m ? Math.atan2(m.worldY - p.y, m.worldX - p.x) : Math.atan2((G.mouse.y + game.cam.y) - p.y, (G.mouse.x + game.cam.x) - p.x);
    p.invuln = Math.max(0, p.invuln - dt);
    p.dashT = Math.max(0, p.dashT - dt);
    p.fireBuffT = Math.max(0, p.fireBuffT - dt);
    p.recoil = Math.max(0, p.recoil - 40 * dt);
    // 灼烧持续伤害
    p.burnT = Math.max(0, (p.burnT || 0) - dt);
    if (p.burnT > 0) {
      p.burnTick = (p.burnTick || 0) + dt;
      while (p.burnTick >= 0.5) {
        p.burnTick -= 0.5;
        p.hp -= 2;
        G.FX.burst(p.x, p.y, '#fb923c', 3, 80, 2);
        if (p.hp <= 0) { p.dead = true; return; }
      }
    }
    // 护甲自动恢复：受伤后 5s 开始，每秒恢复 1 护甲（受击重置计时）
    if (p.armor < p.maxArmor) {
      p.armorRecoverDelay -= dt;
      if (p.armorRecoverDelay <= 0) {
        p.armor = Math.min(p.maxArmor, p.armor + 1 * dt);
      }
    } else {
      p.armorRecoverDelay = 5;
    }
    if (p.healOverT > 0) {
      p.healOverT -= dt;
      p.hp = Math.min(p.maxHp, p.hp + p.healPerSec * dt);
    }
    p.skill.cdLeft = Math.max(0, p.skill.cdLeft - dt);
    const w = p.weapon();
    if (w) w.update(p, game, dt, m ? m.down : G.mouse.down, m ? m.released : G.mouse.released, m ? m.triggered : G.mouse.triggered);
    p.updatePet(game, dt);
    G.roomTransition(game, p);
  };

  G.Player.prototype.updatePet = function (game, dt) {
    const pet = this.pet;
    const tx = this.x - Math.cos(this.aimAngle) * 34, ty = this.y - Math.sin(this.aimAngle) * 34;
    pet.x += (tx - pet.x) * Math.min(1, 8 * dt);
    pet.y += (ty - pet.y) * Math.min(1, 8 * dt);
    pet.t -= dt;
    if (pet.t <= 0) {
      pet.t = 1.6 * (this.petRate || 1);
      let best = null, bd = 380 * 380;
      for (const e of game.enemies) {
        if (e.dead || e.spawnIn > 0) continue;
        const d = (e.x - pet.x) * (e.x - pet.x) + (e.y - pet.y) * (e.y - pet.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const a = Math.atan2(best.y - pet.y, best.x - pet.x);
        game.bullets.push(new G.Bullet({
          x: pet.x, y: pet.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420,
          dmg: this.petDmg, r: 3, color: '#f9a8d4', friendly: true
        }));
        // 联机模式（玩家带 netId）：宠物音效从玩家位置播报，会与玩家自身开火
        // 混成"一次点击两次枪响"，故静音（宠物仍正常开火，子弹可见）。
        if (!this.netId) G.audio.play('shoot');
      }
    }
  };

  G.Player.prototype.takeDamage = function (dmg, game) {
    if (this.invuln > 0 || this.dead) return;
    this.armorRecoverDelay = 5;  // 受击重置护甲恢复计时
    let d = dmg;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, d);
      this.armor -= absorbed;
      d -= absorbed;
    }
    if (d > 0) this.hp -= d;
    G.FX.addShake(5);
    G.FX.burst(this.x, this.y, '#f87171', 8, 160, 3);
    G.FX.float(this.x, this.y - 22, '-' + Math.round(dmg), '#f87171', 16);
    G.audio.play('hurt');
    this.invuln = 0.5;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      G.FX.burst(this.x, this.y, this.color, 20, 240, 5);
      G.FX.addShake(10);
    }
  };

  G.Player.prototype.useSkill = function (game, keys) {
    const s = this.skill;
    if (s.cdLeft > 0 || this.dead) return;
    const cost = game.infiniteEnergy ? 0 : s.cost;
    if (this.energy < cost) { G.audio.play('dry'); return; }
    this.energy -= cost;
    s.cdLeft = s.cd;
    G.audio.play('skill');
    switch (s.id) {
      case 'fury':
        this.fireBuffT = 4;
        G.FX.float(this.x, this.y - 30, '晶核过载!', '#ffd54f', 18);
        break;
      case 'roll': {
        const rk = keys || G.keys;
        let dx = 0, dy = 0;
        if (rk['w'] || rk['arrowup']) dy -= 1;
        if (rk['s'] || rk['arrowdown']) dy += 1;
        if (rk['a'] || rk['arrowleft']) dx -= 1;
        if (rk['d'] || rk['arrowright']) dx += 1;
        if (!dx && !dy) { dx = Math.cos(this.aimAngle); dy = Math.sin(this.aimAngle); }
        const len = Math.hypot(dx, dy) || 1;
        this.dashT = 0.22;
        this.invuln = Math.max(this.invuln, 0.5);
        this.dashDx = dx / len; this.dashDy = dy / len;
        G.FX.burst(this.x, this.y, '#7dd3fc', 10, 180, 3);
        break;
      }
      case 'zap': {
        const targets = game.enemies
          .filter(e => !e.dead && e.spawnIn <= 0 && G.dist(this.x, this.y, e.x, e.y) < 520)
          .sort((a, b) => G.dist(this.x, this.y, a.x, a.y) - G.dist(this.x, this.y, b.x, b.y))
          .slice(0, 3);
        for (const t of targets) {
          t.takeDamage(10 * (1 + this.dmgMult * 0.5), game, { crit: false });
          G.FX.lightning(this.x, this.y, t.x, t.y, '#a78bfa');
          G.FX.burst(t.x, t.y, '#a78bfa', 8, 140, 3);
        }
        break;
      }
      case 'heal':
        this.healOverT = 3;
        this.healPerSec = 2;
        G.FX.float(this.x, this.y - 30, '治疗!', '#4ade80', 18);
        break;
      case 'turret': {
        const t = {
          x: this.x + Math.cos(this.aimAngle) * 30, y: this.y + Math.sin(this.aimAngle) * 30,
          hp: 30, r: 15, t: 0, life: 12, dmg: 4
        };
        game.allies.push(t);
        G.FX.burst(this.x, this.y, '#fb923c', 10, 160, 3);
        break;
      }
      case 'dash': {
        const a = this.aimAngle;
        this.dashT = 0.18;
        this.invuln = Math.max(this.invuln, 0.35);
        this.dashDx = Math.cos(a); this.dashDy = Math.sin(a);
        for (const e of game.enemies) {
          if (e.dead || e.spawnIn > 0) continue;
          const d = G.dist(this.x, this.y, e.x, e.y);
          if (d < 260 && Math.abs(G.wrapAngle(Math.atan2(e.y - this.y, e.x - this.x) - a)) < 0.5) {
            e.takeDamage(10, game, { crit: false });
            G.FX.burst(e.x, e.y, '#cbd5e1', 8, 150, 3);
          }
        }
        break;
      }
    }
  };
})();
