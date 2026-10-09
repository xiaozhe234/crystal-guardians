(function () {
  const G = window.G;
  G.W = 960;
  G.H = 540;
  G.vw = 960;  // 实际视口宽（游戏坐标），手机横屏宽于 16:9 时 >960
  G.vh = 540;  // 实际视口高（游戏坐标）
  G.time = 0;
  G.state = 'menu';
  G.game = null;
  G.paused = false;
  G.selectedChar = 'warden';
  G.useFactors = false;
  G.mouse = { x: 0, y: 0, down: false, triggered: false, released: false, clicked: false, wheel: 0 };
  G.keys = {};

  let canvas, ctx, last = 0;

  G.changeState = function (s) {
    G.state = s;
    if (s === 'menu') G.audio.stopBGM();
  };

  function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    G.canvas = canvas;
    G.ctx = ctx;
    G.saveLoad();
    G.audio.setEnabled(G.save.sound);
    G.audio.setMusicEnabled(G.save.music !== false);
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', (e) => { G.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { G.keys = {}; G.mouse.down = false; });
    canvas.addEventListener('mousemove', (e) => { const m = toLogical(e); G.mouse.x = m.x; G.mouse.y = m.y; });
    canvas.addEventListener('mousedown', (e) => {
      const m = toLogical(e);
      G.mouse.x = m.x; G.mouse.y = m.y;
      G.mouse.down = true;
      G.mouse.triggered = true;
      G.mouse.clicked = true;
    });
    window.addEventListener('mouseup', (e) => {
      const m = toLogical(e);
      G.mouse.x = m.x; G.mouse.y = m.y;
      G.mouse.down = false;
      G.mouse.released = true;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); G.mouse.wheel += e.deltaY > 0 ? 1 : -1; });
    requestAnimationFrame(loop);
  }

  function toLogical(e) {
    const rect = canvas.getBoundingClientRect();
    const v = G.view;
    var lx = (e.clientX - rect.left - v.offX) / v.scale;
    var ly = (e.clientY - rect.top - v.offY) / v.scale;
    // 非战斗状态/暂停/商店/晶悟等 UI 通过 ctx.translate(uiX,0) 居中偏移渲染，
    // 触摸/鼠标坐标需要减去这个偏移才能对齐按钮位置
    var uiX = Math.max(0, (G.vw - G.W) / 2);
    // siege 模式的 HUD 始终通过 ctx.translate(uiX, 0) 偏移渲染，鼠标坐标也必须减 uiX 才能对齐
    if (G.paused || G.state === 'siege' || (G.state !== 'game' && G.state !== 'netgame' && G.state !== 'siege')
        || (G.game && (G.game.talentOpen || (G.game.player && G.game.player.shopOpen) || G.game.shopOpen || G.game.buildMode))) {
      lx -= uiX;
    }
    return {
      x: G.clamp(lx, 0, G.vw),
      y: G.clamp(ly, 0, G.vh)
    };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const scale = Math.min(w / G.W, h / G.H);
    G.vw = Math.round(w / scale);
    G.vh = Math.round(h / scale);
    G.view = { scale: scale, offX: (w - G.vw * scale) / 2, offY: (h - G.vh * scale) / 2, dpr: dpr };
  }

  function loop(t) {
    const dt = Math.min(0.033, ((t - last) / 1000) || 0.016);
    last = t;
    G.time += dt;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    G.keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (G.state === 'game' || G.state === 'netgame' || G.state === 'siege') {
      const game = G.game;
      if (!game) return;
      if (k === 'escape' || k === 'p') {
        if (G.state === 'siege') {
          if (!game.cheatOpen && !game.shopOpen && !game.finished) {
            G.paused = !G.paused;
            G.audio.play('click');
          }
          return;
        }
        if (!game.talentOpen && !(game.player && game.player.shopOpen) && !game.finished) {
          G.paused = !G.paused;
          G.audio.play('click');
        }
        return;
      }
      if (k === 'k') {
        if (G.state === 'siege') {
          game.cheatOpen = !game.cheatOpen;
          G.audio.play('click');
          return;
        }
        game.cheatOpen = !game.cheatOpen;
        G.audio.play('click');
        return;
      }
      if (G.paused || game.talentOpen || (game.player && game.player.shopOpen) || game.shopOpen || game.finished) return;
      if (G.state === 'siege') {
        if (k === 'b') { if (game.phase !== 'rest') return; game.shopOpen = !game.shopOpen; game.placingDevice = null; game.buildMode = false; game.removeMode = false; G.audio.play('click'); return; }
        if (k === 'v') { game.buildMode = !game.buildMode; game.placingDevice = null; game.shopOpen = false; game.removeMode = false; G.audio.play('click'); return; }
        if (k === ' ') { if (!(G.Net && G.Net.active)) game.player.useSkill(game); }
        else if (k === 'q') { if (!(G.Net && G.Net.active)) game.player.switchWeapon(); }
        return;
      }
      if (k === ' ') { if (!(G.Net && G.Net.active)) game.player.useSkill(game); }
      else if (k === 'e') G.tryInteract(game);
      else if (k === 'q') { if (!(G.Net && G.Net.active)) game.player.switchWeapon(); }
    } else if (G.state === 'menu' && k === 'enter') {
      G.changeState('charselect');
    } else if ((G.state === 'gameover' || G.state === 'victory') && (k === 'enter' || k === ' ')) {
      G.game = null;
      if (G.Net && G.Net.inSession) { G.Net.backToLobby(); return; }
      G.changeState('menu');
    }
  }

  function update(dt) {
    G.UI.handleClick();
    G.mouse.clicked = false;
    // 手机端触控：摇杆→WASD + 瞄准方向
    if (G.mobileTick) G.mobileTick();
    // 元晶守卫战：鼠标点击放置/拆除晶防装置
    if (G.state === 'siege' && G.game && G.mouse.triggered) {
      const s = G.game;
      // 拆除模式：点击晶防装置拆除
      if (s.removeMode && !s.shopOpen && !s.cheatOpen && !s.buildMode && !s.placingDevice) {
        const uiX = Math.max(0, (G.vw - G.W) / 2);
        const mx = G.mouse.x + uiX + s.cam.x, my = G.mouse.y + s.cam.y;
        for (let i = s.devices.length - 1; i >= 0; i--) {
          const d = s.devices[i];
          if (d.hp > 0 && G.dist(mx, my, d.x, d.y) < d.r + 24) {
            G.Siege.removeDevice(s, i);
            break;
          }
        }
      }
      if (s.placingDevice && !s.shopOpen && !s.cheatOpen && !s.buildMode) {
        // 刚购买：跳过本次点击，等待用户重新选择位置点击
        if (s._placingDeviceJustBought) {
          s._placingDeviceJustBought = false;
        } else {
          const uiX = Math.max(0, (G.vw - G.W) / 2);
          const mx = G.mouse.x + uiX + s.cam.x, my = G.mouse.y + s.cam.y;
          G.Siege.placeDevice(s, mx, my);
        }
      }
    }
    if (G.state === 'game') {
      const game = G.game;
      if (game && !game.finished && !G.paused && !game.talentOpen && !(game.player && game.player.shopOpen)) {
        updateGame(game, dt);
      }
    }
    if (G.state === 'siege') {
      const s = G.game;
      if (s && !s.finished && !G.paused && !s.cheatOpen) {
        G.Siege.update(dt);
      }
    }
    if (G.state === 'netgame' && G.Net && G.Net.active) {
      G.Net.tick(dt);
    }
    G.FX.update(dt);
    G.FX.updateAmbient(dt);
    G.mouse.triggered = false;
    G.mouse.released = false;
  }

  function updateGame(game, dt) {
    game.time += dt;
    // 作弊效果
    if (game.cheats.god) {
      for (const p of game.players) { if (!p.dead) p.invuln = 1; }
    }
    if (game.cheats.infEnergy) {
      for (const p of game.players) { if (!p.dead) p.energy = p.maxEnergy; }
    }
    if (game.cheats.infGold) {
      game.gold = 9999;
    }
    if (game.cheats.speed) {
      for (const p of game.players) { if (!p.dead) p.moveMult = 2; }
    }
    if (game.cheats.noCd) {
      for (const p of game.players) { if (!p.dead) p.skill.cdLeft = 0; }
    }
    const players = game.players || (game.players = [game.player]);
    // 单人模式：注入本地键盘/鼠标输入
    for (const p of players) {
      if (!p.input) p.input = { local: true, keys: {}, mouse: { worldX: 0, worldY: 0, down: false, released: false, triggered: false } };
      if (p.input.local) {
        p.input.keys = G.keys;
        p.input.mouse.worldX = G.mouse.x + game.cam.x;
        p.input.mouse.worldY = G.mouse.y + game.cam.y;
        p.input.mouse.down = G.mouse.down;
        p.input.mouse.released = G.mouse.released;
        p.input.mouse.triggered = G.mouse.triggered;
      }
    }
    if (!players.some(pl => !pl.dead)) {
      game.playerDeadT = (game.playerDeadT || 0) + dt;
      if (game.playerDeadT > 1.2) finishRun(game, false);
      return;
    }
    // 网络输入：技能/交互/切枪（edge 触发）；单人由键盘事件处理
    for (const p of players) {
      if (p.dead || p.input.local) continue;
      const k = p.input.keys || {};
      if (k[' '] && !p.prevSpace) { G.audio.focus = { x: p.x, y: p.y }; p.useSkill(game, k); }
      p.prevSpace = !!k[' '];
      if (k['e'] && !p.prevE) { G.audio.focus = { x: p.x, y: p.y }; G.tryInteract(game, p); }
      p.prevE = !!k['e'];
      if (k['q'] && !p.prevQ) { G.audio.focus = { x: p.x, y: p.y }; p.switchWeapon(); }
      p.prevQ = !!k['q'];
    }
    for (const p of players) { if (p.dead) continue; G.audio.focus = { x: p.x, y: p.y }; p.update(game, dt, p.input); }

    for (const e of game.enemies) { if (e.dead) continue; G.audio.focus = { x: e.x, y: e.y }; e.update(game, dt); }
    game.enemies = game.enemies.filter(e => !e.dead);
    // 火径更新
    if (game.fireTrails && game.fireTrails.length > 0) {
      for (const ft of game.fireTrails) ft.life -= dt;
      game.fireTrails = game.fireTrails.filter(ft => ft.life > 0);
    }
    G.audio.focus = { x: game.room.x + game.room.w / 2, y: game.room.y + game.room.h / 2 };
    updateWaves(game, dt);

    for (let i = 0; i < game.enemies.length; i++) {
      for (let j = i + 1; j < game.enemies.length; j++) {
        const a = game.enemies[i], b = game.enemies[j];
        if (a.dead || b.dead || a.boss || b.boss || a.spawnIn > 0 || b.spawnIn > 0) continue;
        const d = G.dist(a.x, a.y, b.x, b.y), min = a.r + b.r;
        if (d < min && d > 0) {
          const push = (min - d) / 2;
          a.x -= (b.x - a.x) / d * push;
          a.y -= (b.y - a.y) / d * push;
          b.x += (b.x - a.x) / d * push;
          b.y += (b.y - a.y) / d * push;
        }
      }
    }

    for (const ally of game.allies) { G.audio.focus = { x: ally.x, y: ally.y }; updateAlly(ally, game, dt); }
    game.allies = game.allies.filter(a => a.hp > 0 && a.life > 0);

    for (const b of game.bullets) { G.audio.focus = { x: b.x, y: b.y }; b.update(game, dt); }
    game.bullets = game.bullets.filter(b => !b.dead);

    for (const pk of game.pickups) {
      if (pk.dead) continue;
      pk.t += dt;
      // 武器不能吸附，只能按 E 交互拾取
      if (pk.type === 'weapon') continue;
      for (const p of players) {
        if (p.dead) continue;
        var magRange = (p.magnetRange || 0) * (p.magnetMult || 1);
        var d = G.dist(p.x, p.y, pk.x, pk.y);
        if (d < magRange) {
          if (d < 22) {
            G.audio.focus = { x: pk.x, y: pk.y }; pk.collect(game, p); break;
          } else {
            // 吸附动画：在磁力范围内飞向玩家
            var magSpeed = 380;
            var nx = (p.x - pk.x) / d;
            var ny = (p.y - pk.y) / d;
            pk.x += nx * magSpeed * dt;
            pk.y += ny * magSpeed * dt;
          }
        }
      }
    }

    for (const c of game.room.chests) {
      if (c.opened) continue;
      for (const p of players) {
        if (!p.dead && G.dist(p.x, p.y, c.x, c.y) < 42) { G.audio.focus = { x: c.x, y: c.y }; c.open(game); break; }
      }
    }
    const rv = game.room.revive;
    if (rv && !rv.used) {
      for (const p of players) {
        if (!p.dead && G.dist(p.x, p.y, rv.x, rv.y) < 42) {
          rv.used = true;
          G.audio.focus = { x: rv.x, y: rv.y };
          p.hp = Math.min(p.maxHp, p.hp + 3);
          p.energy = Math.min(p.maxEnergy, p.energy + 30);
          G.FX.float(p.x, p.y - 26, '复活泉水 +3生命 +30能量', '#4ade80', 15);
          G.audio.play('heal');
          break;
        }
      }
    }

    if (game.room.portal) {
      // 晶界传送改为交互触发，不再自动进入
      for (const p of players) {
        if (!p.dead && G.dist(p.x, p.y, game.room.portal.x, game.room.portal.y) < 42) {
          p.nearPortal = true;
        }
      }
    }

    for (const p of players) p.interactHint = G.findInteract(game, p);
    updateCamera(game, dt);
    G.audio.focus = { x: game.room.x + game.room.w / 2, y: game.room.y + game.room.h / 2 };
    G.checkRoomClear(game);

    if (game.banner) {
      game.banner.t -= dt;
      if (game.banner.t <= 0) game.banner = null;
    }
    if (game.bossLockMsgT > 0) game.bossLockMsgT -= dt;
  }

  function updateWaves(game, dt) {
    const rm = game.room;
    if (rm.waveMax <= 1) return;
    if (rm.waveState === 'active' && !game.enemies.some(e => !e.dead) && rm.wave < rm.waveMax) {
      // 当前潮清完：先显示 1 秒落脚点，再开始刷下一潮
      rm.waveState = 'telegraph';
      rm.waveT = 1;
      rm.waveSpawns = (rm.waves[rm.wave] || []).map(e => ({ x: e.x, y: e.y }));
      game.banner = { text: '⚠ 第 ' + (rm.wave + 1) + '/' + rm.waveMax + ' 潮即将来袭!', t: 1.2 };
      G.audio.play('alert');
    } else if (rm.waveState === 'telegraph') {
      rm.waveT -= dt;
      if (rm.waveT <= 0) {
        // 落脚点展示 1 秒后，怪物在接下来 1 秒内逐个显形
        rm.waveState = 'spawning';
        rm.waveT = 1;
        const list = rm.waves[rm.wave] || [];
        for (const e of list) {
          e.pending = false;
          e.spawnIn = G.rand(0.3, 0.8);
          game.enemies.push(e);
        }
        rm.wave++;
      }
    } else if (rm.waveState === 'spawning') {
      rm.waveT -= dt;
      if (rm.waveT <= 0) rm.waveState = 'active';
    }
  }

  function updateAlly(ally, game, dt) {
    ally.t -= dt;
    ally.life -= dt;
    if (ally.t <= 0) {
      ally.t = 0.5;
      let best = null, bd = 420 * 420;
      for (const e of game.enemies) {
        if (e.dead) continue;
        const d = (e.x - ally.x) * (e.x - ally.x) + (e.y - ally.y) * (e.y - ally.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const ang = Math.atan2(best.y - ally.y, best.x - ally.x);
        game.bullets.push(new G.Bullet({
          x: ally.x, y: ally.y, vx: Math.cos(ang) * 460, vy: Math.sin(ang) * 460,
          dmg: ally.dmg, r: 3, color: '#fb923c', friendly: true
        }));
        G.audio.play('shoot');
      }
    }
  }

  function updateCamera(game, dt) {
    const p = game.cameraTarget || game.player;
    const r = game.room;
    // 房间大小不固定：对称 clamp，小房间也能正确居中
    const padX = 140, padY = 140;
    const minX = Math.min(r.x - padX, r.x + r.w - G.vw + padX);
    const maxX = Math.max(r.x - padX, r.x + r.w - G.vw + padX);
    const minY = Math.min(r.y - padY, r.y + r.h - G.vh + padY);
    const maxY = Math.max(r.y - padY, r.y + r.h - G.vh + padY);
    const tx = G.clamp(p.x - G.vw / 2, minX, maxX);
    const ty = G.clamp(p.y - G.vh / 2, minY, maxY);
    if (game.cam === undefined) game.cam = { x: tx, y: ty };
    game.cam.x = G.lerp(game.cam.x, tx, Math.min(1, 8 * dt));
    game.cam.y = G.lerp(game.cam.y, ty, Math.min(1, 8 * dt));
  }

  G.checkRoomClear = function (game) {
    if (!game.dungeon || G.state === 'siege') return;
    const d = game.dungeon;
    const room = game.room;
    if ((room.type === 'start' || room.type === 'monster' || room.type === 'elite' || room.type === 'boss') && !room.cleared && !room.enemies.some(e => !e.dead)) {
      room.cleared = true;
      game.banner = { text: '房间已清空，出口已开启! (沿着发光通道前进)', t: 2.5 };
      if (room.type !== 'boss') {
        game.talentChoices = G.rollTalents(3);
        game.talentOpen = true;
        G.audio.play('talent');
      }
    }
    if (!d.bossUnlocked) {
      const combat = d.rooms.filter(r => r.type === 'start' || r.type === 'monster' || r.type === 'elite');
      if (combat.every(r => r.cleared)) {
        d.bossUnlocked = true;
        game.bossLockMsg = 'BOSS 房间已解锁!';
        game.bossLockMsgT = 3;
        G.audio.play('unlock');
      }
    }
  };

  G.findInteract = function (game, player) {
    const p = player || game.player;
    if (game.room.portal && G.dist(p.x, p.y, game.room.portal.x, game.room.portal.y) < 60) return 'E 进入晶界传送';
    if (game.room.revive && !game.room.revive.used && G.dist(p.x, p.y, game.room.revive.x, game.room.revive.y) < 55) return 'E 靠近复活泉水';
    if (game.room.shop && !game.room.shop.dead && G.dist(p.x, p.y, game.room.shop.x, game.room.shop.y) < 50) return 'E 与商人交易';
    for (const c of game.room.chests) {
      if (!c.opened && G.dist(p.x, p.y, c.x, c.y) < 55) return '靠近打开宝箱';
    }
    for (const pk of game.pickups) {
      if (!pk.dead && pk.type === 'weapon' && G.dist(p.x, p.y, pk.x, pk.y) < 50) return 'E 拾取武器';
    }
    return null;
  };

  G.tryInteract = function (game, player) {
    const p = player || game.player;
    // 晶界传送：交互进入下一层
    if (game.room.portal && G.dist(p.x, p.y, game.room.portal.x, game.room.portal.y) < 60) {
      G.audio.focus = { x: game.room.portal.x, y: game.room.portal.y };
      G.audio.play('click');
      if (game.floor >= 3) finishRun(game, true);
      else nextFloor(game);
      return;
    }
    // 武器优先于商店
    for (const pk of game.pickups) {
      if (pk.dead || pk.type !== 'weapon') continue;
      if (G.dist(p.x, p.y, pk.x, pk.y) < 50) {
        pk.dead = true;
        const w = new G.Weapon(G.WEAPONS[pk.weaponId]);
        if (p.weapons.length < 2) {
          p.equip(w);
          G.FX.float(p.x, p.y - 30, '获得 ' + w.name, '#ffd54f', 16);
        } else {
          // 已有两把武器：替换当前武器，旧武器掉落在地上
          var oldW = p.weapons[p.cur];
          game.pickups.push(new G.Pickup({ type: 'weapon', x: p.x + G.rand(-20, 20), y: p.y + G.rand(-20, 20), weaponId: oldW.id }));
          p.weapons[p.cur] = w;
          G.FX.float(p.x, p.y - 30, '换装 ' + w.name + ' (旧武器掉落)', '#ffd54f', 16);
        }
        G.audio.play('pickup');
        return;
      }
    }
    if (game.room.shop && !game.room.shop.dead && G.dist(p.x, p.y, game.room.shop.x, game.room.shop.y) < 60) {
      p.shopOpen = true;
      G.audio.play('click');
      return;
    }
  };

  G.buyShopItem = function (game, item, player) {
    if (item.sold) return;
    const p = player || game.player;
    // 武器槽已满：先弹出确认，确认后才扣钱并替换当前武器
    if (item.kind === 'weapon' && p.weapons.length >= 2) {
      game.replaceConfirm = { item: item };
      G.audio.play('click');
      return;
    }
    G.doBuyShopItem(game, item, p);
  };

  G.doBuyShopItem = function (game, item, player) {
    if (item.sold) return;
    const p = player || game.player;
    if (p.coins < item.price) { G.audio.play('dry'); return; }
    p.coins -= item.price;
    item.sold = true;
    G.audio.play('buy');
    if (item.kind === 'weapon') {
      const w = new G.Weapon(G.WEAPONS[item.weapon.id]);
      if (p.weapons.length < 2) {
        p.equip(w);
        G.FX.float(p.x, p.y - 30, '获得 ' + w.name, '#ffd54f', 16);
      } else {
        // 已有两把武器：替换当前武器，旧武器掉落在地上
        var oldW = p.weapons[p.cur];
        game.pickups.push(new G.Pickup({ type: 'weapon', x: p.x + G.rand(-20, 20), y: p.y + G.rand(-20, 20), weaponId: oldW.id }));
        p.weapons[p.cur] = w;
        G.FX.float(p.x, p.y - 30, '换装 ' + w.name + ' (旧武器掉落)', '#ffd54f', 16);
      }
    } else if (item.type === 'hp') {
      p.hp = Math.min(p.maxHp, p.hp + 3);
      G.FX.float(p.x, p.y - 30, '+3 生命', '#4ade80', 16);
    } else if (item.type === 'energy') {
      p.energy = Math.min(p.maxEnergy, p.energy + 50);
      G.FX.float(p.x, p.y - 30, '+50 能量', '#38bdf8', 16);
    }
  };

  G.confirmReplaceWeapon = function (game) {
    const rc = game.replaceConfirm;
    if (!rc) return;
    game.replaceConfirm = null;
    if (G.Net && G.Net.active) { G.Net.sendBuy(rc.item); return; }
    G.doBuyShopItem(game, rc.item, game.player);
  };

  G.applyTalentChoice = function (game, t) {
    // Prevent stale talent-card clicks from stacking buffs (e.g. speed talent)
    if (!game.talentOpen) return;
    // 房主选择晶悟，效果作用于所有玩家
    const players = game.players || [game.player];
    for (const p of players) if (!p.dead) G.applyTalent(p, t);
    game.talentOpen = false;
    G.UI.clear();
    G.audio.play('pickup');
  };

  function newGameObject(c) {
    const game = {
      player: new G.Player(c),
      floor: 1, coins: 0, kills: 0, bossKills: 0,
      time: 0, bullets: [], enemies: [], pickups: [], allies: [],
      playerDead: false, playerDeadT: 0, finished: false, win: false, gemsEarned: 0,
      enemyHpMult: 1, enemySpeedMult: 1, infiniteEnergy: false,
      talentOpen: false, talentChoices: [], shopOpen: false, replaceConfirm: null,
      interactHint: null, banner: null, bossLockMsg: null, bossLockMsgT: 0,
      cam: { x: 0, y: 0 },
      players: null,
      cheatOpen: false,
      cheats: { god: false, ohk: false, infEnergy: false, infGold: false, speed: false, noCd: false }
    };
    game.players = [game.player];
    game.player.input = { local: true, keys: {}, mouse: { worldX: 0, worldY: 0, down: false, released: false, triggered: false } };
    return game;
  }

  // 服务器联机开局：创建多玩家局（2~4 人）
  G.startNetRun = function (playerDefs) {
    const defs = (playerDefs || []).slice(0, 4);
    if (!defs.length) return null;
    const firstChar = G.CHARACTERS.find(c => c.id === defs[0].charId) || G.CHARACTERS[0];
    const game = newGameObject(firstChar);
    game.players = [];
    for (const d of defs) {
      const c = G.CHARACTERS.find(x => x.id === d.charId) || G.CHARACTERS[0];
      const pl = new G.Player(c);
      pl.netId = d.id;
      pl.name = d.name;
      pl.input = { keys: {}, mouse: { worldX: 0, worldY: 0, down: false, released: false, triggered: false } };
      game.players.push(pl);
    }
    game.player = game.players[0];
    G.game = game;
    G.paused = false;
    G.FX.reset();
    startFloor(game);
    G.state = 'game';
    return game;
  };

  G.startRun = function (charId, useFactors) {
    const c = G.CHARACTERS.find(x => x.id === charId);
    if (!c) return;
    const game = newGameObject(c);
    G.game = game;
    G.paused = false;
    G.FX.reset();
    if (useFactors) {
      const n = Math.min(2, G.FACTORS.length);
      const chosen = G.shuffle(G.FACTORS.slice()).slice(0, n);
      game.factors = chosen;
      for (const f of chosen) f.apply(game, game.player);
    }
    startFloor(game);
    G.state = 'game';
  };

  G.startSiege = function (charId) {
    const s = G.Siege.init(charId);
    if (!s) return;
    G.game = s;
    G.paused = false;
    G.FX.reset();
    G.state = 'siege';
    // 初始喘息期
    s.restTimer = 10;
    s.phase = 'rest';
    G.Siege.generateShop(s);
  };

  function startFloor(game) {
    game.dungeon = G.generateFloor(game.floor);
    game.roomOf = game.dungeon.roomOf;
    game.room = game.dungeon.roomOf[0];
    G.loadRoom(game, game.room);
    G.FX.initAmbient(game.floor, game.room);
    G.audio.startBGM(game.floor);
    game.enemies = game.room.enemies.filter(e => !e.dead && !e.pending);
    game.allies = [];
    game.bullets = [];
    game.pickups = game.room.pickups;
    const players = game.players || [game.player];
    players.forEach((p, i) => {
      const ang = (i / Math.max(1, players.length)) * G.TAU + 0.5;
      const off = players.length > 1 ? 90 : 0;
      p.x = game.room.x + game.room.w / 2 + Math.cos(ang) * off;
      p.y = game.room.y + game.room.h / 2 + Math.sin(ang) * off;
      p.invuln = 1;
    });
    updateCamera(game, 0.05);
    game.banner = game.floor === 1 ? { text: '沿着发光通道前进', t: 2.5 } : { text: '第 ' + game.floor + ' 域', t: 2 };
  }

  function nextFloor(game) {
    game.floor++;
    startFloor(game);
    G.audio.play('level');
  }

  function finishRun(game, win) {
    if (game.finished) return;
    game.finished = true;
    game.win = win;
    const totalCoins = (game.players || [game.player]).reduce((sum, pl) => sum + (pl.coins || 0), 0);
    const gems = Math.round(totalCoins * 2 + game.floor * 30 + game.bossKills * 80 + (win ? 250 : 0));
    game.gemsEarned = gems;
    G.save.gems += gems;
    G.save.runs++;
    G.save.kills += game.kills;
    if (win) G.save.wins++;
    G.save.bestFloor = Math.max(G.save.bestFloor, game.floor);
    G.saveWrite();
    G.state = win ? 'victory' : 'gameover';
    G.audio.play(win ? 'win' : 'lose');
  }

  function draw() {
    // 每帧先清空按钮热区：各界面绘制时才重新注册自己的按钮，
    // 避免关闭菜单/暂停/商店等界面后残留的按钮在游戏中继续响应点击。
    G.UI.clear();
    // 先用背景色填满整个画布，消除手机端横屏宽于 16:9 时的黑边
    ctx.save();
    ctx.setTransform(G.view.dpr, 0, 0, G.view.dpr, 0, 0);
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, canvas.width / G.view.dpr, canvas.height / G.view.dpr);
    ctx.restore();

    ctx.save();
    ctx.setTransform(
      G.view.dpr * G.view.scale, 0, 0,
      G.view.dpr * G.view.scale,
      G.view.offX * G.view.dpr, G.view.offY * G.view.dpr
    );
    ctx.beginPath();
    ctx.rect(0, 0, G.vw, G.vh);
    ctx.clip();
    if (G.state === 'game' || G.state === 'netgame' || G.state === 'gameover' || G.state === 'victory' || G.state === 'siege') {
      if (G.game) {
        const isSiegeGame = G.state === 'siege' || (G.game.wave !== undefined && G.game.crystal);
        var uiX = Math.max(0, (G.vw - G.W) / 2);
        if (isSiegeGame) {
          G.Siege.draw();
          if (G.paused) {
            ctx.save();
            if (uiX > 0) ctx.translate(uiX, 0);
            G.UI.drawPause(G.game);
            ctx.restore();
          }
        } else {
          drawGame(G.game);
        }
        ctx.save();
        if (uiX > 0) ctx.translate(uiX, 0);
        if (G.state === 'gameover') G.UI.drawGameOver(G.game);
        else if (G.state === 'victory') G.UI.drawVictory(G.game);
        ctx.restore();
      }
    } else {
      var _uiX = Math.max(0, (G.vw - G.W) / 2);
      ctx.save();
      if (_uiX > 0) ctx.translate(_uiX, 0);
      if (G.state === 'menu') {
        G.UI.drawMenu();
      } else if (G.state === 'charselect' || G.state === 'siegechar') {
        G.UI.drawCharSelect();
      } else if (G.state === 'lobby') {
        G.UI.drawLobbyBg();
      } else if (G.state === 'gallery') {
        G.UI.drawGallery();
      }
      ctx.restore();
    }
    if (G.FX.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (G.FX.flash * 0.35) + ')';
      ctx.fillRect(0, 0, G.vw, G.vh);
    }
    ctx.restore();
  }

  function drawGame(game) {
    const ctx = G.ctx;
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, G.vw, G.vh);
    ctx.save();
    ctx.translate(-Math.round(game.cam.x), -Math.round(game.cam.y));
    G.UI.drawRoom(game);
    ctx.restore();
    // 宽屏时 UI 居中
    var uiX = Math.max(0, (G.vw - G.W) / 2);
    ctx.save();
    if (uiX > 0) ctx.translate(uiX, 0);
    G.UI.drawHUD(game);
    if (game.talentOpen) G.UI.drawTalent(game);
    if (game.player && game.player.shopOpen) G.UI.drawShop(game);
    if (game.cheatOpen) G.UI.drawCheatMenu(game);
    if (G.netTalentWait) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, G.W, G.H);
      G.text(ctx, '⏳ 房主正在选择晶悟…', G.W / 2, G.H / 2, 30, '#ffd54f', 'center', true);
    }
    if (G.paused) G.UI.drawPause(game);
    ctx.restore();
  }

  G.debugStep = function (dt) {
    if (G.state === 'game' && G.game && !G.game.finished && !G.paused && !G.game.talentOpen) {
      updateGame(G.game, dt);
    }
  };

  if (typeof document !== 'undefined') {
    const el = document.getElementById ? document.getElementById('game') : null;
    if (el) init();
  }
})();
