(function () {
  const G = window.G;

  G.SPACING_X = 1500;
  G.SPACING_Y = 1000;
  G.ROOM_MIN_W = 800;
  G.ROOM_MAX_W = 1400;
  G.ROOM_MIN_H = 480;
  G.ROOM_MAX_H = 900;
  const GW = 4, GH = 3;

  function connect(a, b, doors) {
    let dir, key;
    if (b.gx === a.gx + 1) { dir = 'right'; key = a.gx + ',' + a.gy + ',right'; }
    else if (b.gx === a.gx - 1) { dir = 'left'; key = a.gx + ',' + a.gy + ',left'; }
    else if (b.gy === a.gy + 1) { dir = 'down'; key = a.gx + ',' + a.gy + ',down'; }
    else { dir = 'up'; key = a.gx + ',' + a.gy + ',up'; }
    doors[key] = b.id;
    let key2;
    if (dir === 'right') key2 = b.gx + ',' + b.gy + ',left';
    else if (dir === 'left') key2 = b.gx + ',' + b.gy + ',right';
    else if (dir === 'down') key2 = b.gx + ',' + b.gy + ',up';
    else key2 = b.gx + ',' + b.gy + ',down';
    doors[key2] = a.id;
  }

  function hasDoor(a, b, doors) {
    const dir = a.gx === b.gx + 1 ? 'left' : a.gx === b.gx - 1 ? 'right' : a.gy === b.gy + 1 ? 'up' : 'down';
    return !!doors[a.gx + ',' + a.gy + ',' + dir];
  }

  function buildFloor(floor) {
    // 每层房间总数 + 奖励房数量
    const totalRooms = floor === 1 ? G.randint(6, 8) : floor === 2 ? G.randint(8, 10) : G.randint(9, 12);
    const rewardCount = floor === 1 ? G.randint(1, 2) : G.randint(2, 3);
    const total = totalRooms;
    const cells = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) cells.push({ gx: x, gy: y, id: y * GW + x, active: false });

    const doors = {};
    const activeIds = new Set([0]);
    const visited = new Set([0]);
    const stack = [0];
    while (visited.size < total) {
      let cur = stack.length ? stack[stack.length - 1] : null;
      if (cur === null) {
        // 兜底：从已访问格子重新生长，保证全图连通
        const roots = cells.filter(c => visited.has(c.id));
        stack.push(G.pick(roots));
        cur = stack[stack.length - 1];
      }
      const c = cells[cur];
      const nbs = [];
      if (c.gx > 0) nbs.push(cells[cur - 1]);
      if (c.gx < GW - 1) nbs.push(cells[cur + 1]);
      if (c.gy > 0) nbs.push(cells[cur - GW]);
      if (c.gy < GH - 1) nbs.push(cells[cur + GW]);
      const un = G.shuffle(nbs.filter(n => !visited.has(n.id)));
      if (!un.length) { stack.pop(); continue; }
      const n = un[0];
      visited.add(n.id);
      activeIds.add(n.id);
      stack.push(n.id);
      connect(c, n, doors);
    }
    for (const c of cells) c.active = activeIds.has(c.id);
    for (const c of cells) {
      if (!c.active) continue;
      const nbs = [];
      if (c.gx < GW - 1) nbs.push(cells[c.id + 1]);
      if (c.gy < GH - 1) nbs.push(cells[c.id + GW]);
      for (const n of nbs) {
        if (n.active && Math.random() < 0.15 && !hasDoor(c, n, doors)) connect(c, n, doors);
      }
    }

    let bossCell = cells[0], bd = -1;
    for (const c of cells) {
      if (!c.active) continue;
      const d = Math.abs(c.gx) + Math.abs(c.gy);
      if (d > bd) { bd = d; bossCell = c; }
    }

    const roomOf = {};
    const rooms = cells.filter(c => c.active).map(c => {
      const r = {
        gx: c.gx, gy: c.gy, id: c.id,
        x: c.gx * G.SPACING_X, y: c.gy * G.SPACING_Y,
        // 房间大小随机：不固定，但不会超大/超小
        w: Math.round(G.rand(G.ROOM_MIN_W, G.ROOM_MAX_W) / 20) * 20,
        h: Math.round(G.rand(G.ROOM_MIN_H, G.ROOM_MAX_H) / 20) * 20,
        type: 'monster', cleared: false, visited: false, loaded: false,
        doors: { up: null, down: null, left: null, right: null },
        obstacles: [], pickups: [], chests: [], enemies: [], shop: null, portal: null,
        waves: [], wave: 1, waveMax: 1, waveState: 'active', waveT: 0, waveSpawns: []
      };
      roomOf[c.id] = r;
      return r;
    });

    rooms[0].type = 'start';
    rooms[0].cleared = true;
    roomOf[bossCell.id].type = 'boss';

    const pool = rooms.filter(r => r.type === 'monster');
    // 奖励房间：从商店/泉水/箱子中随机选取，不重复
    const rewardTypes = ['shop', 'treasure', 'revive'];
    const chosenRewards = G.shuffle(rewardTypes).slice(0, rewardCount);
    const rw = G.shuffle(pool.slice());
    for (let i = 0; i < rewardCount; i++) {
      const r = rw[i];
      r.type = chosenRewards[i];
      r.cleared = true;
      pool.splice(pool.indexOf(r), 1);
    }
    // One elite room when there are enough combat rooms
    if (pool.length >= 3) {
      const el = G.pick(pool);
      el.type = 'elite';
      pool.splice(pool.indexOf(el), 1);
    }

    for (const key in doors) {
      const parts = key.split(',');
      const gx = +parts[0], gy = +parts[1], dir = parts[2];
      const r = roomOf[gy * GW + gx];
      const to = roomOf[doors[key]];
      if (!r || !to) continue;
      // 门锚点取两侧房间中心的平均值，房间大小不一时走廊也对齐
      const dx = (r.x + r.w / 2 + to.x + to.w / 2) / 2;
      const dy = (r.y + r.h / 2 + to.y + to.h / 2) / 2;
      r.doors[dir] = {
        to: to.id, open: r.cleared,
        dx: dir === 'up' || dir === 'down' ? dx : null,
        dy: dir === 'left' || dir === 'right' ? dy : null
      };
    }

    for (const r of rooms) {
      if (r.type === 'boss' || r.type === 'revive') continue;
      const n = (r.type === 'shop' || r.type === 'treasure') ? 2 : G.randint(2, 4);
      for (let i = 0; i < n; i++) {
        const ox = r.x + G.rand(150, r.w - 150), oy = r.y + G.rand(130, r.h - 130);
        if (G.dist(ox, oy, r.x + r.w / 2, r.y + r.h / 2) < 160) continue;
        r.obstacles.push({ x: ox, y: oy, r: 20, hp: 18, dead: false });
      }
    }

    return { rooms, roomOf, gridW: GW, gridH: GH, bossCell: bossCell.id, bossUnlocked: false, floor };
  };

  function isFloorReachable(d) {
  // Boss door stays locked until every combat room is cleared.
  // If any non-boss room is only reachable through the boss room, the floor would deadlock.
  const startId = d.roomOf[0].id;
  const seen = new Set([startId]);
  const q = [startId];
  while (q.length) {
    const cur = q.pop();
    const r = d.roomOf[cur];
    for (const side of ['up', 'down', 'left', 'right']) {
      const dr = r.doors[side];
      if (!dr) continue;
      const to = d.roomOf[dr.to];
      if (!to || to.type === 'boss') continue;
      if (seen.has(dr.to)) continue;
      seen.add(dr.to);
      q.push(dr.to);
    }
  }
  return d.rooms.every(r => r.type === 'boss' || seen.has(r.id));
}

G.generateFloor = function (floor) {
  // Regenerate until every non-boss room is reachable without passing the boss room.
  for (let attempt = 0; attempt < 100; attempt++) {
    const d = buildFloor(floor);
    if (isFloorReachable(d)) return d;
  }
  return buildFloor(floor);
};
G.loadRoom = function (game, room) {
    if (room.loaded) { room.visited = true; return; }
    room.loaded = true;
    room.visited = true;
    const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
    if (room.type === 'shop' || room.type === 'treasure') room.cleared = true;
    if (room.type === 'shop') {
      // 武器商品必须带 price，否则购买时金币会变成 NaN
      const w1 = G.pick(G.shopWeapons()), w2 = G.pick(G.shopWeapons());
      const stock = [
        { kind: 'weapon', weapon: w1, price: w1.price },
        { kind: 'weapon', weapon: w2, price: w2.price },
        { kind: 'potion', type: 'hp', name: '生命药水', price: 15, desc: '回复3生命' },
        { kind: 'potion', type: 'energy', name: '能量药水', price: 10, desc: '回复50能量' }
      ];
      room.shop = { x: cx + 200, y: cy, stock: stock, dead: false };
    } else if (room.type === 'treasure') {
      room.chests.push(new G.Chest({ x: cx, y: cy, big: false }));
    } else if (room.type === 'revive') {
      // 晶泉房：中央泉水，触碰回复少量生命/能量（每房一次）
      room.revive = { x: cx, y: cy, used: false };
    } else if (room.type === 'boss') {
      const bossId = G.BOSS_ORDER[game.floor - 1];
      const boss = G.makeBoss(bossId, cx, cy, game);
      room.bossName = G.BOSSES[bossId].name;
      room.enemies.push(boss);
    } else if (room.type === 'start') {
      // Start room: no monsters, only guides the player onward
    } else {
      // 怪物数量：每潮 5~20 只随层数递增，1~3 潮
      let count = G.clamp(5 + game.floor * 5, 5, 20);
      if (room.type === 'elite') count += 3;
      room.waveMax = G.randint(1, 3);
      const base = Math.floor(count / room.waveMax);
      const rem = count % room.waveMax;
      const types = ['slime', 'slime', 'shooter', 'bat', 'turret', 'mushroom', 'goblin', 'plant', 'beetle'];
      if (game.floor >= 2) types.push('brute', 'ghost', 'skeleton', 'ice_beast', 'snowman', 'caveman', 'bat_swarm', 'shadow', 'ghost_mage');
      if (game.floor >= 3) types.push('mage', 'armor_knight', 'crossbowman', 'necromancer', 'bomber', 'golem', 'dark_priest', 'hellhound', 'bomb_spider', 'spearman', 'boss_guard');
      let created = 0;
      for (let wi = 0; wi < room.waveMax; wi++) {
        const size = base + (wi >= room.waveMax - rem ? 1 : 0);
        const list = [];
        for (let i = 0; i < size; i++) {
          const elite = room.type === 'elite' ? created === 0 : (game.floor >= 2 && Math.random() < 0.15);
          const type = room.type === 'elite' ? G.pick(['slime', 'shooter', 'bat', 'turret', 'skeleton', 'brute']) : G.pick(types);
          // 生成点避开障碍物（木箱），避免怪物卡在箱子里
          let ex, ey, tries = 0;
          do {
            ex = room.x + G.rand(120, room.w - 120);
            ey = room.y + G.rand(110, room.h - 110);
            tries++;
          } while (tries < 40 && room.obstacles.some(ob => !ob.dead && G.dist(ex, ey, ob.x, ob.y) < 64));
          const e = G.makeEnemy(type, ex, ey, game, elite);
          e.wave = wi + 1;
          e.pending = wi > 0;
          list.push(e);
          created++;
        }
        room.waves.push(list);
      }
      for (const list of room.waves) for (const e of list) room.enemies.push(e);
    }
  };

  G.enterRoom = function (game, roomId, player) {
    const room = game.roomOf[roomId];
    if (room === game.room) return;
    G.loadRoom(game, room);
    game.room = room;
    G.FX.initAmbient(game.floor, room);
    // 只激活当前蚀潮的怪物
    game.enemies = room.enemies.filter(e => !e.dead && !e.pending);
    game.bullets = [];
    game.allies = [];
    game.pickups = room.pickups;
    const entrant = player || game.player;
    // 全员检查壁垒晶悟，本房间格挡次数生效
    // 玩家进入房间，重置护甲恢复计时
    for (const p of (game.players || [game.player])) p.armorRecoverDelay = 5;
    G.checkRoomClear(game);// 合作模式：全队一起进入新房间，避免玩家被落在不同房间
    if (game.players && game.players.length > 1) {
      let idx = 0;
      const offs = [-70, 70, -140];
      for (const p of game.players) {
        if (p === entrant || p.dead) continue;
        p.x = G.clamp(entrant.x + offs[idx % offs.length], room.x + 20, room.x + room.w - 20);
        p.y = G.clamp(entrant.y + 60, room.y + 20, room.y + room.h - 20);
        idx++;
      }
    }
    const names = { start: '出生点', monster: '普通房间', elite: '精英房间', shop: '商店', treasure: '宝箱房', revive: '晶泉房', boss: 'BOSS房间' };
    game.banner = { text: names[room.type] || '房间', t: 1.6 };
    if (room.type === 'boss') game.banner.text = 'BOSS: ' + room.bossName;
    G.audio.play('level');
  };

  G.roomTransition = function (game, p) {
    const r = game.room;
    const dz = 80;
    const canGo = (d) => d && r.cleared && (game.roomOf[d.to].type !== 'boss' || game.dungeon.bossUnlocked);
    // 用门锚点对齐，房间大小不一时也能正确进出
    if (p.x < r.x + 20) {
      const d = r.doors.left;
      if (d && Math.abs(p.y - d.dy) < dz && canGo(d)) { p.x = game.roomOf[d.to].x + game.roomOf[d.to].w - 40; p.y = d.dy; G.enterRoom(game, d.to, p); }
      else p.x = r.x + 20;
    } else if (p.x > r.x + r.w - 20) {
      const d = r.doors.right;
      if (d && Math.abs(p.y - d.dy) < dz && canGo(d)) { p.x = game.roomOf[d.to].x + 40; p.y = d.dy; G.enterRoom(game, d.to, p); }
      else p.x = r.x + r.w - 20;
    } else if (p.y < r.y + 20) {
      const d = r.doors.up;
      if (d && Math.abs(p.x - d.dx) < dz && canGo(d)) { p.y = game.roomOf[d.to].y + game.roomOf[d.to].h - 40; p.x = d.dx; G.enterRoom(game, d.to, p); }
      else p.y = r.y + 20;
    } else if (p.y > r.y + r.h - 20) {
      const d = r.doors.down;
      if (d && Math.abs(p.x - d.dx) < dz && canGo(d)) { p.y = game.roomOf[d.to].y + 40; p.x = d.dx; G.enterRoom(game, d.to, p); }
      else p.y = r.y + r.h - 20;
    }
  };
})();
