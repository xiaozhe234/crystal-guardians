(function () {
  const G = window.G;
  let eid = 1;

  G.Enemy = function () {};

  G.makeEnemy = function (type, x, y, game, elite) {
    const d = G.ENEMIES[type];
    const hp = d.hp * game.enemyHpMult * (elite ? 3 : 1) * (1 + (game.floor - 1) * 0.22);
    const e = new G.Enemy();
    e.id = eid++;
    e.type = type; e.name = d.name; e.elite = !!elite; e.boss = false;
    e.maxHp = hp; e.hp = hp;
    e.speed = d.speed * game.enemySpeedMult;
    e.dmg = d.dmg * (elite ? 1.5 : 1);
    e.r = d.r * (elite ? 1.25 : 1);
    e.color = d.color;
    e.contact = !!d.contact; e.ranged = !!d.ranged;
    e.burst = d.burst || 1; e.rate = d.rate || 2; e.bSpeed = d.bSpeed || 260; e.charge = !!d.charge;
    e.selfDestruct = !!d.selfDestruct; e.arc = !!d.arc; e.detectRange = d.detectRange || 0; e.hide = !!d.hide;
    e.slowAura = d.slowAura || 0; e.slowShot = d.slowShot || 0; e.stunOnHit = d.stunOnHit || 0;
    e.splitType = d.splitType || ''; e.teleport = d.teleport || 0; e.lifesteal = d.lifesteal || 0;
    e.frontShield = !!d.frontShield; e.chargedShot = !!d.chargedShot; e.chargeTime = d.chargeTime || 1.5;
    e.chargedDmg = d.chargedDmg || 0; e.reviveInterval = d.reviveInterval || 0;
    e.lowHpBomb = !!d.lowHpBomb; e.bombRange = d.bombRange || 60; e.bombDmg = d.bombDmg || 3;
    e.unstoppable = !!d.unstoppable; e.healInterval = d.healInterval || 0; e.healAmount = d.healAmount || 0;
    e.healRange = d.healRange || 0; e.fireTrail = !!d.fireTrail; e.contactBomb = !!d.contactBomb;
    e.lanceRange = d.lanceRange || 0; e.lanceKnock = d.lanceKnock || 0; e.bossGuardAura = !!d.bossGuardAura;
    e.coins = d.coins;
    e.x = x; e.y = y;
    e.fireT = G.rand(0.5, 1.5); e.state = 'idle'; e.stateT = 0;
    e.kx = 0; e.ky = 0; e.slowT = 0; e.burnT = 0; e.burnTick = 0; e.poisonT = 0; e.poisonTick = 0;
    e.contactCd = 0; e.dead = false;
    e.summoned = false;
    e.pending = false; e.spawnIn = 0; e.wave = 1;
    return e;
  };

  G.makeBoss = function (type, x, y, game) {
    const d = G.BOSSES[type];
    const hp = d.hp * game.enemyHpMult * (1 + (game.floor - 1) * 0.25);
    const e = new G.Enemy();
    e.id = eid++;
    e.type = type; e.name = d.name; e.boss = true;
    e.maxHp = hp; e.hp = hp;
    e.speed = d.speed; e.dmg = d.dmg;
    e.r = d.r; e.color = d.color;
    e.x = x; e.y = y;
    e.coins = [d.coins];
    e.fireT = 1; e.state = 'idle'; e.stateT = 0;
    e.kx = 0; e.ky = 0; e.slowT = 0; e.burnT = 0; e.burnTick = 0; e.poisonT = 0; e.poisonTick = 0;
    e.contactCd = 0; e.dead = false; e.summoned = false;
    e.pending = false; e.spawnIn = 0; e.wave = 1;
    e.actT = 1.2; e.phase = 1; e.phaseT = 0; e.spiral = 0;
    return e;
  };

  G.Enemy.prototype.knockback = function (power, vx, vy) {
    if (this.unstoppable) return;
    const len = Math.hypot(vx, vy) || 1;
    this.kx += vx / len * power;
    this.ky += vy / len * power;
  };

  G.Enemy.prototype.takeDamage = function (dmg, game, opts) {
    if (this.dead) return;
    if (game && game.cheats && game.cheats.ohk) dmg = this.hp;
    // 重甲型蚀铁卫正面格挡：玩家在正面120°范围内减伤70%
    if (this.frontShield) {
      const p = G.nearestPlayer(game, this.x, this.y);
      if (p && this.fx !== undefined) {
        const dx = p.x - this.x, dy = p.y - this.y;
        const dist = Math.hypot(dx, dy) || 1;
        const dot = (dx / dist) * this.fx + (dy / dist) * this.fy;
        if (dot > 0.5) dmg *= 0.3; // 正面减伤70%
      }
    }
    // 蚀域守卫减伤光环：为附近BOSS提供30%减伤
    if (this.boss && game && game.enemies) {
      for (const e of game.enemies) {
        if (e.dead || !e.bossGuardAura) continue;
        if (G.dist(this.x, this.y, e.x, e.y) < 200) { dmg *= 0.7; break; }
      }
    }
    this.hp -= dmg;
    const crit = opts && opts.crit;
    G.FX.float(this.x, this.y - this.r - 8, Math.round(dmg), crit ? '#ffd54f' : '#ffffff', crit ? 19 : 14);
    G.FX.burst(this.x, this.y, this.color, 5, 130, 3);
    if (crit) G.FX.addShake(2);
    if (this.hp <= 0) this.die(game);
  };

  G.Enemy.prototype.die = function (game) {
    if (this.dead) return;
    this.dead = true;
    game.kills++;
    G.FX.burst(this.x, this.y, this.color, 14, 200, 4);
    G.audio.play(this.boss ? 'bossdie' : 'hit');
    // 孢囊自爆体自爆
    if (this.selfDestruct) {
      G.FX.burst(this.x, this.y, '#a855f7', 20, 280, 5);
      G.FX.addShake(3);
      for (const pl of (game.players || [game.player])) {
        if (pl.dead || pl.invuln > 0) continue;
        if (G.dist(this.x, this.y, pl.x, pl.y) < 60 + pl.r) pl.takeDamage(3, game);
      }
    }
    // 虚翼蝠群分裂
    if (this.splitType === 'mini_bat') {
      for (let i = 0; i < 2; i++) {
        const mb = new G.Enemy();
        const d = G.ENEMIES['bat_swarm'];
        mb.id = eid++;
        mb.type = 'mini_bat'; mb.name = '小虚翼蝠'; mb.elite = false; mb.boss = false;
        mb.maxHp = 2; mb.hp = 2;
        mb.speed = 200 * game.enemySpeedMult;
        mb.dmg = 0.5; mb.r = 6; mb.color = '#c4b5fd'; mb.contact = true;
        mb.coins = [1, 1];
        mb.x = this.x + G.rand(-20, 20); mb.y = this.y + G.rand(-20, 20);
        mb.fireT = 0; mb.state = 'idle'; mb.stateT = 0;
        mb.kx = 0; mb.ky = 0; mb.slowT = 0; mb.burnT = 0; mb.burnTick = 0; mb.poisonT = 0; mb.poisonTick = 0;
        mb.contactCd = 0; mb.dead = false; mb.summoned = true;
        mb.pending = false; mb.spawnIn = 0; mb.wave = 1;
        game.enemies.push(mb);
      }
    }
    if (this.boss) {
      game.bossKills++;
      G.FX.addShake(12);
      this.dropBossLoot(game);
    } else {
      // 拆分掉落：金币和能量各拆成多个小掉落物
      var coinAmt = G.randint(this.coins[0], this.coins[1]) * (this.elite ? 3 : 1);
      var coinCount = coinAmt;  // 每个金币价值1
      for (var ci = 0; ci < coinCount; ci++) {
        game.pickups.push(new G.Pickup({ type: 'coin', x: this.x + G.rand(-30, 30), y: this.y + G.rand(-30, 30), value: 1 }));
      }
      var energyTotal = Math.round(this.maxHp * 0.8 + 5);
      var energyCount = Math.max(1, Math.floor(energyTotal / 5));  // 每5点能量一个球
      var energyPer = Math.floor(energyTotal / energyCount);
      for (var ei = 0; ei < energyCount; ei++) {
        game.pickups.push(new G.Pickup({ type: 'energy', x: this.x + G.rand(-35, 35), y: this.y + G.rand(-35, 35), value: energyPer }));
      }
      if (Math.random() < 0.08) game.pickups.push(new G.Pickup({ type: 'hp', x: this.x + G.rand(-20, 20), y: this.y + G.rand(-20, 20), value: 1 }));
    }
    G.checkRoomClear(game);
  };

  G.Enemy.prototype.dropBossLoot = function (game) {
    const r = game.room;
    r.chests.push(new G.Chest({ x: this.x + 50, y: this.y, big: true }));
    game.pickups.push(new G.Pickup({ type: 'coin', x: this.x - 50, y: this.y, value: this.coins[0] }));
    game.pickups.push(new G.Pickup({ type: 'hp', x: this.x, y: this.y + 34, value: 3 }));
    game.pickups.push(new G.Pickup({ type: 'energy', x: this.x, y: this.y - 34, value: 60 }));
    r.portal = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };

  G.Enemy.prototype.update = function (game, dt) {
    if (this.dead) return;
    if (this.spawnIn > 0) {
      // 蚀潮怪物显形中：不行动、不可被命中
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        G.FX.burst(this.x, this.y, this.color, 10, 180, 4);
        G.audio.play('spawn');
      }
      return;
    }
    const p = G.nearestPlayer(game, this.x, this.y);
    if (!p) return;
    this.slowT = Math.max(0, this.slowT - dt);
    this.burnT = Math.max(0, this.burnT - dt);
    if (this.burnT > 0) {
      this.burnTick += dt;
      while (this.burnTick >= 0.5) {
        this.burnTick -= 0.5;
        this.hp -= 2;
        G.FX.burst(this.x, this.y, '#fb923c', 3, 80, 2);
        if (this.hp <= 0) { this.die(game); return; }
      }
    }
    this.poisonT = Math.max(0, this.poisonT - dt);
    if (this.poisonT > 0) {
      this.poisonTick += dt;
      while (this.poisonTick >= 0.5) {
        this.poisonTick -= 0.5;
        this.hp -= 2;
        G.FX.burst(this.x, this.y, '#4ade80', 3, 80, 2);
        if (this.hp <= 0) { this.die(game); return; }
      }
    }
    this.kx *= Math.max(0, 1 - 8 * dt);
    this.ky *= Math.max(0, 1 - 8 * dt);
    if (this.boss) { this.updateBoss(game, dt); return; }

    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const spd = this.speed * (this.slowT > 0 ? 0.5 : 1);
    const r = game.room;

    if (this.type === 'turret') {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.rate;
        const a = Math.atan2(dy, dx);
        for (let i = 0; i < this.burst; i++) {
          const aa = a + (i - (this.burst - 1) / 2) * 0.15;
          game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(aa) * this.bSpeed, vy: Math.sin(aa) * this.bSpeed, dmg: this.dmg, r: 4, color: '#f87171' }));
        }
        G.audio.play('eshoot');
      }
      this.x += nx * spd * dt + this.kx * dt; this.y += ny * spd * dt + this.ky * dt;
    } else if (this.type === 'shooter' || this.type === 'skeleton') {
      const ideal = 280;
      if (d > ideal + 40) { this.x += nx * spd * dt + this.kx * dt; this.y += ny * spd * dt + this.ky * dt; }
      else if (d < ideal - 60) { this.x -= nx * spd * dt + this.kx * dt; this.y -= ny * spd * dt + this.ky * dt; }
      else { this.x += this.kx * dt; this.y += this.ky * dt; }
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.rate;
        const a = Math.atan2(dy, dx);
        var bColor = this.type === 'skeleton' ? '#d4d4d8' : '#f87171';
        game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(a) * this.bSpeed, vy: Math.sin(a) * this.bSpeed, dmg: this.dmg, r: 4, color: bColor }));
        G.audio.play('eshoot');
      }
    } else if (this.type === 'mage') {
      const ideal = 320;
      if (d > ideal + 50) { this.x += nx * spd * dt + this.kx * dt; this.y += ny * spd * dt + this.ky * dt; }
      else if (d < ideal - 80) { this.x -= nx * spd * dt + this.kx * dt; this.y -= ny * spd * dt + this.ky * dt; }
      else { this.x += this.kx * dt; this.y += this.ky * dt; }
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.rate;
        const a = Math.atan2(dy, dx);
        for (let i = 0; i < this.burst; i++) {
          const aa = a + (i - (this.burst - 1) / 2) * 0.2;
          game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(aa) * this.bSpeed, vy: Math.sin(aa) * this.bSpeed, dmg: this.dmg, r: 5, color: '#c084fc' }));
        }
        G.audio.play('eshoot');
      }
    } else if (this.type === 'ghost') {
      // 残虚影：追踪玩家，无碰撞（可穿墙），脉冲式移动
      this.x += nx * spd * dt + this.kx * dt;
      this.y += ny * spd * dt + this.ky * dt;
      // 残虚影不碰撞障碍物，但限制在房间内
      this.x = G.clamp(this.x, r.x + 10, r.x + r.w - 10);
      this.y = G.clamp(this.y, r.y + 10, r.y + r.h - 10);
      // 跳过障碍物碰撞
      if (this.contact && this.contactCd <= 0 && p.invuln <= 0 && G.dist(this.x, this.y, p.x, p.y) < this.r + p.r - 2) {
        p.takeDamage(this.dmg, game);
        this.contactCd = 0.6;
      }
      this.contactCd = Math.max(0, this.contactCd - dt);
      return;
    } else if (this.type === 'goblin') {
      // 蚀獠投矛手：保持距离，抛物线投掷（弧形弹道）
      const ideal = 240;
      if (d > ideal + 40) { this.x += nx * spd * dt + this.kx * dt; this.y += ny * spd * dt + this.ky * dt; }
      else if (d < ideal - 60) { this.x -= nx * spd * dt + this.kx * dt; this.y -= ny * spd * dt + this.ky * dt; }
      else { this.x += this.kx * dt; this.y += this.ky * dt; }
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.rate;
        const a = Math.atan2(dy, dx);
        game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(a) * this.bSpeed, vy: Math.sin(a) * this.bSpeed - 80, dmg: this.dmg, r: 5, color: '#84cc16', gravity: 200 }));
        G.audio.play('eshoot');
      }
    } else if (this.type === 'plant') {
      // 蚀根植体：静止伪装，玩家靠近3格内喷毒
      this.fireT -= dt;
      if (d < this.detectRange && this.fireT <= 0) {
        this.fireT = this.rate;
        const a = Math.atan2(dy, dx);
        game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(a) * this.bSpeed, vy: Math.sin(a) * this.bSpeed, dmg: this.dmg, r: 5, color: '#4ade80', poison: 3 }));
        G.audio.play('eshoot');
      }
      this.x += this.kx * dt; this.y += this.ky * dt;
    } else if (this.type === 'mushroom') {
      // 孢囊自爆体：缓慢贴近，接触伤害
      this.x += nx * spd * dt + this.kx * dt;
      this.y += ny * spd * dt + this.ky * dt;
    } else if (this.type === 'beetle') {
      // 蚀壳冲撞虫：直线冲锋，撞墙后眩晕1秒
      this.stateT -= dt;
      if (this.state === 'idle') {
        this.x += nx * spd * dt + this.kx * dt;
        this.y += ny * spd * dt + this.ky * dt;
        if (d < 220) { this.state = 'windup'; this.stateT = 0.5; }
      } else if (this.state === 'windup') {
        this.x += this.kx * dt; this.y += this.ky * dt;
        if (this.stateT <= 0) { this.state = 'charge'; this.stateT = 0.6; this.cdx = nx; this.cdy = ny; }
      } else if (this.state === 'stun') {
        this.x += this.kx * dt; this.y += this.ky * dt;
        if (this.stateT <= 0) this.state = 'idle';
      } else {
        this.x += this.cdx * spd * 3.5 * dt + this.kx * dt;
        this.y += this.cdy * spd * 3.5 * dt + this.ky * dt;
        if (this.stateT <= 0) this.state = 'idle';
      }
    } else if (this.type === 'brute') {
      this.stateT -= dt;
      if (this.state === 'idle') {
        this.x += nx * spd * dt + this.kx * dt;
        this.y += ny * spd * dt + this.ky * dt;
        if (d < 220) { this.state = 'windup'; this.stateT = 0.6; }
      } else if (this.state === 'windup') {
        this.x += this.kx * dt; this.y += this.ky * dt;
        if (this.stateT <= 0) { this.state = 'charge'; this.stateT = 0.5; this.cdx = nx; this.cdy = ny; }
      } else {
        this.x += this.cdx * spd * 3.5 * dt + this.kx * dt;
        this.y += this.cdy * spd * 3.5 * dt + this.ky * dt;
        if (this.stateT <= 0) this.state = 'idle';
      }
    } else if (this.type === 'ice_beast') {
      // 凝霜蚀兽：缓慢贴近，周围120px减速光环（在player.js中检测）
      this.x += nx * spd * dt + this.kx * dt;
      this.y += ny * spd * dt + this.ky * dt;
    } else if (this.type === 'snowman') {
      // 寒冻投核者：保持距离，子弹附带减速
      const ideal = 260;
      if (d > ideal + 40) { this.x += nx * spd * dt + this.kx * dt; this.y += ny * spd * dt + this.ky * dt; }
      else if (d < ideal - 60) { this.x -= nx * spd * dt + this.kx * dt; this.y -= ny * spd * dt + this.ky * dt; }
      else { this.x += this.kx * dt; this.y += this.ky * dt; }
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.rate;
        const a = Math.atan2(dy, dx);
        game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(a) * this.bSpeed, vy: Math.sin(a) * this.bSpeed, dmg: this.dmg, r: 5, color: '#bae6fd', slow: this.slowShot }));
        G.audio.play('eshoot');
      }
    } else if (this.type === 'caveman') {
      // 蛮荒冲撞者：冲锋撞到玩家造成0.3秒眩晕
      this.stateT -= dt;
      if (this.state === 'idle') {
        this.x += nx * spd * dt + this.kx * dt;
        this.y += ny * spd * dt + this.ky * dt;
        if (d < 200) { this.state = 'windup'; this.stateT = 0.5; }
      } else if (this.state === 'windup') {
        this.x += this.kx * dt; this.y += this.ky * dt;
        if (this.stateT <= 0) { this.state = 'charge'; this.stateT = 0.5; this.cdx = nx; this.cdy = ny; }
      } else {
        this.x += this.cdx * spd * 3.2 * dt + this.kx * dt;
        this.y += this.cdy * spd * 3.2 * dt + this.ky * dt;
        if (this.stateT <= 0) this.state = 'idle';
      }
    } else if (this.type === 'bat_swarm' || this.type === 'mini_bat') {
      // 虚翼蝠群：快速追踪，闪避动作
      const wobble = Math.sin(G.time * 12 + this.id) * 40;
      this.x += nx * spd * dt + this.kx * dt + Math.cos(wobble) * 30 * dt;
      this.y += ny * spd * dt + this.ky * dt + Math.sin(wobble) * 30 * dt;
    } else if (this.type === 'shadow') {
      // 影刃蚀刺：每3秒闪烁到玩家背后150px处
      this.teleportT = (this.teleportT || 0) - dt;
      if (this.teleportT <= 0) {
        this.teleportT = this.teleport;
        this.x = p.x - Math.cos(p.aimAngle) * 150;
        this.y = p.y - Math.sin(p.aimAngle) * 150;
        this.x = G.clamp(this.x, r.x + 20, r.x + r.w - 20);
        this.y = G.clamp(this.y, r.y + 20, r.y + r.h - 20);
        G.FX.burst(this.x, this.y, '#4c1d95', 8, 150, 3);
      }
      this.x += nx * spd * dt + this.kx * dt;
      this.y += ny * spd * dt + this.ky * dt;
    } else if (this.type === 'ghost_mage') {
      // 残虚术者：保持距离，攻击命中回血
      const ideal = 300;
      if (d > ideal + 50) { this.x += nx * spd * dt + this.kx * dt; this.y += ny * spd * dt + this.ky * dt; }
      else if (d < ideal - 80) { this.x -= nx * spd * dt + this.kx * dt; this.y -= ny * spd * dt + this.ky * dt; }
      else { this.x += this.kx * dt; this.y += this.ky * dt; }
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.rate;
        const a = Math.atan2(dy, dx);
        game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(a) * this.bSpeed, vy: Math.sin(a) * this.bSpeed, dmg: this.dmg, r: 5, color: '#c4b5fd', lifesteal: this.lifesteal, ownerId: this.id }));
        G.audio.play('eshoot');
      }
    } else if (this.type === 'armor_knight') {
      // 重甲型蚀铁卫：缓慢贴近，正面减伤70%（在takeDamage中处理）
      this.x += nx * spd * dt + this.kx * dt;
      this.y += ny * spd * dt + this.ky * dt;
      this.fx = nx; this.fy = ny; // 记录朝向，用于格挡判定
    } else if (this.type === 'crossbowman') {
      // 蓄力晶弩手：蓄力1.5秒后射出高速高伤箭
      const ideal = 280;
      if (d > ideal + 40) { this.x += nx * spd * dt + this.kx * dt; this.y += ny * spd * dt + this.ky * dt; }
      else if (d < ideal - 60) { this.x -= nx * spd * dt + this.kx * dt; this.y -= ny * spd * dt + this.ky * dt; }
      else { this.x += this.kx * dt; this.y += this.ky * dt; }
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.state = 'charging'; this.stateT = this.chargeTime; this.fireT = 999;
      }
      if (this.state === 'charging') {
        this.stateT -= dt;
        if (this.stateT <= 0) {
          this.state = 'idle'; this.fireT = this.rate;
          const a = Math.atan2(dy, dx);
          game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(a) * this.bSpeed, vy: Math.sin(a) * this.bSpeed, dmg: this.chargedDmg, r: 6, color: '#fbbf24' }));
          G.audio.play('eshoot');
        }
      }
    } else if (this.type === 'necromancer') {
      // 亡纹招魂师：保持距离，每5秒复活一只死亡小怪
      const ideal = 320;
      if (d > ideal + 50) { this.x += nx * spd * dt + this.kx * dt; this.y += ny * spd * dt + this.ky * dt; }
      else if (d < ideal - 80) { this.x -= nx * spd * dt + this.kx * dt; this.y -= ny * spd * dt + this.ky * dt; }
      else { this.x += this.kx * dt; this.y += this.ky * dt; }
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.rate;
        const a = Math.atan2(dy, dx);
        game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(a) * this.bSpeed, vy: Math.sin(a) * this.bSpeed, dmg: this.dmg, r: 5, color: '#a855f7' }));
        G.audio.play('eshoot');
      }
      this.reviveT = (this.reviveT || 0) - dt;
      if (this.reviveT <= 0) {
        this.reviveT = this.reviveInterval;
        const deadPool = game.room.enemies.filter(e => e.dead && !e.boss && e.type !== 'boss_guard');
        if (deadPool.length > 0) {
          const e2 = deadPool[Math.floor(Math.random() * deadPool.length)];
          e2.dead = false; e2.hp = Math.ceil(e2.maxHp * 0.5);
          e2.x = this.x + G.rand(-40, 40); e2.y = this.y + G.rand(-40, 40);
          e2.pending = false; e2.spawnIn = 0;
          game.enemies.push(e2);
          G.FX.burst(e2.x, e2.y, '#a855f7', 10, 150, 3);
          G.audio.play('spawn');
        }
      }
    } else if (this.type === 'bomber') {
      // 低血自爆兵：HP<30%时冲向玩家自爆
      if (this.hp < this.maxHp * 0.3) {
        this.x += nx * spd * 2.5 * dt + this.kx * dt;
        this.y += ny * spd * 2.5 * dt + this.ky * dt;
        if (d < 30 + this.r + p.r) {
          // 自爆
          G.FX.burst(this.x, this.y, '#ef4444', 25, 300, 6);
          G.FX.addShake(5);
          G.audio.play('boom');
          for (const pl of (game.players || [game.player])) {
            if (pl.dead || pl.invuln > 0) continue;
            if (G.dist(this.x, this.y, pl.x, pl.y) < this.bombRange + pl.r) pl.takeDamage(this.bombDmg, game);
          }
          this.hp = 0; this.die(game); return;
        }
      } else {
        this.x += nx * spd * dt + this.kx * dt;
        this.y += ny * spd * dt + this.ky * dt;
      }
    } else if (this.type === 'golem') {
      // 重蚀岩甲像：免疫击退/减速，攻击带震地
      this.kx = 0; this.ky = 0; this.slowT = 0; // 免疫一切控制
      this.x += nx * spd * dt;
      this.y += ny * spd * dt;
      if (this.contact && this.contactCd <= 0 && p.invuln <= 0 && G.dist(this.x, this.y, p.x, p.y) < this.r + p.r + 10) {
        p.takeDamage(this.dmg, game);
        this.contactCd = 0.8;
        G.FX.addShake(3); // 震地
        G.FX.burst(this.x, this.y, '#78716c', 8, 120, 3);
      }
    } else if (this.type === 'dark_priest') {
      // 蚀纹祭司：保持距离，每4秒回复周围怪物15HP
      const ideal = 300;
      if (d > ideal + 50) { this.x += nx * spd * dt + this.kx * dt; this.y += ny * spd * dt + this.ky * dt; }
      else if (d < ideal - 80) { this.x -= nx * spd * dt + this.kx * dt; this.y -= ny * spd * dt + this.ky * dt; }
      else { this.x += this.kx * dt; this.y += this.ky * dt; }
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.rate;
        const a = Math.atan2(dy, dx);
        game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(a) * this.bSpeed, vy: Math.sin(a) * this.bSpeed, dmg: this.dmg, r: 5, color: '#a78bfa' }));
        G.audio.play('eshoot');
      }
      this.healT = (this.healT || 0) - dt;
      if (this.healT <= 0) {
        this.healT = this.healInterval;
        let healed = 0;
        for (const e2 of game.enemies) {
          if (e2.dead || e2 === this) continue;
          if (G.dist(this.x, this.y, e2.x, e2.y) < this.healRange) {
            e2.hp = Math.min(e2.maxHp, e2.hp + this.healAmount);
            G.FX.burst(e2.x, e2.y, '#a78bfa', 5, 100, 2);
            healed++;
          }
        }
      }
    } else if (this.type === 'hellhound') {
      // 燃迹猎犬：快速追踪，移动时留下火焰路径
      this.x += nx * spd * dt + this.kx * dt;
      this.y += ny * spd * dt + this.ky * dt;
      this.fireTrailT = (this.fireTrailT || 0) - dt;
      if (this.fireTrailT <= 0) {
        this.fireTrailT = 0.25;
        if (!game.fireTrails) game.fireTrails = [];
        game.fireTrails.push({ x: this.x, y: this.y, r: 14, life: 2, dmg: 2 });
      }
    } else if (this.type === 'bomb_spider') {
      // 触炸蛛体：碰到玩家即爆炸
      this.x += nx * spd * dt + this.kx * dt;
      this.y += ny * spd * dt + this.ky * dt;
      if (p.invuln <= 0 && G.dist(this.x, this.y, p.x, p.y) < this.r + p.r + 5) {
        G.FX.burst(this.x, this.y, '#dc2626', 20, 250, 5);
        G.FX.addShake(4);
        G.audio.play('boom');
        for (const pl of (game.players || [game.player])) {
          if (pl.dead || pl.invuln > 0) continue;
          if (G.dist(this.x, this.y, pl.x, pl.y) < this.bombRange + pl.r) pl.takeDamage(this.bombDmg, game);
        }
        this.hp = 0; this.die(game); return;
      }
    } else if (this.type === 'spearman') {
      // 精锐刺锋卫：突刺攻击距离150，附带击退
      this.x += nx * spd * dt + this.kx * dt;
      this.y += ny * spd * dt + this.ky * dt;
      this.lanceCd = Math.max(0, (this.lanceCd || 0) - dt);
      if (this.lanceCd <= 0 && d < this.lanceRange && p.invuln <= 0) {
        this.lanceCd = 1.2;
        p.takeDamage(this.dmg, game);
        p.kx = (p.kx || 0) + nx * this.lanceKnock;
        p.ky = (p.ky || 0) + ny * this.lanceKnock;
        G.FX.burst(p.x, p.y, '#fbbf24', 6, 120, 3);
        G.audio.play('hit');
      }
    } else if (this.type === 'boss_guard') {
      // 蚀域守卫：缓慢贴近，为附近BOSS提供30%减伤光环（在takeDamage中处理）
      this.x += nx * spd * dt + this.kx * dt;
      this.y += ny * spd * dt + this.ky * dt;
    } else {
      this.x += nx * spd * dt + this.kx * dt;
      this.y += ny * spd * dt + this.ky * dt;
    }

    this.x = G.clamp(this.x, r.x + 10, r.x + r.w - 10);
    this.y = G.clamp(this.y, r.y + 10, r.y + r.h - 10);
    // 蚀壳冲撞虫冲锋撞墙/障碍物后眩晕
    if (this.type === 'beetle' && this.state === 'charge') {
      const onWall = this.x <= r.x + 12 || this.x >= r.x + r.w - 12 || this.y <= r.y + 12 || this.y >= r.y + r.h - 12;
      let hitOb = false;
      for (const ob of r.obstacles) {
        if (ob.dead) continue;
        if (G.dist(this.x, this.y, ob.x, ob.y) < this.r + ob.r + 2) { hitOb = true; break; }
      }
      if (onWall || hitOb) {
        this.state = 'stun'; this.stateT = 1.0;
        G.FX.burst(this.x, this.y, '#fbbf24', 8, 150, 3);
      }
    }
    for (const ob of r.obstacles) {
      if (ob.dead) continue;
      const od = G.dist(this.x, this.y, ob.x, ob.y), min = this.r + ob.r;
      if (od < min && od > 0) {
        this.x += (this.x - ob.x) / od * (min - od);
        this.y += (this.y - ob.y) / od * (min - od);
      }
    }
    if (this.contact && this.contactCd <= 0 && p.invuln <= 0
        && this.type !== 'golem' && this.type !== 'spearman' && this.type !== 'bomb_spider'
        && G.dist(this.x, this.y, p.x, p.y) < this.r + p.r - 2) {
      p.takeDamage(this.dmg, game);
      this.contactCd = 0.6;
      // 蛮荒冲撞者冲锋眩晕玩家
      if (this.type === 'caveman' && this.state === 'charge' && this.stunOnHit) {
        p.stunT = this.stunOnHit;
      }
    }
    this.contactCd = Math.max(0, this.contactCd - dt);
  };  // end update()

  G.Enemy.prototype.updateBoss = function (game, dt) {
    const p = G.nearestPlayer(game, this.x, this.y);
    if (!p) return;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const r = game.room;
    this.phaseT += dt;

    const hpRatio = this.hp / this.maxHp;
    if (hpRatio < 0.5 && this.phase === 1) {
      this.phase = 2;
      G.FX.float(this.x, this.y - 60, '第二阶段!', '#f87171', 22);
      G.FX.addShake(10);
      this.actT = 0.8;
    }

    if (this.type === 'slimeking') {
      if (this.state === 'jump') {
        this.x += (this.jumpTx - this.x) * Math.min(1, 3 * dt);
        this.y += (this.jumpTy - this.y) * Math.min(1, 3 * dt);
        this.stateT -= dt;
        if (this.stateT <= 0) {
          this.state = 'idle';
          G.FX.burst(this.x, this.y, this.color, 16, 220, 5);
          G.FX.addShake(8);
          G.audio.play('boom');
          if (G.dist(this.x, this.y, p.x, p.y) < 130) p.takeDamage(this.dmg, game);
          if (this.summonSlime) {
            for (let i = 0; i < 2; i++) {
              const e2 = G.makeEnemy('slime', this.x + G.rand(-70, 70), this.y + G.rand(-70, 70), game, false);
              e2.summoned = true;
              game.enemies.push(e2);
            }
          }
        }
      } else {
        this.x += nx * this.speed * (this.phase === 2 ? 1.5 : 1) * dt + this.kx * dt;
        this.y += ny * this.speed * (this.phase === 2 ? 1.5 : 1) * dt + this.ky * dt;
      }
    } else if (this.type === 'turretboss') {
      this.x += this.kx * dt; this.y += this.ky * dt;
    } else if (this.type === 'darkknight') {
      if (this.state === 'dash') {
        this.x += this.cdx * this.speed * 4 * dt;
        this.y += this.cdy * this.speed * 4 * dt;
        this.stateT -= dt;
        if (this.stateT <= 0) this.state = 'idle';
        if (G.dist(this.x, this.y, p.x, p.y) < this.r + p.r) p.takeDamage(this.dmg, game);
      } else {
        this.x += nx * this.speed * 0.7 * dt + this.kx * dt;
        this.y += ny * this.speed * 0.7 * dt + this.ky * dt;
      }
    }

    this.x = G.clamp(this.x, r.x + 10, r.x + r.w - 10);
    this.y = G.clamp(this.y, r.y + 10, r.y + r.h - 10);
    for (const ob of r.obstacles) {
      if (ob.dead) continue;
      const od = G.dist(this.x, this.y, ob.x, ob.y), min = this.r + ob.r;
      if (od < min && od > 0) {
        this.x += (this.x - ob.x) / od * (min - od);
        this.y += (this.y - ob.y) / od * (min - od);
      }
    }

    this.actT -= dt;
    if (this.actT <= 0 && this.state !== 'jump' && this.state !== 'dash') {
      this.doBossAttack(game, nx, ny, d);
    }

    if (this.contactCd <= 0 && p.invuln <= 0 && G.dist(this.x, this.y, p.x, p.y) < this.r + p.r) {
      p.takeDamage(this.dmg, game);
      this.contactCd = 0.8;
    }
    this.contactCd = Math.max(0, this.contactCd - dt);
  };

  G.Enemy.prototype.ringAttack = function (game, n, speed) {
    for (let i = 0; i < n; i++) {
      const aa = i * G.TAU / n + G.rand(-0.05, 0.05);
      game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(aa) * speed, vy: Math.sin(aa) * speed, dmg: this.dmg, r: 4, color: '#f87171' }));
    }
    G.audio.play('eshoot');
  };

  G.Enemy.prototype.doBossAttack = function (game, nx, ny, d) {
    const p = game.player;
    const a = Math.atan2(ny, nx);
    if (this.type === 'slimeking') {
      if (Math.random() < 0.55 || this.phase === 1) {
        this.state = 'jump';
        this.stateT = 0.55;
        this.jumpTx = G.clamp(p.x + G.rand(-40, 40), game.room.x + 30, game.room.x + game.room.w - 30);
        this.jumpTy = G.clamp(p.y + G.rand(-40, 40), game.room.y + 30, game.room.y + game.room.h - 30);
        this.summonSlime = this.phase === 2 && Math.random() < 0.6;
        this.actT = G.rand(1.4, 2.0);
      } else {
        this.ringAttack(game, 10 + this.phase * 4, 150);
        this.actT = 2.2;
      }
    } else if (this.type === 'turretboss') {
      const roll = Math.random();
      if (roll < 0.4) {
        const n = this.phase === 2 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.18;
          game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(aa) * 260, vy: Math.sin(aa) * 260, dmg: this.dmg, r: 4, color: '#f87171' }));
        }
        G.audio.play('eshoot');
        this.actT = 1.4;
      } else if (roll < 0.75) {
        this.ringAttack(game, 16 + this.phase * 6, 170);
        this.actT = 1.8;
      } else {
        this.spiral++;
        const base = this.spiral * 0.5;
        for (let i = 0; i < 8; i++) {
          const aa = base + i * G.TAU / 8;
          game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(aa) * 190, vy: Math.sin(aa) * 190, dmg: this.dmg, r: 4, color: '#f87171', life: 3 }));
        }
        this.actT = 0.4;
      }
      if (this.phase === 2 && Math.random() < 0.35) {
        const e2 = G.makeEnemy('turret', this.x + G.rand(-120, 120), this.y + G.rand(-120, 120), game, false);
        e2.summoned = true;
        game.enemies.push(e2);
      }
    } else if (this.type === 'darkknight') {
      const roll = Math.random();
      if (roll < 0.45) {
        // 冲刺：P2 三连冲
        this.state = 'dash';
        this.stateT = 0.4;
        const ta = Math.atan2(p.y - this.y, p.x - this.x);
        this.cdx = Math.cos(ta); this.cdy = Math.sin(ta);
        this.actT = this.phase === 2 ? 0.7 : 1.2;
      } else if (roll < 0.7) {
        // 扇形弹幕
        const n = this.phase === 2 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.14;
          game.bullets.push(new G.Bullet({ x: this.x, y: this.y, vx: Math.cos(aa) * 320, vy: Math.sin(aa) * 320, dmg: this.dmg, r: 4, color: '#c084fc' }));
        }
        G.audio.play('eshoot');
        this.actT = 1.2;
      } else {
        // 环形弹幕 + P2额外召唤虚翼蝠
        this.ringAttack(game, this.phase === 2 ? 20 : 14, this.phase === 2 ? 200 : 170);
        if (this.phase === 2) {
          for (let i = 0; i < 2; i++) {
            const e2 = G.makeEnemy('bat', this.x + G.rand(-60, 60), this.y + G.rand(-60, 60), game, false);
            e2.summoned = true;
            game.enemies.push(e2);
          }
        }
        this.actT = 2.0;
      }
    }
  };
})();

