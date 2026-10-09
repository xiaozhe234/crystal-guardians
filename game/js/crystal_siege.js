(function () {
  const G = window.G;

  // ==================== 常量配置 ====================
  // 十字地形地图
  const MAP_W = 2400, MAP_H = 1800;
  const HALL_W = 360; // 通道宽度
  // 元晶位置：左端
  const CRYSTAL_X = 280, CRYSTAL_Y = MAP_H / 2;
  const CRYSTAL_R = 32;
  const CRYSTAL_NO_BUILD_R = 180;
  const CRYSTAL_MAX_HP = 80;
  // 十字交汇中心
  const CROSS_CX = MAP_W * 0.55, CROSS_CY = MAP_H / 2;
  // 墙壁矩形（不可通行、不可建造）
  const WALL_THICK = 40;
  const WALLS = (function () {
    const hw = HALL_W / 2;
    const walls = [
      // 左上区域
      { x: 0, y: 0, w: CROSS_CX - hw, h: CROSS_CY - hw },
      // 右上区域
      { x: CROSS_CX + hw, y: 0, w: MAP_W - (CROSS_CX + hw), h: CROSS_CY - hw },
      // 左下区域
      { x: 0, y: CROSS_CY + hw, w: CROSS_CX - hw, h: MAP_H - (CROSS_CY + hw) },
      // 右下区域
      { x: CROSS_CX + hw, y: CROSS_CY + hw, w: MAP_W - (CROSS_CX + hw), h: MAP_H - (CROSS_CY + hw) },
      // 左端上方（元晶区上方墙）
      { x: 0, y: 0, w: CRYSTAL_X - CRYSTAL_NO_BUILD_R - 20, h: CROSS_CY - hw },
      // 左端下方（元晶区下方墙）
      { x: 0, y: CROSS_CY + hw, w: CRYSTAL_X - CRYSTAL_NO_BUILD_R - 20, h: MAP_H - (CROSS_CY + hw) },
      // 地图边界围墙（上下左右）
      { x: 0, y: 0, w: MAP_W, h: WALL_THICK },
      { x: 0, y: MAP_H - WALL_THICK, w: MAP_W, h: WALL_THICK },
      { x: 0, y: 0, w: WALL_THICK, h: MAP_H },
      { x: MAP_W - WALL_THICK, y: 0, w: WALL_THICK, h: MAP_H }
    ];
    return walls;
  })();
  // 判断点是否在墙内
  function inWall(x, y, pad) {
    pad = pad || 0;
    for (const w of WALLS) {
      if (x >= w.x - pad && x <= w.x + w.w + pad && y >= w.y - pad && y <= w.y + w.h + pad) return true;
    }
    return false;
  }
  // 两点连线是否被路障（木质/钢铁路障）遮挡 —— 用于长枪/远程攻击的视线判定
  function barrierBlocks(s, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    const steps = Math.max(3, Math.ceil(dist / 12));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = x1 + dx * t, py = y1 + dy * t;
      for (const d of s._barriers || []) {
        if (d.hp <= 0) continue;
        if (G.dist(px, py, d.x, d.y) < d.r) return true;
      }
    }
    return false;
  }
  // 怪物出生点：右端、上端、下端（远离边界墙，确保在通道内）
  const SPAWN_POINTS = [
    { x: MAP_W - 120, y: CROSS_CY, dir: 'right' },
    { x: CROSS_CX, y: 120, dir: 'top' },
    { x: CROSS_CX, y: MAP_H - 120, dir: 'bottom' }
  ];

  // 蚀潮怪物数量
  function waveMonsterCount(wave) {
    if (wave <= 5) return G.randint(12, 20);
    if (wave <= 10) return G.randint(24, 40);
    if (wave <= 20) return G.randint(40, 70);
    if (wave <= 40) return G.randint(70, 120);
    if (wave <= 60) return G.randint(120, 180);
    return G.randint(180, 300);
  }

  // 怪物属性倍率
  function waveStatMult(wave) {
    if (wave <= 5) return { hp: 1.0, dmg: 1.0, speed: 1.0 };
    if (wave <= 10) return { hp: 1.3, dmg: 1.2, speed: 1.05 };
    if (wave <= 20) return { hp: 1.8, dmg: 1.5, speed: 1.1 };
    if (wave <= 40) return { hp: 2.8, dmg: 2.0, speed: 1.15 };
    if (wave <= 60) return { hp: 4.5, dmg: 3.0, speed: 1.2 };
    return { hp: 7.0 + (wave - 61) * 0.3, dmg: 4.5 + (wave - 61) * 0.2, speed: 1.3 };
  }

  // 喘息期时长
  function restDuration(wave) {
    return 60;
  }

  // 晶防装置上限
  function deviceLimit(wave) {
    if (wave < 10) return 6;
    if (wave < 20) return 8;
    if (wave < 30) return 10;
    if (wave < 40) return 12;
    if (wave < 50) return 15;
    if (wave < 60) return 18;
    return 20;
  }

  // 每潮生成间隔
  function spawnInterval(wave) {
    if (wave <= 5) return 0.8;
    if (wave <= 10) return 0.6;
    if (wave <= 20) return 0.4;
    if (wave <= 40) return 0.3;
    return 0.2;
  }

  // 品质对应的蚀潮
  function qualityForWave(wave) {
    if (wave <= 10) return 'normal';
    if (wave <= 30) return 'rare';
    if (wave <= 60) return 'epic';
    return 'legendary';
  }

  // 品质中文名（仅用于显示，逻辑判断仍用英文 key）
  const QUALITY_NAMES = { normal: '普通', rare: '稀有', epic: '史诗', legendary: '传说' };

  // 基础怪物类型池（可用于元晶模式的标准怪物）
  const BASE_MONSTER_POOL = ['slime', 'bat', 'shooter', 'skeleton', 'ghost', 'mushroom', 'goblin', 'beetle'];
  // 分蚀潮解锁的怪物池
  const MONSTER_TIERS = [
    { minWave: 1, types: ['slime', 'bat', 'shooter', 'skeleton', 'ghost', 'mushroom', 'goblin', 'beetle'] },
    { minWave: 4, types: ['turret', 'brute', 'mage'] },
    { minWave: 7, types: ['bomb_spider', 'ice_beast', 'snowman', 'caveman'] },
    { minWave: 10, types: ['bat_swarm', 'shadow', 'ghost_mage', 'raider'] },
    { minWave: 14, types: ['armor_knight', 'crossbowman', 'bomber', 'spearman'] },
    { minWave: 18, types: ['necromancer', 'golem', 'dark_priest', 'hellhound', 'flyer', 'summoner'] },
    { minWave: 30, types: ['boss_guard'] }
  ];
  // 特殊怪物解锁蚀潮
  // 已由 MONSTER_TIERS 替代，保留引用以兼容

  // Boss 类型轮换
  const BOSS_TYPES = ['slimeking', 'turretboss', 'darkknight'];

  // ==================== 晶防装置定义（类型+等级，等级即升级路径） ====================
  // 同类晶防装置融合为一个类型，Ⅰ/Ⅱ/Ⅲ级逐级强化；能量发生器不参与升级
  const DEVICES = {
    // 路障：木质→钢铁→尖刺
    barrier: {
      name: '路障', color: '#8B4513',
      levels: [
        { tier: 1, name: '木质路障', cost: 10, hp: 90, r: 18 },
        { tier: 2, name: '钢铁路障', cost: 30, hp: 220, r: 20 },
        { tier: 3, name: '尖刺路障', cost: 60, hp: 380, r: 22, spikeDmg: 4 },
        { tier: 4, name: '玄铁壁垒', cost: 110, hp: 600, r: 24, spikeDmg: 6 },
        { tier: 5, name: '龙鳞壁垒', cost: 180, hp: 900, r: 26, spikeDmg: 9 },
        { tier: 6, name: '神域壁垒', cost: 280, hp: 1400, r: 28, spikeDmg: 13 }
      ]
    },
    // 能量发生器（无升级）
    energy_gen: {
      name: '能量发生器', color: '#38bdf8',
      levels: [
        { tier: 1, name: '能量发生器', cost: 35, hp: 25, r: 16, auraRange: 200, auraEnergy: 3 }
      ]
    },
    // 机枪炮台：机枪→重机枪→重型机枪
    machine_gun: {
      name: '机枪炮台', color: '#94a3b8',
      levels: [
        { tier: 1, name: '机枪炮台', cost: 40, hp: 45, r: 16, range: 350, dmg: 5, rate: 2 },
        { tier: 2, name: '重机枪炮台', cost: 90, hp: 80, r: 17, range: 380, dmg: 8, rate: 4 },
        { tier: 3, name: '重型机枪炮台', cost: 130, hp: 100, r: 18, range: 420, dmg: 7, rate: 4 },
        { tier: 4, name: '复仇者机炮', cost: 200, hp: 130, r: 19, range: 460, dmg: 12, rate: 5 },
        { tier: 5, name: '毁灭者机炮', cost: 300, hp: 170, r: 20, range: 500, dmg: 16, rate: 6 },
        { tier: 6, name: '裁决者机炮', cost: 420, hp: 220, r: 21, range: 540, dmg: 20, rate: 7 }
      ]
    },
    // 火焰炮台：火焰→喷火塔→烈焰喷火塔
    flame_turret: {
      name: '火焰炮台', color: '#f97316',
      levels: [
        { tier: 1, name: '火焰炮台', cost: 60, hp: 50, r: 16, range: 280, dmg: 4, rate: 0.8, burn: true },
        { tier: 2, name: '喷火塔', cost: 110, hp: 65, r: 17, range: 300, dmg: 6, rate: 1.2, burn: true },
        { tier: 3, name: '烈焰喷火塔', cost: 150, hp: 80, r: 18, range: 320, dmg: 6, rate: 1.2, burn: true },
        { tier: 4, name: '焚天火塔', cost: 220, hp: 110, r: 19, range: 340, dmg: 9, rate: 1.5, burn: true },
        { tier: 5, name: '炼狱火塔', cost: 320, hp: 140, r: 20, range: 360, dmg: 11, rate: 1.8, burn: true },
        { tier: 6, name: '九幽火塔', cost: 450, hp: 180, r: 21, range: 380, dmg: 14, rate: 2.2, burn: true }
      ]
    },
    // 治疗装置：图腾→圣坛→圣坛Ⅲ
    heal_totem: {
      name: '治疗装置', color: '#4ade80',
      levels: [
        { tier: 1, name: '治疗图腾', cost: 70, hp: 40, r: 16, auraRange: 180, auraHeal: 0.5 },
        { tier: 2, name: '生命圣坛', cost: 125, hp: 55, r: 18, auraRange: 220, auraHeal: 1.2 },
        { tier: 3, name: '生命圣坛Ⅲ', cost: 170, hp: 70, r: 19, auraRange: 260, auraHeal: 2.0 },
        { tier: 4, name: '永恒圣殿', cost: 260, hp: 95, r: 20, auraRange: 300, auraHeal: 3.0 },
        { tier: 5, name: '神谕圣殿', cost: 380, hp: 120, r: 21, auraRange: 340, auraHeal: 4.5 },
        { tier: 6, name: '创世圣殿', cost: 520, hp: 160, r: 22, auraRange: 380, auraHeal: 6.5 }
      ]
    },
    // 电磁装置：脉冲→核心→核心Ⅲ
    emp_pulse: {
      name: '电磁装置', color: '#a78bfa',
      levels: [
        { tier: 1, name: '电磁脉冲', cost: 85, hp: 40, r: 16, empRange: 250, empSlow: 0.4, empCd: 4 },
        { tier: 2, name: '电磁核心', cost: 150, hp: 60, r: 18, empRange: 320, empSlow: 0.55, empCd: 3 },
        { tier: 3, name: '电磁核心Ⅲ', cost: 200, hp: 75, r: 19, empRange: 360, empSlow: 0.65, empCd: 2.5 },
        { tier: 4, name: '湮灭核心', cost: 300, hp: 100, r: 20, empRange: 400, empSlow: 0.72, empCd: 2 },
        { tier: 5, name: '混沌核心', cost: 420, hp: 130, r: 21, empRange: 440, empSlow: 0.78, empCd: 1.6 },
        { tier: 6, name: '神罚核心', cost: 560, hp: 170, r: 22, empRange: 480, empSlow: 0.82, empCd: 1.3 }
      ]
    }
  };

  // ==================== 晶防装置等级定义（等级=升级路径） ====================
  const DEVICE_TIERS = {
    1: { name: 'Ⅰ', unlockWave: 0 },
    2: { name: 'Ⅱ', unlockWave: 5 },
    3: { name: 'Ⅲ', unlockWave: 10 },
    4: { name: 'Ⅳ', unlockWave: 20 },
    5: { name: 'Ⅴ', unlockWave: 30 },
    6: { name: 'Ⅵ', unlockWave: 40 }
  };
  // 取类型的某个等级配置
  function deviceLevel(dd, tier) {
    return dd.levels.find(l => l.tier === tier) || dd.levels[0];
  }
  // 类型在当前蚀潮可见的等级列表：始终显示连续3级窗口
  // 窗口从Ⅰ开始推进：初期Ⅰ/Ⅱ/Ⅲ，解锁Ⅳ后Ⅰ消失变为Ⅱ/Ⅲ/Ⅳ，解锁Ⅴ后Ⅱ消失……
  function tierList(dd, wave) {
    if (dd.auraEnergy) return [1]; // 能量发生器不参与升级
    let top = 1;
    for (const l of dd.levels) {
      if ((wave || 0) >= DEVICE_TIERS[l.tier].unlockWave) top = l.tier;
      else break;
    }
    const lo = Math.max(1, top - 2);
    const out = [];
    for (let t = lo; t <= Math.min(6, lo + 2); t++) {
      if (dd.levels.some(l => l.tier === t)) out.push(t);
    }
    return out;
  }
  // 晶防装置按等级的价格
  function deviceCost(dd, tier) {
    return deviceLevel(dd, tier).cost;
  }
  // 晶防装置按等级的属性（面板展示与放置共用）
  function deviceStats(dd, tier) {
    return Object.assign({}, deviceLevel(dd, tier));
  }

  // ==================== 永久属性强化 ====================
  // 费用公式: Math.round(baseCost * Math.pow(costMult, level))
  // dmg / fireRate / petRate 为乘算/缩算加成，在 startWave 中与临时增益叠加应用
  const PERM_UPGRADES = [
    { id: 'maxHp',       name: '生命强化', icon: '❤️', desc: '最大生命 +5',       baseCost: 30, costMult: 1.35, max: 20, unlockWave: 1,
      apply(p) { p.maxHp += 5; p.hp = Math.min(p.maxHp, p.hp + 5); } },
    { id: 'maxArmor',    name: '护甲强化', icon: '🛡️', desc: '最大护甲 +2',       baseCost: 35, costMult: 1.40, max: 15, unlockWave: 1,
      apply(p) { p.maxArmor += 2; p.armor = Math.min(p.maxArmor, p.armor + 2); } },
    { id: 'maxEnergy',   name: '能量强化', icon: '🔵', desc: '最大能量 +20',      baseCost: 25, costMult: 1.30, max: 15, unlockWave: 1,
      apply(p) { p.maxEnergy += 20; p.energy = Math.min(p.maxEnergy, p.energy + 20); } },
    { id: 'dmg',         name: '伤害强化', icon: '⚔️', desc: '伤害加成 +10%',      baseCost: 40, costMult: 1.45, max: 15, unlockWave: 5 },
    { id: 'crit',        name: '暴击强化', icon: '🎯', desc: '暴击率 +5%',         baseCost: 45, costMult: 1.50, max: 15, unlockWave: 10,
      apply(p) { p.crit += 5; } },
    { id: 'fireRate',    name: '射速强化', icon: '⚡', desc: '射速 +8%',           baseCost: 40, costMult: 1.45, max: 10, unlockWave: 5 },
    { id: 'petDmg',      name: '宠物伤害', icon: '🐾', desc: '宠物攻击伤害 +2',    baseCost: 30, costMult: 1.40, max: 15, unlockWave: 5,
      apply(p) { p.petDmg += 2; } },
    { id: 'petRate',     name: '宠物攻速', icon: '⚡🐕', desc: '宠物攻击间隔缩短 8%', baseCost: 35, costMult: 1.45, max: 10, unlockWave: 10 }
  ];

  function upgradeCost(upg, level) {
    return Math.round(upg.baseCost * Math.pow(upg.costMult, level));
  }

  // ==================== 临时增益（购买→下一潮生效，条件型运行时检查） ====================
  // 4 大类别：atk输出 / def生存 / eco经济 / dev晶防装置协同（同类互斥，每潮最多买1个）
  const BUFF_CATS = { atk: '输出', def: '生存', eco: '经济', dev: '晶防装置协同' };

  const BUFFS = [
    // 🗡️ 输出类
    { id: 'fury', cat: 'atk', name: '怒击', icon: '🗡️',
      desc: '伤害+50%（HP≤50%时生效）',
      cond(s) { return s.player && !s.player.dead && s.player.hp <= s.player.maxHp * 0.5; },
      fields: { dmgMult: 0.5 } },
    { id: 'frenzy', cat: 'atk', name: '狂热', icon: '🔥',
      desc: '攻速+60%（自身200px内≥3个敌人时生效）',
      cond(s) { if (!s.player) return false; let n = 0; for (const e of s.enemies) { if (!e.dead && !e.spawnIn && G.dist(e.x, e.y, s.player.x, s.player.y) < 200 && ++n >= 3) return true; } return false; },
      fields: { fireRateMult: 0.6 } },
    { id: 'armor_pierce', cat: 'atk', name: '穿甲弹', icon: '🎯',
      desc: '子弹穿透+2，命中减速30% 1秒（仅对精英/Boss）',
      fields: { armorPierce: 1 } },
    { id: 'lifesteal', cat: 'atk', name: '嗜血', icon: '🩸',
      desc: '造成伤害的10%吸血（连续命中≥5次后生效，换目标重置）',
      fields: { lifesteal: 1 } },
    // 🛡️ 生存类
    { id: 'cover', cat: 'def', name: '掩体模式', icon: '🛡️',
      desc: '远程伤害-80%（站在晶防装置120px内时）',
      cond(s) { if (!s.player) return false; for (const d of s.devices) { if (d.hp > 0 && G.dist(d.x, d.y, s.player.x, s.player.y) < 120 + d.r) return true; } return false; },
      fields: { cover: 1 } },
    { id: 'crystal_renew', cat: 'def', name: '元晶回春', icon: '💎',
      desc: '元晶首次跌破50%时瞬间恢复25%最大生命（一次性）',
      fields: { crystalRenew: 1 } },
    // 💰 经济类
    { id: 'gold', cat: 'eco', name: '财源滚滚', icon: '💰',
      desc: '本潮击杀金币×1.5',
      fields: { goldMult: 0.5 } },
    // 🔧 晶防装置协同类
    { id: 'overclock', cat: 'dev', name: '晶防装置超频', icon: '⚙️',
      desc: '已建晶防装置攻速+50%、射程+15%（购买时快照，不新增建）',
      fields: { overclock: 1 } },
    { id: 'flame_spread', cat: 'dev', name: '炽焰扩散', icon: '🌋',
      desc: '火焰炮台点燃传染120px内相邻敌人',
      fields: { flameSpread: 1 } }
  ];

  // 临时增益价格：基础价按蚀潮质量，实际价 = 基础价 × (1 + floor(wave/15) × 0.2)
  function buffPrice(wave) {
    const q = qualityForWave(wave);
    let lo, hi;
    if (q === 'normal') { lo = 30; hi = 45; }
    else if (q === 'rare') { lo = 40; hi = 60; }
    else if (q === 'epic') { lo = 55; hi = 85; }
    else { lo = 70; hi = 110; }
    const base = G.randint(lo, hi);
    return Math.round(base * (1 + Math.floor(wave / 15) * 0.2));
  }

  // 从武器池中抽取 n 个不重复的武器 id
  function pickWeaponIds(pool, n) {
    const avail = pool.slice();
    const picked = [];
    while (picked.length < n && avail.length > 0) {
      picked.push(avail.splice(G.randint(0, avail.length - 1), 1)[0]);
    }
    return picked;
  }

  // ==================== 核心 Siege 对象 ====================
  G.Siege = {
    // 初始化
    init(charId) {
      const c = G.CHARACTERS.find(x => x.id === charId);
      if (!c) return null;
      const s = {
        // 基础状态
        wave: 0,           // 当前蚀潮（0=未开始）
        phase: 'rest',     // 'rest' | 'fight' | 'finished'
        restTimer: 0,
        time: 0,
        finished: false,
        win: false,

        // 地图
        mapW: MAP_W, mapH: MAP_H,
        cam: { x: (MAP_W - G.W) / 2, y: (MAP_H - G.H) / 2 },
        room: { x: 0, y: 0, w: MAP_W, h: MAP_H, obstacles: [] },

        // 元晶
        crystal: { x: CRYSTAL_X, y: CRYSTAL_Y, r: CRYSTAL_R, hp: CRYSTAL_MAX_HP, maxHp: CRYSTAL_MAX_HP,
          alertTimer: 0, shield: 0 },

        // 玩家
        player: new G.Player(c),
        players: null,
        respawns: 2,        // 重生次数
        maxRespawns: 2,
        respawnTimer: 0,
        defeatTimer: 0,     // 阵亡倒计时（无复活次数时5秒后失败）
        dead: false,

        // 敌人
        enemies: [],
        spawnQueue: [],     // 待生成的怪物队列
        spawnTimer: 0,
        spawnTotal: 0,
        spawnRemain: 0,
        eliteCount: 0,
        bossSpawned: false,

        // 子弹
        bullets: [],

        // 经济
        gold: 0,
        goldParticles: [],  // 金币吸附粒子
        energyBalls: [],    // 能量球吸附粒子
        pickups: [],        // 标准掉落物（由 die 产生，每帧转换为粒子）
        room: { chests: [], obstacles: [], portal: null },  // 兼容标准子弹碰撞

        // 晶防装置
        devices: [],
        deviceSelected: null,
        placingDevice: null, // 正在放置的晶防装置类型
        placingTier: 1,      // 正在放置的晶防装置等级（Ⅰ=1/Ⅱ=2/Ⅲ=3）
        removeMode: false,   // 拆除模式（点击晶防装置拆除）

        // 晶旅商栈
        shopOpen: false,
        shopItems: [],
        shopRefreshCost: 10,
        shopRefreshCount: 0,

        // 永久属性强化
        shopTab: 'shop',   // 晶旅商栈页签: 'shop' | 'perm'
        permUpgrades: {},  // { id: level }
        permBuysLeft: 0,  // 本潮剩余永久强化购买次数（每潮重置为 1+floor(wave/5)）

        // 临时增益
        buffs: [],         // 已购买待生效的增益 { id, wave }
        waveBuffs: [],     // 当前潮激活的增益 id 列表
        buffActive: {},    // { id: bool } 每帧刷新（条件是否满足）
        buffUsed: {},      // 一次性增益触发标记
        buffState: { lifesteal: { tid: null, count: 0 } },

        // 增益
        activeBuffs: {},

        // 统计
        kills: 0,
        bossKills: 0,
        gemsEarned: 0,

        // 建造模式
        buildMode: false,

        // 作弊
        cheatOpen: false,
        cheats: { god: false, ohk: false, infEnergy: false, infGold: false, speed: false, noCd: false }
      };
      s.players = [s.player];
      s.player.input = { local: true, keys: {}, mouse: { worldX: 0, worldY: 0, down: false, released: false, triggered: false } };
      // 初始位置：元晶附近，确保不在墙内
      s.player.x = CRYSTAL_X + G.rand(-40, 40);
      s.player.y = CRYSTAL_Y - 60 + G.rand(-20, 20);
      while (inWall(s.player.x, s.player.y, s.player.r)) {
        s.player.x = CRYSTAL_X + G.rand(-60, 60);
        s.player.y = CRYSTAL_Y + G.rand(-60, 60);
      }
      s.player.invuln = 1;
      // 初始相机位置：跟随玩家
      s.cam.x = s.player.x - G.W / 2;
      s.cam.y = s.player.y - G.H / 2;
      return s;
    },

    // 开始下一潮
    startWave(s) {
      s.wave++;
      s.phase = 'fight';
      s.bossSpawned = false;
      s.spawnQueueGenerated = false;
      s.spawnRemain = waveMonsterCount(s.wave);
      s.spawnTotal = s.spawnRemain;
      s.spawnTimer = 0;
      s.spawnQueue = [];
      s.eliteCount = (s.wave >= 6) ? G.randint(2, 4) : 0;
      // 重置蚀潮增益（基础值 + 条件型字段，由 updateActiveBuffs 每帧刷新）
      s.activeBuffs = { dmgBase: 1, fireRateBase: 1, goldBase: 1,
        dmgMult: 1, fireRateMult: 1, goldMult: 1, armorBonus: 0, moveMult: 1, crystalShield: 0,
        armorPierce: 0, lifesteal: 0, cover: 0, crystalRenew: 0, overclock: 0, flameSpread: 0 };
      // 当前潮激活的临时增益 id 列表
      s.waveBuffs = s.buffs.filter(b => b.wave === s.wave).map(b => b.id);
      // 一次性触发状态按潮重置
      s.buffUsed = {};
      // 元晶守卫战：把永久强化写入玩家
      if (s.player) {
        s.player.dmgMult = this.permDmgMult(s);
        s.player.fireRateMult = this.permFireRateMult(s);
        s.player.petRate = this.permPetRate(s);
      }
      s.buffs = s.buffs.filter(b => b.wave >= s.wave); // 保留会持续到本潮的增益
      s.goldParticles = [];
      s.energyBalls = [];
    },

    // 进入喘息期
    startRest(s) {
      s.phase = 'rest';
      s.restTimer = restDuration(s.wave);
      // 永久强化购买次数：基础每潮1次，每过5潮额外+1（第5潮2次、第10潮3次……）
      s.permBuysLeft = 1 + Math.floor(s.wave / 5);
      // 晶防装置恢复20%生命
      for (const d of s.devices) {
        if (d.hp > 0) d.hp = Math.min(d.maxHp, d.hp + d.maxHp * 0.2);
      }
      // 生成晶旅商栈
      this.generateShop(s);
      // 清理增益（潮末移除已过期的临时增益，一次性状态重置）
      s.buffs = s.buffs.filter(b => b.wave > s.wave);
      s.waveBuffs = [];
      s.buffActive = {};
      s.buffUsed = {};
      // 重置增益字段为基准值，避免喘息期读旧值（永久强化购买即时应用）
      s.activeBuffs = { dmgBase: 1, fireRateBase: 1, goldBase: 1,
        dmgMult: 1, fireRateMult: 1, goldMult: 1, armorBonus: 0, moveMult: 1, crystalShield: 0,
        armorPierce: 0, lifesteal: 0, cover: 0, crystalRenew: 0, overclock: 0, flameSpread: 0 };
      if (s.player) {
        s.player.dmgMult = 1 + (s.permUpgrades.dmg || 0) * 0.10;
        s.player.fireRateMult = 1 + (s.permUpgrades.fireRate || 0) * 0.08;
      }
    },

    // 生成晶旅商栈
    generateShop(s) {
      const q = qualityForWave(s.wave);
      s.shopRefreshCount = 0;
      s.shopRefreshCost = q === 'normal' ? 10 : q === 'rare' ? 15 : q === 'epic' ? 20 : 25;
      s.shopItems = [];
      this._fillShop(s, q);
    },

    _fillShop(s, q) {
      s.shopItems = [];
      // 每潮晶旅商栈固定刷2个不重复的临时增益位（只能选买1个）
      s._buffSlots = this._pickBuffSlots();
      const priceMult = q === 'normal' ? 1 : q === 'rare' ? 1 : q === 'epic' ? 1.3 : 1.3 + (s.wave - 61) * 0.01;

      if (q === 'normal') {
        // 武器（白/绿）——抽取不重复的2件
        const wp = ['pistol', 'smg', 'shotgun', 'laser', 'crossbow', 'sword', 'spear', 'bow', 'revolver'];
        for (const wid of pickWeaponIds(wp, 2)) {
          s.shopItems.push({ kind: 'weapon', weapon: G.WEAPONS[wid], price: Math.round((G.WEAPONS[wid].price || 30) * priceMult), sold: false });
        }
        // 生命药水
        s.shopItems.push({ kind: 'potion', type: 'hp', name: '生命药水', desc: '+3 HP', price: Math.round(15 * priceMult), sold: false, icon: '❤️' });
        s.shopItems.push({ kind: 'potion', type: 'hp', name: '生命药水', desc: '+3 HP', price: Math.round(15 * priceMult), sold: false, icon: '❤️' });
        // 能量药水
        for (let i = 0; i < 3; i++) {
          s.shopItems.push({ kind: 'potion', type: 'energy', name: '能量药水', desc: '+50 能量', price: Math.round(10 * priceMult), sold: false, icon: '🔵' });
        }
        // 元晶修补液
        s.shopItems.push({ kind: 'crystal_repair', name: '元晶修补液', desc: '+10 元晶HP', price: Math.round(25 * priceMult), sold: false, icon: '💎' });
        // 临时增益（晶防装置改由建造面板直接购买，避免重复与差价）
        s.shopItems.push({ kind: 'buff', buff: s._buffSlots[0], price: buffPrice(s.wave), sold: false });
        s.shopItems.push({ kind: 'buff', buff: s._buffSlots[1], price: buffPrice(s.wave), sold: false });
      } else if (q === 'rare') {
        // 蓝/紫武器——抽取不重复的2件
        const wp = ['sniper', 'fire', 'ice', 'grenade', 'shuriken', 'assault', 'boomerang', 'lightsaber', 'poison_dart'];
        for (const wid of pickWeaponIds(wp, 2)) {
          s.shopItems.push({ kind: 'weapon', weapon: G.WEAPONS[wid], price: Math.round((G.WEAPONS[wid].price || 45) * priceMult), sold: false });
        }
        s.shopItems.push({ kind: 'potion', type: 'hp', name: '生命药水', desc: '+3 HP', price: Math.round(20 * priceMult), sold: false, icon: '❤️' });
        s.shopItems.push({ kind: 'potion', type: 'hp', name: '生命药水', desc: '+3 HP', price: Math.round(20 * priceMult), sold: false, icon: '❤️' });
        for (let i = 0; i < 3; i++) {
          s.shopItems.push({ kind: 'potion', type: 'energy', name: '能量药水', desc: '+50 能量', price: Math.round(12 * priceMult), sold: false, icon: '🔵' });
        }
        s.shopItems.push({ kind: 'crystal_repair', name: '元晶修补液', desc: '+10 元晶HP', price: Math.round(40 * priceMult), sold: false, icon: '💎' });
        s.shopItems.push({ kind: 'buff', buff: s._buffSlots[0], price: buffPrice(s.wave), sold: false });
        s.shopItems.push({ kind: 'buff', buff: s._buffSlots[1], price: buffPrice(s.wave), sold: false });
      } else if (q === 'epic') {
        // 橙/红武器——抽取不重复的2件
        const wp = ['gatling', 'rpg', 'heavy_sniper', 'thunder_staff', 'lightning', 'battle_axe', 'burst_shotgun'];
        for (const wid of pickWeaponIds(wp, 2)) {
          s.shopItems.push({ kind: 'weapon', weapon: G.WEAPONS[wid], price: Math.round((G.WEAPONS[wid].price || 70) * priceMult), sold: false });
        }
        s.shopItems.push({ kind: 'potion', type: 'hp', name: '生命药水', desc: '+3 HP', price: Math.round(25 * priceMult), sold: false, icon: '❤️' });
        for (let i = 0; i < 3; i++) {
          s.shopItems.push({ kind: 'potion', type: 'energy', name: '能量药水', desc: '+50 能量', price: Math.round(15 * priceMult), sold: false, icon: '🔵' });
        }
        s.shopItems.push({ kind: 'crystal_repair', name: '元晶修补液', desc: '+10 元晶HP', price: Math.round(50 * priceMult), sold: false, icon: '💎' });
        s.shopItems.push({ kind: 'revive', name: '重生十字章', desc: '+1 复活次数', price: Math.round(70 * priceMult), sold: false, icon: '✝️' });
        s.shopItems.push({ kind: 'buff', buff: s._buffSlots[0], price: buffPrice(s.wave), sold: false });
        s.shopItems.push({ kind: 'buff', buff: s._buffSlots[1], price: buffPrice(s.wave), sold: false });
      } else {
        // 传说：全部武器——抽取不重复的2件
        const allWp = Object.keys(G.WEAPONS);
        for (const wid of pickWeaponIds(allWp, 2)) {
          s.shopItems.push({ kind: 'weapon', weapon: G.WEAPONS[wid], price: Math.round((G.WEAPONS[wid].price || 80) * priceMult), sold: false });
        }
        s.shopItems.push({ kind: 'potion', type: 'hp', name: '生命药水', desc: '+3 HP', price: Math.round(30 * priceMult), sold: false, icon: '❤️' });
        for (let i = 0; i < 3; i++) {
          s.shopItems.push({ kind: 'potion', type: 'energy', name: '能量药水', desc: '+50 能量', price: Math.round(18 * priceMult), sold: false, icon: '🔵' });
        }
        s.shopItems.push({ kind: 'crystal_repair', name: '元晶修补液', desc: '+10 元晶HP', price: Math.round(60 * priceMult), sold: false, icon: '💎' });
        s.shopItems.push({ kind: 'revive', name: '重生十字章', desc: '+1 复活次数', price: Math.round(80 * priceMult), sold: false, icon: '✝️' });
        s.shopItems.push({ kind: 'crystal_shield_item', name: '元晶屏障', desc: '抵挡20点伤害持续2潮', price: Math.round(60 * priceMult), sold: false, icon: '🛡️' });
        s.shopItems.push({ kind: 'buff', buff: s._buffSlots[0], price: buffPrice(s.wave), sold: false });
        s.shopItems.push({ kind: 'buff', buff: s._buffSlots[1], price: buffPrice(s.wave), sold: false });
      }
    },

    refreshShop(s) {
      if (s.gold < s.shopRefreshCost) return;
      s.gold -= s.shopRefreshCost;
      s.shopRefreshCount++;
      // 刷新衰减：每次+5，上限30金
      s.shopRefreshCost = Math.min(30, s.shopRefreshCost + 5);
      this._fillShop(s, qualityForWave(s.wave));
      G.audio.play('click');
    },

    // 抽取2个不重复的临时增益（晶旅商栈2个buff位）
    _pickBuffSlots() {
      const pool = G.shuffle(BUFFS.slice());
      return pool.slice(0, 2);
    },

    // 购买商品
    buyItem(s, item) {
      if (item.sold) return;
      const p = s.player;
      // 每潮最多购买 1 个临时增益
      if (item.kind === 'buff' && s.buffs.some(b => b.wave === s.wave + 1)) {
        G.audio.play('dry');
        G.FX.float(p.x, p.y - 30, '本潮已购买增益，只能选1个', '#ef4444', 16);
        return;
      }
      if (s.gold < item.price) { G.audio.play('dry'); return; }
      s.gold -= item.price;
      item.sold = true;
      G.audio.play('buy');

      if (item.kind === 'weapon') {
        const w = new G.Weapon(item.weapon);
        if (p.weapons.length < 2) {
          p.equip(w);
        } else {
          // 替换当前武器
          p.weapons[p.cur] = w;
        }
        G.FX.float(p.x, p.y - 30, '获得 ' + w.name, '#ffd54f', 16);
      } else if (item.kind === 'potion') {
        if (item.type === 'hp') {
          p.hp = Math.min(p.maxHp, p.hp + 3);
          G.FX.float(p.x, p.y - 30, '+3 生命', '#4ade80', 16);
        } else if (item.type === 'energy') {
          p.energy = Math.min(p.maxEnergy, p.energy + 50);
          G.FX.float(p.x, p.y - 30, '+50 能量', '#38bdf8', 16);
        }
      } else if (item.kind === 'crystal_repair') {
        s.crystal.hp = Math.min(s.crystal.maxHp, s.crystal.hp + 10);
        G.FX.float(s.crystal.x, s.crystal.y - 30, '+10 元晶HP', '#4ade80', 16);
      } else if (item.kind === 'revive') {
        s.respawns = Math.min(s.maxRespawns + 3, s.respawns + 1);
        G.FX.float(p.x, p.y - 30, '+1 复活', '#ffd54f', 16);
      } else if (item.kind === 'crystal_shield_item') {
        s.crystal.shield = (s.crystal.shield || 0) + 20;
        G.FX.float(s.crystal.x, s.crystal.y - 30, '元晶屏障+20', '#38bdf8', 16);
      } else if (item.kind === 'buff') {
        s.buffs.push({ id: item.buff.id, wave: s.wave + 1 });
        // 晶防装置超频：购买时对当前已建造晶防装置快照标记（不新增建）
        if (item.buff.id === 'overclock') {
          for (const d of s.devices) if (d.hp > 0) d.overclocked = true;
        }
        G.FX.float(p.x, p.y - 30, item.buff.name + ' (下一潮)', '#ffd54f', 16);
      } else if (item.kind === 'device') {
        s.placingDevice = item.device;
        s.placingTier = 1; // 晶旅商栈出售的晶防装置为Ⅰ级
        s._placingDeviceJustBought = true; // 标记刚购买，跳过本次点击的放置
        s.shopOpen = false;
      }
    },

    // 购买永久强化
    buyPermUpgrade(s, id) {
      const upg = PERM_UPGRADES.find(u => u.id === id);
      if (!upg) return;
      const level = s.permUpgrades[id] || 0;
      // 最高等级
      if (level >= upg.max) return;
      // 逐潮解锁
      if (s.wave < upg.unlockWave) { G.FX.float(CRYSTAL_X, CRYSTAL_Y - 60, '第 ' + upg.unlockWave + ' 潮解锁', '#94a3b8', 13); return; }
      // 本潮购买次数用尽
      if (s.permBuysLeft <= 0) { G.audio.play('dry'); G.FX.float(CRYSTAL_X, CRYSTAL_Y - 60, '本潮次数已用尽', '#ef4444', 13); return; }
      const cost = upgradeCost(upg, level);
      if (s.gold < cost) { G.audio.play('dry'); G.FX.float(CRYSTAL_X, CRYSTAL_Y - 60, '金币不足', '#ef4444', 13); return; }
      s.gold -= cost;
      s.permUpgrades[id] = level + 1;
      s.permBuysLeft--;
      G.audio.play('buy');
      G.FX.float(CRYSTAL_X, CRYSTAL_Y - 60, upg.icon + ' ' + upg.name + ' → Lv.' + (level + 1), '#ffd54f', 16);
      // 立即应用属性
      this.applyPermUpgrade(s, upg);
    },

    // 应用永久强化到玩家
    applyPermUpgrade(s, upg) {
      const p = s.player;
      if (upg.apply) upg.apply(p);
      if (upg.id === 'dmg') p.dmgMult = this.permDmgMult(s);
      if (upg.id === 'fireRate') p.fireRateMult = this.permFireRateMult(s);
      if (upg.id === 'petRate') p.petRate = this.permPetRate(s);
    },

    // 永久强化：伤害倍率（与蚀潮增益叠加）
    permDmgMult(s) {
      const level = s.permUpgrades.dmg || 0;
      return (s.activeBuffs.dmgMult || 1) + level * 0.10;
    },

    // 永久强化：射速倍率（与蚀潮增益叠加）
    permFireRateMult(s) {
      const level = s.permUpgrades.fireRate || 0;
      return (s.activeBuffs.fireRateMult || 1) + level * 0.08;
    },

    // 永久强化：宠物攻击间隔倍率（加法叠加，每级缩短8%）
    permPetRate(s) {
      const level = s.permUpgrades.petRate || 0;
      return Math.max(0.2, 1 - level * 0.08);
    },

    // 每帧刷新临时增益激活状态：条件型 buff 满足条件才生效，UI 灰/亮切换
    updateActiveBuffs(s) {
      const ab = s.activeBuffs;
      // 重置动态字段（基础值 + 条件加成）
      ab.dmgMult = ab.dmgBase || 1;
      ab.fireRateMult = ab.fireRateBase || 1;
      ab.goldMult = ab.goldBase || 1;
      ab.armorPierce = 0; ab.lifesteal = 0; ab.cover = 0; ab.crystalRenew = 0; ab.overclock = 0; ab.flameSpread = 0;
      s.buffActive = {};
      s.buffUsed = s.buffUsed || {};
      const wb = s.waveBuffs || [];
      for (const id of wb) {
        const b = BUFFS.find(x => x.id === id);
        if (!b) continue;
        const active = !b.cond || !!b.cond(s);
        s.buffActive[id] = active;
        if (!active) continue;
        if (b.fields) for (const k in b.fields) ab[k] = (ab[k] || 0) + b.fields[k];
        // 一次性事件型：元晶回春（首次跌破50%时回25%最大生命，每潮一次）
        if (b.id === 'crystal_renew' && !s.buffUsed[id] && s.crystal.hp <= s.crystal.maxHp * 0.5) {
          const heal = Math.round(s.crystal.maxHp * 0.25);
          s.crystal.hp = Math.min(s.crystal.maxHp, s.crystal.hp + heal);
          s.buffUsed[id] = true;
          G.FX.float(CRYSTAL_X, CRYSTAL_Y - 40, '元晶回春 +' + heal, '#86efac', 16);
          G.FX.burst(CRYSTAL_X, CRYSTAL_Y, '#86efac', 12, 140, 4);
          G.audio.play('heal');
        }
      }
      // 同步玩家实时伤害/射速（含永久强化）
      if (s.player) {
        s.player.dmgMult = ab.dmgMult + (s.permUpgrades.dmg || 0) * 0.10;
        s.player.fireRateMult = ab.fireRateMult + (s.permUpgrades.fireRate || 0) * 0.08;
      }
    },

    // 掩体模式减伤：玩家站晶防装置120px内且该增益激活时，远程伤害-80%（由敌方子弹调用）
    coverReduce(p, dmg) {
      const s = G.game;
      if (s && s.waveBuffs && s.waveBuffs.indexOf('cover') >= 0 && s.activeBuffs.cover) {
        return Math.round(dmg * 0.2);
      }
      return dmg;
    },

    // 玩家命中敌人钩子：穿甲弹减速 / 嗜血吸血（由子弹/武器命中处调用）
    onPlayerHit(e, dmg) {
      const s = G.game;
      if (!s || !s.waveBuffs || s.phase !== 'fight') return;
      const ab = s.activeBuffs || {};
      // 穿甲弹：命中精英/Boss 减速30% 1秒
      if (ab.armorPierce && (e.elite || e.boss)) {
        e.slowT = Math.max(e.slowT || 0, 1);
        e.empSlow = 0.3;
      }
      // 嗜血：连续命中≥5次后，伤害10%转生命（换目标重置）
      if (ab.lifesteal) {
        const ls = s.buffState.lifesteal;
        if (ls.tid !== e.id) { ls.tid = e.id; ls.count = 0; }
        ls.count++;
        if (ls.count >= 5) {
          const heal = Math.round(dmg * 0.1);
          if (heal > 0 && s.player && !s.player.dead) {
            s.player.hp = Math.min(s.player.maxHp, s.player.hp + heal);
          }
        }
      }
    },

    // 放置晶防装置（按所选等级的配置）
    placeDevice(s, x, y) {
      if (!s.placingDevice) return false;
      const dd = DEVICES[s.placingDevice];
      if (!dd) return false;
      const tier = s.placingTier || 1;
      const st = deviceStats(dd, tier);
      // 检查不可建造区
      if (G.dist(x, y, CRYSTAL_X, CRYSTAL_Y) < CRYSTAL_NO_BUILD_R) return false;
      // 检查墙壁区域
      if (inWall(x, y, 10)) return false;
      // 检查出生点
      for (const sp of SPAWN_POINTS) {
        if (G.dist(x, y, sp.x, sp.y) < 80) return false;
      }
      // 检查晶防装置上限
      if (s.devices.filter(d => d.hp > 0).length >= deviceLimit(s.wave)) return false;
      // 检查与其他晶防装置重叠
      for (const d of s.devices) {
        if (d.hp <= 0) continue;
        if (G.dist(x, y, d.x, d.y) < st.r + d.r + 10) return false;
      }
      // 检查金币
      if (s.gold < st.cost) { G.FX.float(x, y - 30, '金币不足！', '#ef4444', 14); return false; }
      s.gold -= st.cost;
      // 浅拷贝等级配置 + 类型公共字段，保证后续 updateDevice/绘制读取实例字段
      const dev = Object.assign({}, st, {
        type: s.placingDevice,
        tier: tier,
        x: x, y: y,
        r: st.r,
        hp: st.hp, maxHp: st.hp,
        color: dd.color,
        fireT: 0,
        empCd: 0,
        empCd0: st.empCd || 4,
        placeTime: s.time
      });
      s.devices.push(dev);
      G.FX.burst(x, y, dd.color, 8, 120, 3);
      G.audio.play('click');
      s.placingDevice = null;
      return true;
    },

    // 拆除晶防装置（按放置等级退款）
    removeDevice(s, idx) {
      if (idx < 0 || idx >= s.devices.length) return;
      const d = s.devices[idx];
      const dd = DEVICES[d.type];
      s.gold += Math.floor(deviceCost(dd, d.tier || 1) * 0.3);
      s.devices.splice(idx, 1);
      G.FX.burst(d.x, d.y, d.color, 6, 100, 3);
      G.audio.play('click');
    },

    // 生成怪物
    spawnEnemy(s, type, x, y, elite) {
      const mult = waveStatMult(s.wave);
      const base = G.ENEMIES[type];
      if (!base) return null;
      const hp = base.hp * mult.hp * (elite ? 3 : 1);
      const e = new G.Enemy();
      G._siegeEid = (G._siegeEid || 0) + 1; e.id = G._siegeEid;
      e.type = type; e.name = base.name; e.elite = !!elite; e.boss = false;
      e.maxHp = hp; e.hp = hp;
      e.speed = base.speed * mult.speed;
      e.dmg = base.dmg * mult.dmg;
      e.r = base.r * (elite ? 1.25 : 1);
      e.color = base.color;
      e.contact = !!base.contact; e.ranged = !!base.ranged;
      e.burst = base.burst || 1; e.rate = base.rate || 2; e.bSpeed = base.bSpeed || 260;
      e.contactCd = 0; e.dead = false;
      e.fireT = G.rand(0.5, 1.5); e.state = 'idle'; e.stateT = 0;
      e.kx = 0; e.ky = 0; e.slowT = 0; e.burnT = 0; e.burnTick = 0; e.poisonT = 0; e.poisonTick = 0;
      e.coins = base.coins;
      e.x = x; e.y = y;
      // 安全推出墙外（防止刷在边界墙上卡死）
      if (inWall(e.x, e.y, e.r)) {
        let pushed = false;
        for (const [dx, dy] of [[-30, 0], [30, 0], [0, -30], [0, 30], [-30, -30], [30, -30], [-30, 30], [30, 30]]) {
          if (!inWall(e.x + dx, e.y + dy, e.r)) {
            e.x += dx; e.y += dy; pushed = true; break;
          }
        }
        if (!pushed) {
          // 极端情况：推到地图中心
          e.x = CROSS_CX; e.y = CROSS_CY;
        }
      }
      e.pending = false; e.spawnIn = 0; e.wave = s.wave;
      e.aggroTimer = 0; // 玩家仇恨计时器
      // 特殊属性
      e.charge = !!base.charge; e.selfDestruct = !!base.selfDestruct;
      e.slowAura = base.slowAura || 0; e.slowShot = base.slowShot || 0;
      e.contactBomb = !!base.contactBomb; e.bombRange = base.bombRange || 80; e.bombDmg = base.bombDmg || 6;
      e.frontShield = !!base.frontShield; e.chargedShot = !!base.chargedShot; e.chargeTime = base.chargeTime || 1.5;
      e.chargedDmg = base.chargedDmg || 0; e.reviveInterval = base.reviveInterval || 0;
      e.lowHpBomb = !!base.lowHpBomb; e.unstoppable = !!base.unstoppable;
      e.healInterval = base.healInterval || 0; e.healAmount = base.healAmount || 0; e.healRange = base.healRange || 0;
      e.fireTrail = !!base.fireTrail; e.lanceRange = base.lanceRange || 0; e.lanceKnock = base.lanceKnock || 0;
      e.bossGuardAura = !!base.bossGuardAura;
      e.arc = !!base.arc; e.detectRange = base.detectRange || 0; e.hide = !!base.hide;
      e.stunOnHit = base.stunOnHit || 0; e.splitType = base.splitType || ''; e.teleport = base.teleport || 0;
      e.lifesteal = base.lifesteal || 0;
      // 特殊怪物标记
      e.isRaider = (type === 'raider'); e.isFlyer = (type === 'flyer'); e.isSummoner = (type === 'summoner');
      e.summonTimer = 0;
      return e;
    },

    spawnBoss(s, type, x, y) {
      const mult = waveStatMult(s.wave);
      const base = G.BOSSES[type];
      if (!base) return null;
      const bossMult = 1 + Math.floor(s.wave / 5) * 0.25;
      const hp = base.hp * mult.hp * bossMult;
      const e = new G.Enemy();
      G._siegeEid = (G._siegeEid || 0) + 1; e.id = G._siegeEid;
      e.type = type; e.name = base.name; e.boss = true;
      e.maxHp = hp; e.hp = hp;
      e.speed = base.speed * mult.speed;
      // Boss伤害不乘bossMult，避免后期蚀潮一击秒杀玩家（玩家HP不随蚀潮成长）
      e.dmg = base.dmg * mult.dmg;
      // 元晶守卫战：虚蚀统帅削弱（冲刺贴脸威胁过大，伤害与移速下调）
      if (type === 'darkknight') {
        e.dmg = Math.max(1, Math.round(e.dmg * 0.7));
        e.speed = e.speed * 0.85;
      }
      e.r = base.r; e.color = base.color;
      e.coins = [base.coins];
      e.x = x; e.y = y;
      // 安全推出墙外
      if (inWall(e.x, e.y, e.r)) {
        let pushed = false;
        for (const [dx, dy] of [[-40, 0], [40, 0], [0, -40], [0, 40], [-40, -40], [40, -40], [-40, 40], [40, 40]]) {
          if (!inWall(e.x + dx, e.y + dy, e.r)) {
            e.x += dx; e.y += dy; pushed = true; break;
          }
        }
        if (!pushed) { e.x = CROSS_CX; e.y = CROSS_CY; }
      }
      e.fireT = 1; e.state = 'idle'; e.stateT = 0;
      e.kx = 0; e.ky = 0; e.slowT = 0; e.burnT = 0; e.burnTick = 0; e.poisonT = 0; e.poisonTick = 0;
      e.contactCd = 0; e.dead = false;
      e.actT = 1.2; e.phase = 1; e.phaseT = 0; e.spiral = 0;
      e.contact = true; e.ranged = true; e.rate = 1.5; e.bSpeed = 280; e.burst = 1;
      e.pending = false; e.spawnIn = 0; e.wave = s.wave; e.aggroTimer = 0;
      return e;
    },

    // 生成怪物池
    getAvailableMonsterPool(s) {
      const pool = [];
      for (const tier of MONSTER_TIERS) {
        if (s.wave >= tier.minWave) {
          for (const t of tier.types) pool.push(t);
        }
      }
      return pool;
    },

    // 主更新循环
    update(dt) {
      const s = G.game;
      if (!s || s.finished) return;
      s.time += dt;

      // 作弊
      if (s.cheats.god) s.player.invuln = 1;
      if (s.cheats.infEnergy) s.player.energy = s.player.maxEnergy;
      if (s.cheats.infGold) s.gold = 9999;
      if (s.cheats.speed) s.player.moveMult = 2;
      if (s.cheats.noCd) s.player.skill.cdLeft = 0;

      // 元晶警报
      if (s.crystal.hp < s.crystal.maxHp * 0.3) {
        s.crystal.alertTimer += dt;
        if (s.crystal.alertTimer >= 5) {
          s.crystal.alertTimer = 0;
          G.audio.play('alert');
        }
      }

      // 晶旅商栈打开时：只更新计时器和粒子，不更新战斗
      if (s.shopOpen) {
        if (s.phase === 'rest') {
          s.restTimer -= dt;
          if (s.restTimer <= 0) {
            s.shopOpen = false;
            this.startWave(s);
          }
          // 阵亡倒计时在晶旅商栈打开时也持续（防止卡晶旅商栈拖延）
          if (s.player && s.player.dead && s.respawns <= 0) {
            s.defeatTimer = (s.defeatTimer || 0) + dt;
            if (s.defeatTimer >= 5) { this.finish(s, false); return; }
          }
          this.updateGoldParticles(s, dt);
          this.updateEnergyBalls(s, dt);
          if (s.fireTrails && s.fireTrails.length > 0) {
            for (const ft of s.fireTrails) ft.life -= dt;
            s.fireTrails = s.fireTrails.filter(ft => ft.life > 0);
          }
          return;
        }
        s.shopOpen = false; // 战斗阶段残留的晶旅商栈状态：强制关闭并继续战斗
      }

      // 玩家输入
      const p = s.player;
      if (!p.input) p.input = { local: true, keys: {}, mouse: { worldX: 0, worldY: 0, down: false, released: false, triggered: false } };
      if (p.input.local) {
        p.input.keys = G.keys;
        p.input.mouse.worldX = G.mouse.x + Math.max(0, (G.vw - G.W) / 2) + s.cam.x;
        p.input.mouse.worldY = G.mouse.y + s.cam.y;
        p.input.mouse.down = G.mouse.down;
        p.input.mouse.released = G.mouse.released;
        p.input.mouse.triggered = G.mouse.triggered;
      }

      if (!p.dead) {
        this.updatePlayer(s, p, dt);
      } else if (s.respawns > 0) {
        s.respawnTimer += dt;
        if (s.respawnTimer >= 5) {
          this.respawnPlayer(s, p);
        }
      }
      // 玩家死亡时清除所有敌人仇恨
      if (p.dead && !s._playerWasDead) {
        for (const e of s.enemies) {
          if (!e.dead) e.aggroTimer = 0;
        }
      }
      s._playerWasDead = p.dead;
      // 阵亡且无复活次数：5秒后失败（避免永久观战/卡局）
      if (p.dead && s.respawns <= 0) {
        s.defeatTimer = (s.defeatTimer || 0) + dt;
        if (s.defeatTimer >= 5) { this.finish(s, false); return; }
      } else {
        s.defeatTimer = 0;
      }

      // 相机跟随玩家（地牢模式视角）
      const padX = 140, padY = 140;
      const minX = Math.min(-padX, MAP_W - G.W + padX);
      const maxX = Math.max(-padX, MAP_W - G.W + padX);
      const minY = Math.min(-padY, MAP_H - G.H + padY);
      const maxY = Math.max(-padY, MAP_H - G.H + padY);
      const tx = G.clamp(p.x - G.W / 2, minX, maxX);
      const ty = G.clamp(p.y - G.H / 2, minY, maxY);
      s.cam.x = G.lerp(s.cam.x, tx, Math.min(1, 8 * dt));
      s.cam.y = G.lerp(s.cam.y, ty, Math.min(1, 8 * dt));

      // 战斗阶段更新
      if (s.phase === 'fight') {
        // 每帧刷新临时增益激活状态（条件型 buff）
        this.updateActiveBuffs(s);
        this.updateFight(s, dt);
      } else if (s.phase === 'rest') {
        s.restTimer -= dt;
        if (s.restTimer <= 0) {
          this.startWave(s);
        }
      }

      // 更新敌人
      // 预计算晶防装置分类，减少每帧重复遍历（仅元晶守卫战）
      s._barriers = [];
      s._turrets = [];
      for (const d of s.devices) {
        if (d.hp <= 0) continue;
        if (d.type === 'barrier') s._barriers.push(d);
        else s._turrets.push(d);
      }
      for (const e of s.enemies) {
        if (e.dead) continue;
        G.audio.focus = { x: e.x, y: e.y };
        this.updateEnemy(s, e, dt);
      }
      s.enemies = s.enemies.filter(e => !e.dead);

      // 更新子弹
      for (const b of s.bullets) {
        G.audio.focus = { x: b.x, y: b.y };
        this.updateBullet(s, b, dt);
      }
      s.bullets = s.bullets.filter(b => !b.dead);

      // 更新晶防装置
      for (const d of s.devices) {
        this.updateDevice(s, d, dt);
      }

      // 更新金币粒子
      this.updateGoldParticles(s, dt);

      // 更新能量球
      this.updateEnergyBalls(s, dt);

      // 更新火径
      if (s.fireTrails && s.fireTrails.length > 0) {
        for (const ft of s.fireTrails) ft.life -= dt;
        s.fireTrails = s.fireTrails.filter(ft => ft.life > 0);
        // 火径对玩家和晶防装置造成伤害
        for (const ft of s.fireTrails) {
          if (!s.player.dead && G.dist(ft.x, ft.y, s.player.x, s.player.y) < ft.r + s.player.r) {
            s.player.takeDamage(ft.dmg * dt, s);
          }
          for (const d of s.devices) {
            if (d.hp <= 0) continue;
            if (G.dist(ft.x, ft.y, d.x, d.y) < ft.r + d.r) {
              d.hp -= ft.dmg * dt;
            }
          }
        }
      }

      // 将标准掉落物转换为 siege 粒子
      for (const pu of s.pickups) {
        if (pu.type === 'coin') {
          s.gold += pu.value * (s.activeBuffs.goldMult || 1);
          s.goldParticles.push({ x: pu.x, y: pu.y, tx: s.player.x, ty: s.player.y, life: 1.5, value: pu.value });
          G.audio.play('coin');
        } else if (pu.type === 'energy') {
          // 限制单次能量入账，避免高蚀潮能量溢出（平衡）
          s.energyBalls.push({ x: pu.x, y: pu.y, tx: s.player.x, ty: s.player.y, life: 1.5, value: Math.min(pu.value, 15) });
        } else if (pu.type === 'hp') {
          s.player.hp = Math.min(s.player.maxHp, s.player.hp + pu.value);
        }
      }
      s.pickups.length = 0;

      // 元晶守卫战：Boss 宝箱直接折算为金币（本模式无宝箱交互，避免奖励丢失）
      if (s.room && s.room.chests && s.room.chests.length > 0) {
        for (const ch of s.room.chests) {
          const val = 20 + Math.floor(s.wave / 5) * 5;
          s.gold += val;
          G.FX.float(ch.x || CRYSTAL_X, ch.y || CRYSTAL_Y, '宝箱奖励 +' + val, '#ffd54f', 15);
          G.audio.play('coin');
        }
        s.room.chests.length = 0;
      }

      // 更新械晶哨塔盟友
      for (const ally of s.allies || []) {
        G.audio.focus = { x: ally.x, y: ally.y };
        this.updateAlly(s, ally, dt);
      }
      if (s.allies) s.allies = s.allies.filter(a => a.hp > 0 && a.life > 0);

      // 敌人生成
      if (s.spawnQueue.length > 0) {
        s.spawnTimer -= dt;
        while (s.spawnTimer <= 0 && s.spawnQueue.length > 0) {
          const e = s.spawnQueue.shift();
          // 非 Boss 才递减 spawnRemain（Boss 不计入蚀潮总数）
          if (!e.spawnBossEntry) s.spawnRemain--;
          if (e.spawnBossEntry) {
            delete e.spawnBossEntry;
            // Boss 入场特效
            G.FX.addShake(12);
            G.FX.burst(e.x, e.y, '#ffd54f', 30, 300, 6);
            G.FX.burst(e.x, e.y, '#ef4444', 20, 200, 4);
            G.FX.float(e.x, e.y - 40, '⚠ ' + e.name + ' 出现!', '#ffd54f', 20);
            G.audio.play('alert');
            s.spawnTimer = 1.2; // Boss 入场后较长间隔
          } else {
            s.spawnTimer = spawnInterval(s.wave);
          }
          s.enemies.push(e);
        }
      }

      // 检查蚀潮结束：所有怪物已生成(待生成=0) + 无存活 = 蚀潮结束
      if (s.phase === 'fight' && s.spawnRemain <= 0 && s.spawnQueue.length === 0 && !s.enemies.some(e => !e.dead)) {
        this.startRest(s);
      }

      // 元晶守卫战卡死兜底（防软锁）：怪物已全部生成、只剩 <=2 只、20秒未移动且远离元晶/玩家/晶防装置
      // （无法被任何攻击命中的卡墙怪）→ 确认 3 秒后清理并结束本潮
      if (s.phase === 'fight' && s.spawnRemain <= 0 && s.spawnQueue.length === 0 && s.enemies.length > 0 && s.enemies.length <= 2) {
        let allStill = true, allHarmless = true;
        for (const e of s.enemies) {
          if (e.dead) continue;
          if (e._stuckPos && Math.hypot(e.x - e._stuckPos.x, e.y - e._stuckPos.y) > 3) e._stuckPos = null;
          if (!e._stuckPos) e._stuckPos = { x: e.x, y: e.y, t: s.time };
          if (s.time - e._stuckPos.t < 20) allStill = false;
          if (G.dist(e.x, e.y, CRYSTAL_X, CRYSTAL_Y) < 380) allHarmless = false;
          if (!s.player.dead && G.dist(e.x, e.y, s.player.x, s.player.y) < 380) allHarmless = false;
          for (const d of s.devices) {
            if (d.hp > 0 && G.dist(e.x, e.y, d.x, d.y) < 420) { allHarmless = false; break; }
          }
        }
        if (allStill && allHarmless) {
          s._stuckT = (s._stuckT || 0) + dt;
          if (s._stuckT >= 3) {
            for (const e of s.enemies) e.dead = true;
            s.enemies = [];
            s._stuckT = 0;
            G.FX.float(CRYSTAL_X, CRYSTAL_Y - 60, '残余卡死敌人已清除，蚀潮结束', '#94a3b8', 15);
            this.startRest(s);
          }
        } else {
          s._stuckT = 0;
        }
      } else {
        s._stuckT = 0;
      }
    },

    updatePlayer(s, p, dt) {
      const k = p.input.keys;
      const m = p.input.mouse;
      // 眩晕
      p.stunT = Math.max(0, (p.stunT || 0) - dt);
      if (p.stunT > 0) {
        p.aimAngle = m ? Math.atan2(m.worldY - p.y, m.worldX - p.x) : p.aimAngle || 0;
        p.invuln = Math.max(0, p.invuln - dt);
        p.dashT = Math.max(0, p.dashT - dt);
        p.fireBuffT = Math.max(0, p.fireBuffT - dt);
        if (p.armor < p.maxArmor) { p.armorRecoverDelay -= dt; if (p.armorRecoverDelay <= 0) p.armor = Math.min(p.maxArmor, p.armor + 1 * dt); }
        else { p.armorRecoverDelay = 5; }
        if (p.healOverT > 0) { p.healOverT -= dt; p.hp = Math.min(p.maxHp, p.hp + p.healPerSec * dt); }
        p.skill.cdLeft = Math.max(0, p.skill.cdLeft - dt);
        p.updatePet(s, dt);
        return;
      }

      let dx = 0, dy = 0;
      if (p.dashT > 0) { dx = p.dashDx; dy = p.dashDy; }
      else {
        if (k['w'] || k['arrowup']) dy -= 1;
        if (k['s'] || k['arrowdown']) dy += 1;
        if (k['a'] || k['arrowleft']) dx -= 1;
        if (k['d'] || k['arrowright']) dx += 1;
      }
      const len = Math.hypot(dx, dy);
      if (len > 0) { dx /= len; dy /= len; }
      const moveMult = (p.moveMult || 1) * (s.activeBuffs.moveMult || 1);
      const spd = p.speed * moveMult * (p.dashT > 0 ? 3.2 : 1);
      // 预测性墙体碰撞：先检查目标位置再移动，避免进入墙体后推出导致抖动
      let nx = p.x + dx * spd * dt;
      let ny = p.y + dy * spd * dt;
      // 地图边界
      nx = G.clamp(nx, 16, MAP_W - 16);
      ny = G.clamp(ny, 16, MAP_H - 16);
      // 分别检查X/Y轴，允许沿墙滑动
      if (!inWall(nx, p.y, p.r)) {
        p.x = nx;
      }
      if (!inWall(p.x, ny, p.r)) {
        p.y = ny;
      }
      // 障碍碰撞（晶防装置中的路障，已摧毁的不再阻挡）
      for (const d of s.devices) {
        if (d.hp <= 0) continue;
        if (d.type !== 'barrier') continue;
        const dist = G.dist(p.x, p.y, d.x, d.y), min = p.r + d.r;
        if (dist < min && dist > 0) {
          p.x += (p.x - d.x) / dist * (min - dist);
          p.y += (p.y - d.y) / dist * (min - dist);
        }
      }
      // 元晶碰撞
      const cd = G.dist(p.x, p.y, CRYSTAL_X, CRYSTAL_Y);
      if (cd < CRYSTAL_R + p.r && cd > 0) {
        p.x += (p.x - CRYSTAL_X) / cd * (CRYSTAL_R + p.r - cd);
        p.y += (p.y - CRYSTAL_Y) / cd * (CRYSTAL_R + p.r - cd);
      }

      p.aimAngle = m ? Math.atan2(m.worldY - p.y, m.worldX - p.x) : p.aimAngle || 0;
      p.invuln = Math.max(0, p.invuln - dt);
      p.dashT = Math.max(0, p.dashT - dt);
      p.fireBuffT = Math.max(0, p.fireBuffT - dt);

      // 护甲恢复
      if (p.armor < p.maxArmor + (s.activeBuffs.armorBonus || 0)) {
        p.armorRecoverDelay -= dt;
        if (p.armorRecoverDelay <= 0) {
          p.armor = Math.min(p.maxArmor + (s.activeBuffs.armorBonus || 0), p.armor + 1 * dt);
        }
      } else { p.armorRecoverDelay = 5; }

      if (p.healOverT > 0) { p.healOverT -= dt; p.hp = Math.min(p.maxHp, p.hp + p.healPerSec * dt); }
      p.skill.cdLeft = Math.max(0, p.skill.cdLeft - dt);

      // 射击
      const w = p.weapon();
      if (w) {
        w.update(p, s, dt,
          m ? m.down : G.mouse.down, m ? m.released : G.mouse.released, m ? m.triggered : G.mouse.triggered);
      }
      p.updatePet(s, dt);
    },

    respawnPlayer(s, p) {
      p.dead = false;
      p.hp = p.maxHp;
      p.armor = p.maxArmor;
      p.energy = p.maxEnergy;
      p.x = CRYSTAL_X + G.rand(-40, 40);
      p.y = CRYSTAL_Y - 60 + G.rand(-20, 20); // 元晶下方一点，避免卡墙
      // 确保不在墙内
      while (inWall(p.x, p.y, p.r)) {
        p.x = CRYSTAL_X + G.rand(-60, 60);
        p.y = CRYSTAL_Y + G.rand(-60, 60);
      }
      p.invuln = 2;
      p.skill.cdLeft = 0;
      s.respawns--;
      s.respawnTimer = 0;
      G.FX.burst(p.x, p.y, p.color, 15, 200, 4);
      G.FX.float(p.x, p.y - 30, '复活! (' + s.respawns + '次剩余)', '#4ade80', 18);
      G.audio.play('heal');
    },

    updateFight(s, dt) {
      // 首次调用：生成所有怪物到队列
      if (!s.spawnQueueGenerated) {
        s.spawnQueueGenerated = true;
        const pool = this.getAvailableMonsterPool(s);
        const total = s.spawnTotal;
        const eliteRemain = s.eliteCount;
        let elitesLeft = eliteRemain;

        // Boss：每5潮生成一只
        if (s.wave % 5 === 0 && !s.bossSpawned) {
          s.bossSpawned = true;
          const bossIdx = (Math.floor(s.wave / 5) - 1) % BOSS_TYPES.length;
          const bossType = BOSS_TYPES[bossIdx];
          const sp = SPAWN_POINTS[G.randint(0, 2)];
          const boss = this.spawnBoss(s, bossType, sp.x, sp.y);
          if (boss) {
            boss.spawnBossEntry = true;
            s.spawnQueue.push(boss);
            // Boss 不占 spawnRemain（已在 waveMonsterCount 之外）
          }
        }

        // 生成普通怪物
        for (let i = 0; i < total; i++) {
          const sp = SPAWN_POINTS[G.randint(0, 2)];
          const isElite = elitesLeft > 0 && (i >= total - elitesLeft || Math.random() < eliteRemain / total);
          if (isElite) elitesLeft--;
          const type = G.pick(pool);
          const e = this.spawnEnemy(s, type, sp.x + G.rand(-20, 20), sp.y + G.rand(-20, 20), isElite);
          if (e) s.spawnQueue.push(e);
        }
        G.shuffle(s.spawnQueue); // 随机打乱，让怪物混合出现
        // 把 Boss 放最前面（如果有的话）
        const bossEntry = s.spawnQueue.find(e => e.spawnBossEntry);
        if (bossEntry) {
          s.spawnQueue = s.spawnQueue.filter(e => !e.spawnBossEntry);
          s.spawnQueue.unshift(bossEntry);
        }
        s.spawnTimer = 0.5; // 初始延迟
      }
    },

    // Boss 环形弹幕
    bossRingAttack(s, e, n, speed) {
      for (let i = 0; i < n; i++) {
        const aa = i * G.TAU / n + G.rand(-0.05, 0.05);
        s.bullets.push(new G.Bullet({ x: e.x, y: e.y, vx: Math.cos(aa) * speed, vy: Math.sin(aa) * speed, dmg: e.dmg, r: 4, color: '#f87171', friendly: false }));
      }
      G.audio.play('eshoot');
    },

    // Boss 攻击决策
    bossDoAttack(s, e, nx, ny, d) {
      const p = s.player;
      const a = Math.atan2(ny, nx);
      if (e.type === 'slimeking') {
        if (Math.random() < 0.55 || e.phase === 1) {
          e.state = 'jump';
          e.stateT = 0.55;
          e.jumpTx = G.clamp(p.x + G.rand(-40, 40), 40, MAP_W - 40);
          e.jumpTy = G.clamp(p.y + G.rand(-40, 40), 40, MAP_H - 40);
          e.summonSlime = e.phase === 2 && Math.random() < 0.6;
          e.actT = G.rand(1.4, 2.0);
        } else {
          this.bossRingAttack(s, e, 10 + e.phase * 4, 150);
          e.actT = 2.2;
        }
      } else if (e.type === 'turretboss') {
        const roll = Math.random();
        if (roll < 0.4) {
          const n = e.phase === 2 ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const aa = a + (i - (n - 1) / 2) * 0.18;
            s.bullets.push(new G.Bullet({ x: e.x, y: e.y, vx: Math.cos(aa) * 260, vy: Math.sin(aa) * 260, dmg: e.dmg, r: 4, color: '#f87171', friendly: false }));
          }
          G.audio.play('eshoot');
          e.actT = 1.4;
        } else if (roll < 0.75) {
          this.bossRingAttack(s, e, 16 + e.phase * 6, 170);
          e.actT = 1.8;
        } else {
          e.spiral = (e.spiral || 0) + 1;
          const base = e.spiral * 0.5;
          for (let i = 0; i < 8; i++) {
            const aa = base + i * G.TAU / 8;
            s.bullets.push(new G.Bullet({ x: e.x, y: e.y, vx: Math.cos(aa) * 190, vy: Math.sin(aa) * 190, dmg: e.dmg, r: 4, color: '#f87171', friendly: false, life: 3 }));
          }
          e.actT = 0.4;
        }
        if (e.phase === 2 && Math.random() < 0.35) {
          const sm = this.spawnEnemy(s, 'turret', e.x + G.rand(-120, 120), e.y + G.rand(-120, 120), false);
          if (sm) { sm.summoned = true; s.enemies.push(sm); }
        }
      } else if (e.type === 'darkknight') {
        const roll = Math.random();
        if (roll < 0.32) {
          e.state = 'dash';
          e.stateT = 0.35;
          const ta = Math.atan2(p.y - e.y, p.x - e.x);
          e.cdx = Math.cos(ta); e.cdy = Math.sin(ta);
          e.actT = e.phase === 2 ? 0.9 : 1.4;
        } else if (roll < 0.65) {
          const n = e.phase === 2 ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const aa = a + (i - (n - 1) / 2) * 0.14;
            s.bullets.push(new G.Bullet({ x: e.x, y: e.y, vx: Math.cos(aa) * 320, vy: Math.sin(aa) * 320, dmg: e.dmg, r: 4, color: '#c084fc', friendly: false }));
          }
          G.audio.play('eshoot');
          e.actT = 1.2;
        } else {
          this.bossRingAttack(s, e, e.phase === 2 ? 20 : 14, e.phase === 2 ? 200 : 170);
          if (e.phase === 2) {
            for (let i = 0; i < 2; i++) {
              const sm = this.spawnEnemy(s, 'bat', e.x + G.rand(-60, 60), e.y + G.rand(-60, 60), false);
              if (sm) { sm.summoned = true; s.enemies.push(sm); }
            }
          }
          e.actT = 2.0;
        }
      }
    },

    // Boss 更新（多阶段弹幕、跳跃、冲刺等特殊技能）
    updateBoss(s, e, dt) {
      const p = s.player;
      if (!p || p.dead) return;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      e.phaseT = (e.phaseT || 0) + dt;

      // 阶段切换：50% HP 进入第二阶段
      const hpRatio = e.hp / e.maxHp;
      if (hpRatio < 0.5 && e.phase === 1) {
        e.phase = 2;
        G.FX.float(e.x, e.y - 60, '第二阶段!', '#f87171', 22);
        G.FX.addShake(10);
        G.FX.burst(e.x, e.y, '#ffd54f', 20, 250, 5);
        e.actT = 0.8;
      }

      // 移动逻辑
      if (e.type === 'slimeking') {
        if (e.state === 'jump') {
          e.x += (e.jumpTx - e.x) * Math.min(1, 3 * dt);
          e.y += (e.jumpTy - e.y) * Math.min(1, 3 * dt);
          e.stateT -= dt;
          if (e.stateT <= 0) {
            e.state = 'idle';
            G.FX.burst(e.x, e.y, e.color, 16, 220, 5);
            G.FX.addShake(8);
            G.audio.play('boom');
            if (G.dist(e.x, e.y, p.x, p.y) < 130) p.takeDamage(e.dmg, s);
            if (e.summonSlime) {
              for (let i = 0; i < 2; i++) {
                const sm = this.spawnEnemy(s, 'slime', e.x + G.rand(-70, 70), e.y + G.rand(-70, 70), false);
                if (sm) { sm.summoned = true; s.enemies.push(sm); }
              }
            }
          }
        } else {
          e.x += nx * e.speed * (e.phase === 2 ? 1.5 : 1) * dt + (e.kx || 0) * dt;
          e.y += ny * e.speed * (e.phase === 2 ? 1.5 : 1) * dt + (e.ky || 0) * dt;
        }
      } else if (e.type === 'turretboss') {
        // 机枪boss缓慢移动，避免卡住
        e.x += nx * 20 * dt + (e.kx || 0) * dt;
        e.y += ny * 20 * dt + (e.ky || 0) * dt;
      } else if (e.type === 'darkknight') {
        if (e.state === 'dash') {
          e.x += e.cdx * e.speed * 2.8 * dt;
          e.y += e.cdy * e.speed * 2.8 * dt;
          e.stateT -= dt;
          if (e.stateT <= 0) e.state = 'idle';
          if (G.dist(e.x, e.y, p.x, p.y) < e.r + p.r) p.takeDamage(e.dmg, s);
        } else {
          e.x += nx * e.speed * 0.7 * dt + (e.kx || 0) * dt;
          e.y += ny * e.speed * 0.7 * dt + (e.ky || 0) * dt;
        }
      }

      // 地图边界限制
      e.x = G.clamp(e.x, 40, MAP_W - 40);
      e.y = G.clamp(e.y, 40, MAP_H - 40);

      // 墙壁碰撞（滑动）
      if (inWall(e.x, e.y, e.r)) {
        if (!inWall(e.x - (e.kx || 0) * dt, e.y, e.r)) {
          e.x -= (e.kx || 0) * dt;
        } else if (!inWall(e.x, e.y - (e.ky || 0) * dt, e.r)) {
          e.y -= (e.ky || 0) * dt;
        }
        // 元晶守卫战：Boss 仍卡在墙内则推出到最近可通行位置（防软锁）
        if (inWall(e.x, e.y, e.r)) {
          let pushed = false;
          for (const [dx, dy] of [[-40, 0], [40, 0], [0, -40], [0, 40], [-40, -40], [40, -40], [-40, 40], [40, 40]]) {
            if (!inWall(e.x + dx, e.y + dy, e.r)) {
              e.x += dx; e.y += dy; pushed = true; break;
            }
          }
          if (!pushed) { e.x = CROSS_CX; e.y = CROSS_CY; }
        }
      }

      // 攻击计时
      e.actT -= dt;
      if (e.actT <= 0 && e.state !== 'jump' && e.state !== 'dash') {
        this.bossDoAttack(s, e, nx, ny, d);
      }

      // 接触伤害
      if ((e.contactCd || 0) <= 0 && p.invuln <= 0 && G.dist(e.x, e.y, p.x, p.y) < e.r + p.r) {
        p.takeDamage(e.dmg, s);
        e.contactCd = 0.8;
      }
      e.contactCd = Math.max(0, (e.contactCd || 0) - dt);
    },

    updateEnemy(s, e, dt) {
      // 状态效果
      e.slowT = Math.max(0, (e.slowT || 0) - dt);
      e.burnT = Math.max(0, (e.burnT || 0) - dt);
      e.burnTick = (e.burnTick || 0) + dt;
      while (e.burnTick >= 0.5 && e.burnT > 0) {
        e.burnTick -= 0.5;
        e.hp -= 2;
        G.FX.burst(e.x, e.y, '#fb923c', 3, 80, 2);
        if (e.hp <= 0) { this.killEnemy(s, e); return; }
      }
      e.poisonT = Math.max(0, (e.poisonT || 0) - dt);
      e.poisonTick = (e.poisonTick || 0) + dt;
      while (e.poisonTick >= 0.5 && e.poisonT > 0) {
        e.poisonTick -= 0.5;
        e.hp -= 1.5;
        G.FX.burst(e.x, e.y, '#4ade80', 3, 60, 2);
        if (e.hp <= 0) { this.killEnemy(s, e); return; }
      }
      // 击退力衰减
      e.kx = (e.kx || 0) * Math.max(0, 1 - 10 * dt);
      e.ky = (e.ky || 0) * Math.max(0, 1 - 10 * dt);
      // Boss 使用专用 AI
      if (e.boss) { this.updateBoss(s, e, dt); return; }
      const slowMult = e.slowT > 0 ? (1 - (e.empSlow || 0.4)) : 1;

      // 仇恨计时器衰减
      e.aggroTimer = Math.max(0, (e.aggroTimer || 0) - dt);
      // 玩家在敌人200px范围内自动触发仇恨
      if (!s.player.dead && G.dist(e.x, e.y, s.player.x, s.player.y) < 200) {
        e.aggroTimer = 3;
      }

      // ============== 优先级目标选择 ==============
      // 默认兜底目标：元晶
      let target = s.crystal;
      let targetPriority = 0; // 0=元晶, 1=玩家, 2=蚀晶炮台, 3=围墙

      // 高域突袭者：始终飞向元晶
      if (e.isFlyer) {
        target = s.crystal;
        targetPriority = 0;
      } else {
        // 优先级3：检查路径上的围墙（阻挡通向元晶或玩家的路径）
        // 无仇恨时只看元晶方向；对玩家产生仇恨后，挡在去玩家路上的围墙也必须先拆
        const targetAngs = [Math.atan2(CRYSTAL_Y - e.y, CRYSTAL_X - e.x)];
        const targetDists = [G.dist(e.x, e.y, CRYSTAL_X, CRYSTAL_Y)];
        if (!s.player.dead && e.aggroTimer > 0) {
          targetAngs.push(Math.atan2(s.player.y - e.y, s.player.x - e.x));
          targetDists.push(G.dist(e.x, e.y, s.player.x, s.player.y));
        }
        let bestBarrier = null, bestBarrierDist = Infinity;
        for (const d of s._barriers || []) {
          const bdx = d.x - e.x, bdy = d.y - e.y;
          const barrierDist2 = bdx * bdx + bdy * bdy;
          if (barrierDist2 >= bestBarrierDist) continue;
          const barrierAng = Math.atan2(d.y - e.y, d.x - e.x);
          for (let k = 0; k < targetAngs.length; k++) {
            // 围墙必须在敌人通向目标的路径上（角度偏差<45度 + 距离比目标近）
            const angDiff = Math.abs(G.wrapAngle(barrierAng - targetAngs[k]));
            const barrierMaxD2 = (targetDists[k] + 40) * (targetDists[k] + 40);
            if (angDiff < 0.8 && barrierDist2 < barrierMaxD2) {
              bestBarrier = d;
              bestBarrierDist = barrierDist2;
              break;
            }
          }
        }
        if (bestBarrier) {
          target = bestBarrier;
          targetPriority = 3;
        }

        // 优先级2：检查攻击范围内的蚀晶炮台（正在对自己造成伤害的）
        if (targetPriority < 2) {
          let bestTurret = null, bestTurretDist = Infinity;
          for (const d of s._turrets || []) {
            // 蚀晶炮台类型且能攻击到敌人（等级属性已写入实例）
            if (!d.range) continue;
            const tdx = e.x - d.x, tdy = e.y - d.y;
            const dist2 = tdx * tdx + tdy * tdy;
            const range2 = (d.range + 40) * (d.range + 40);
            if (dist2 < range2 && dist2 < bestTurretDist) {
              bestTurret = d;
              bestTurretDist = dist2;
            }
          }
          if (bestTurret) {
            target = bestTurret;
            targetPriority = 2;
          }
        }

        // 优先级1：玩家（有仇恨 + 存活 + 在攻击距离内）
        if (targetPriority < 1 && !s.player.dead && e.aggroTimer > 0) {
          const playerDist = G.dist(e.x, e.y, s.player.x, s.player.y);
          if (playerDist < 350) {
            target = s.player;
            targetPriority = 1;
          }
        }

        // 劫掠蚀徒：有晶防装置在范围内时优先攻击晶防装置
        if (e.isRaider) {
          let bestDev = null, bd = Infinity;
          for (const d of s.devices) {
            if (d.hp <= 0) continue;
            const dist = G.dist(e.x, e.y, d.x, d.y);
            if (dist < bd) { bd = dist; bestDev = d; }
          }
          if (bestDev && bd < 400) {
            target = bestDev;
            targetPriority = 2;
          }
        }

        // Boss：优先攻击晶防装置
        if (e.boss) {
          let bestDev = null, bd = Infinity;
          for (const d of s.devices) {
            if (d.hp <= 0) continue;
            const dist = G.dist(e.x, e.y, d.x, d.y);
            if (dist < bd) { bd = dist; bestDev = d; }
          }
          if (bestDev && bd < 300) {
            target = bestDev;
            targetPriority = targetPriority >= 2 ? targetPriority : 2;
          }
        }
      }

      const tx = target.x, ty = target.y;
      const targetR = target.r || 20;

      // 移动
      if (e.isFlyer) {
        // 高域突袭者直接飞向元晶，无视路障，但不能穿墙
        const ang = Math.atan2(CRYSTAL_Y - e.y, CRYSTAL_X - e.x);
        let fmx = Math.cos(ang) * e.speed * slowMult * dt + (e.kx || 0) * dt;
        let fmy = Math.sin(ang) * e.speed * slowMult * dt + (e.ky || 0) * dt;
        // 墙壁碰撞（滑动而非穿墙）
        const fnx = e.x + fmx, fny = e.y + fmy;
        if (inWall(fnx, fny, e.r)) {
          if (!inWall(e.x + fmx, e.y, e.r)) {
            fmy = 0;
          } else if (!inWall(e.x, e.y + fmy, e.r)) {
            fmx = 0;
          } else {
            // 卡角脱困：沿墙滑动
            const tries = [
              { a: ang + 0.5, s: 0.5 }, { a: ang - 0.5, s: 0.5 },
              { a: ang + 1.0, s: 0.5 }, { a: ang - 1.0, s: 0.5 },
              { a: 0, s: 0.6 }, { a: Math.PI, s: 0.6 },
              { a: Math.PI / 2, s: 0.6 }, { a: -Math.PI / 2, s: 0.6 }
            ];
            let found = false;
            for (const tr of tries) {
              const tmx = Math.cos(tr.a) * e.speed * slowMult * dt * tr.s;
              const tmy = Math.sin(tr.a) * e.speed * slowMult * dt * tr.s;
              if (!inWall(e.x + tmx, e.y + tmy, e.r)) { fmx = tmx; fmy = tmy; found = true; break; }
            }
            if (!found) { fmx = 0; fmy = 0; }
          }
        }
        e.x += fmx;
        e.y += fmy;
        // 到达元晶后自爆
        if (G.dist(e.x, e.y, CRYSTAL_X, CRYSTAL_Y) < CRYSTAL_R + e.r) {
          this.damageCrystal(s, e.dmg);
          e.dead = true;
          G.FX.burst(e.x, e.y, e.color, 8, 120, 3);
          G.audio.play('hit');
        }
      } else {
        // 路径点导航：上下端怪物先走到十字中心，避免蹭墙
        let moveTargetX = tx, moveTargetY = ty;
        const inTopChannel = Math.abs(e.x - CROSS_CX) < HALL_W * 0.4 && e.y < CROSS_CY - HALL_W * 0.35;
        const inBottomChannel = Math.abs(e.x - CROSS_CX) < HALL_W * 0.4 && e.y > CROSS_CY + HALL_W * 0.35;
        if ((inTopChannel || inBottomChannel) && G.dist(e.x, e.y, CROSS_CX, CROSS_CY) > 40) {
          // 上下通道中的敌人：先走到十字中心再转向目标
          moveTargetX = CROSS_CX;
          moveTargetY = CROSS_CY;
        }
        // 普通移动
        const ang = Math.atan2(moveTargetY - e.y, moveTargetX - e.x);
        let mx = Math.cos(ang) * e.speed * slowMult * dt + (e.kx || 0) * dt;
        let my = Math.sin(ang) * e.speed * slowMult * dt + (e.ky || 0) * dt;
        // 路障碰撞（非当前目标的围墙才绕行，目标围墙直接撞上去攻击）
        for (const d of s._barriers || []) {
          if (d === target) continue; // 目标围墙不绕行，直接撞
          const dist = G.dist(e.x + mx, e.y + my, d.x, d.y);
          if (dist < e.r + d.r + 4) {
            const ba = Math.atan2(e.y + my - d.y, e.x + mx - d.x);
            mx = Math.cos(ba) * e.speed * dt * 0.3;
            my = Math.sin(ba) * e.speed * dt * 0.3;
          }
        }
        // 墙壁碰撞（滑动而非硬推，冲锋时无视）
        if (e.state !== 'charge') {
          const nx = e.x + mx, ny = e.y + my;
          if (inWall(nx, ny, e.r)) {
            if (!inWall(e.x + mx, e.y, e.r)) {
              my = 0;
            } else if (!inWall(e.x, e.y + my, e.r)) {
              mx = 0;
            } else {
              // 元晶守卫战：卡角脱困——依次尝试偏转角和四个方向，避免敌人被挤进墙边带后永久卡死（蚀潮无法结束）
              const tries = [
                { a: ang + 0.5, s: 0.5 }, { a: ang - 0.5, s: 0.5 },
                { a: ang + 1.0, s: 0.5 }, { a: ang - 1.0, s: 0.5 },
                { a: 0, s: 0.6 }, { a: Math.PI, s: 0.6 },
                { a: Math.PI / 2, s: 0.6 }, { a: -Math.PI / 2, s: 0.6 }
              ];
              let found = false;
              for (const t of tries) {
                const tx2 = e.x + Math.cos(t.a) * e.speed * slowMult * dt * t.s;
                const ty2 = e.y + Math.sin(t.a) * e.speed * slowMult * dt * t.s;
                if (!inWall(tx2, ty2, e.r)) {
                  mx = Math.cos(t.a) * e.speed * slowMult * dt * t.s;
                  my = Math.sin(t.a) * e.speed * slowMult * dt * t.s;
                  found = true;
                  break;
                }
              }
              if (!found) { mx = 0; my = 0; }
            }
          }
        }
        e.x += mx;
        e.y += my;
      }

      // 地图边界
      e.x = G.clamp(e.x, 8, MAP_W - 8);
      e.y = G.clamp(e.y, 8, MAP_H - 8);

      // ============== 特殊敌人行为 ==============
      // 减速光环（凝霜蚀兽）
      if (e.slowAura > 0 && !s.player.dead) {
        if (G.dist(e.x, e.y, s.player.x, s.player.y) < e.slowAura) {
          s.player.slowT = 0.3;
        }
      }
      // 治疗光环（蚀纹祭司）
      if (e.healInterval > 0) {
        e._healT = (e._healT || 0) - dt;
        if (e._healT <= 0) {
          e._healT = e.healInterval;
          let healed = false;
          for (const ally of s.enemies) {
            if (ally.dead || ally === e) continue;
            if (G.dist(e.x, e.y, ally.x, ally.y) < (e.healRange || 200)) {
              ally.hp = Math.min(ally.maxHp, ally.hp + (e.healAmount || 15));
              G.FX.float(ally.x, ally.y - 20, '+' + (e.healAmount || 15), '#4ade80', 13);
              healed = true;
            }
          }
          if (healed) G.audio.play('heal');
        }
      }
      // 火焰路径（燃迹猎犬）
      if (e.fireTrail) {
        e._fireTrailT = (e._fireTrailT || 0) - dt;
        if (e._fireTrailT <= 0) {
          e._fireTrailT = 0.3;
          if (!s.fireTrails) s.fireTrails = [];
          s.fireTrails.push({ x: e.x, y: e.y, r: 18, life: 3, dmg: e.dmg * 0.5 });
        }
      }
      // 冲锋攻击（厚甲蚀卫/蚀壳冲撞虫/蛮荒冲撞者）——仅近距离发动，避免远处直接飞脸
      if (e.charge) {
        e._chargeCd = (e._chargeCd || 0) - dt;
        if (e._chargeCd <= 0 && e.state !== 'charge') {
          if (G.dist(e.x, e.y, target.x, target.y) <= 260) {
            e._chargeCd = G.rand(3, 5);
            e.state = 'charge';
            e.stateT = 0.45;
            e._chargeAng = Math.atan2(target.y - e.y, target.x - e.x);
            G.FX.float(e.x, e.y - 20, '冲锋!', '#f97316', 14);
          }
        }
        if (e.state === 'charge') {
          e.stateT -= dt;
          const cSpeed = e.speed * 2.3 * slowMult;
          const cx = e.x + Math.cos(e._chargeAng) * cSpeed * dt;
          const cy = e.y + Math.sin(e._chargeAng) * cSpeed * dt;
          // 冲锋撞墙：立即停止冲锋并推出
          if (inWall(cx, cy, e.r)) {
            e.state = 'idle';
            e.unstoppable = false;
          } else {
            e.x = cx; e.y = cy;
            e.unstoppable = true;
          }
          if (e.stateT <= 0) { e.state = 'idle'; e.unstoppable = false; }
        }
      }
      // 传送（影刃蚀刺）
      if (e.teleport > 0 && !s.player.dead) {
        e._teleportT = (e._teleportT || 0) - dt;
        if (e._teleportT <= 0) {
          e._teleportT = e.teleport;
          const ta = Math.atan2(s.player.y - e.y, s.player.x - e.x) + G.rand(-0.5, 0.5);
          const td = G.rand(60, 100);
          e.x = G.clamp(s.player.x - Math.cos(ta) * td, 30, MAP_W - 30);
          e.y = G.clamp(s.player.y - Math.sin(ta) * td, 30, MAP_H - 30);
          G.FX.burst(e.x, e.y, '#4c1d95', 8, 100, 3);
          G.audio.play('spawn');
        }
      }
      // 隐身（蚀根植体）
      if (e.hide) {
        const distToPlayer = G.dist(e.x, e.y, s.player.x, s.player.y);
        e._hidden = distToPlayer > (e.detectRange || 180);
      }
      // 长枪攻击（精锐刺锋卫）——被路障遮挡视线时无法刺中玩家
      if (e.lanceRange > 0 && !s.player.dead) {
        e._lanceCd = (e._lanceCd || 0) - dt;
        if (e._lanceCd <= 0) {
          const distToPlayer = G.dist(e.x, e.y, s.player.x, s.player.y);
          if (distToPlayer < e.lanceRange && !barrierBlocks(s, e.x, e.y, s.player.x, s.player.y)) {
            e._lanceCd = 2.5;
            const ang = Math.atan2(s.player.y - e.y, s.player.x - e.x);
            // 绘制枪线
            const lx = e.x + Math.cos(ang) * e.lanceRange;
            const ly = e.y + Math.sin(ang) * e.lanceRange;
            G.FX.burst(lx, ly, '#fbbf24', 5, 40, 2);
            s.player.takeDamage(e.dmg, s);
            s.player.kx = Math.cos(ang) * (e.lanceKnock || 120);
            s.player.ky = Math.sin(ang) * (e.lanceKnock || 120);
            G.audio.play('hit');
          }
          e._lanceCd = 2.5;
        }
      }
      // 正面护盾（重甲型蚀铁卫）：正面减伤在接触伤害处处理
      // 无视击退（重蚀岩甲像）
      if (e.unstoppable && e.state !== 'charge') {
        e.kx = 0; e.ky = 0;
      }
      // 复活死灵（亡纹招魂师）
      if (e.reviveInterval > 0) {
        e._reviveT = (e._reviveT || 0) - dt;
        if (e._reviveT <= 0) {
          e._reviveT = e.reviveInterval;
          const deadAllies = s.enemies.filter(a => a.dead && G.dist(e.x, e.y, a.x, a.y) < 200);
          if (deadAllies.length > 0) {
            const ally = G.pick(deadAllies);
            ally.dead = false;
            ally.hp = Math.ceil(ally.maxHp * 0.4);
            G.FX.burst(ally.x, ally.y, '#6b21a8', 8, 100, 3);
            G.FX.float(ally.x, ally.y - 20, '复活!', '#c084fc', 14);
          }
        }
      }
      // 接触伤害（对所有目标类型）
      e.contactCd = (e.contactCd || 0) - dt;
      if (e.contact && e.contactCd <= 0) {
        // 对围墙/晶防装置
        for (const d of s.devices) {
          if (d.hp <= 0) continue;
          if (G.dist(e.x, e.y, d.x, d.y) < e.r + d.r) {
            e.contactCd = 0.5;
            let dmg = e.dmg;
            if (e.isRaider) dmg *= 1.5;
            d.hp -= dmg;
            G.FX.burst(d.x, d.y, '#f87171', 3, 60, 2);
            // 尖刺路障：近战反伤（等级属性已写入实例）
            const spikeDmg = d.spikeDmg || DEVICES[d.type].spikeDmg;
            if (spikeDmg && !e.dead && e.spawnIn <= 0) {
              e.takeDamage(spikeDmg, s, {});
              G.FX.burst(e.x, e.y, '#e2e8f0', 4, 80, 2);
            }
            if (e.boss) {
              // Boss 范围伤害
              for (const d2 of s.devices) {
                if (d2 === d || d2.hp <= 0) continue;
                if (G.dist(d.x, d.y, d2.x, d2.y) < 80) {
                  d2.hp -= dmg * 0.5;
                  G.FX.burst(d2.x, d2.y, '#f87171', 2, 40, 1);
                }
              }
              if (!s.player.dead && G.dist(d.x, d.y, s.player.x, s.player.y) < 80) {
                s.player.takeDamage(dmg * 0.3, { enemies: s.enemies, bullets: s.bullets });
              }
            }
            if (d.hp <= 0) {
              G.FX.burst(d.x, d.y, d.color, 8, 120, 3);
            }
            break;
          }
        }
        // 对玩家
        if (e.contact && !s.player.dead && !e.isFlyer && e.contactCd <= 0) {
          if (G.dist(e.x, e.y, s.player.x, s.player.y) < e.r + s.player.r) {
            e.contactCd = 0.5;
            s.player.takeDamage(e.dmg, s);
            e.aggroTimer = 3; // 贴脸触发仇恨
            // 击晕（蛮荒冲撞者）
            if (e.stunOnHit > 0) s.player.stunT = e.stunOnHit;
            // 生命偷取（残虚术者）
            if (e.lifesteal > 0) {
              e.hp = Math.min(e.maxHp, e.hp + e.lifesteal);
              G.FX.float(e.x, e.y - 15, '+' + e.lifesteal, '#4ade80', 11);
            }
            if (e.contactBomb) {
              this.damageCrystal(s, e.bombDmg);
              G.FX.burst(e.x, e.y, '#ef4444', 12, 180, 4);
              e.dead = true;
              G.audio.play('hit');
              for (const d of s.devices) {
                if (G.dist(e.x, e.y, d.x, d.y) < e.bombRange) {
                  d.hp -= e.bombDmg;
                  if (d.hp <= 0) G.FX.burst(d.x, d.y, d.color, 6, 100, 3);
                }
              }
              if (G.dist(e.x, e.y, s.player.x, s.player.y) < e.bombRange) {
                s.player.takeDamage(e.bombDmg * 0.5, { enemies: s.enemies, bullets: s.bullets });
              }
            }
          }
        }
        // 对元晶
        if (e.contact && !e.isFlyer && e.contactCd <= 0) {
          if (G.dist(e.x, e.y, CRYSTAL_X, CRYSTAL_Y) < CRYSTAL_R + e.r) {
            e.contactCd = 0.5;
            this.damageCrystal(s, e.dmg);
          }
        }
      }

      // 远程攻击（限制攻击范围，不隔全图开火）
      if (e.ranged && !e._hidden) {
        e.fireT -= dt;
        const distToTarget = G.dist(e.x, e.y, target.x, target.y);
        const maxRange = 350;
        if (distToTarget < maxRange && e.fireT <= 0) {
          const atx = target.x, aty = target.y;
          const ang = Math.atan2(aty - e.y, atx - e.x);
          let bSpeed = e.bSpeed;
          let bDmg = e.dmg;
          let bColor = e.color;
          let canShoot = true;
          // 蓄力射击（蓄力晶弩手）
          if (e.chargedShot) {
            e._chargeT = (e._chargeT || 0) + dt;
            e.fireT = 0.05; // 持续检查直到充满
            if (e._chargeT < (e.chargeTime || 1.5)) {
              canShoot = false; // 未充满，等待
            } else {
              e._chargeT = 0;
              bDmg = e.chargedDmg || e.dmg;
              bSpeed = e.bSpeed * 1.5;
              bColor = '#f59e0b';
              G.FX.burst(e.x, e.y, '#f59e0b', 4, 60, 2);
            }
          }
          // 目标为玩家且被路障遮挡视线时不发射（路障是有效掩体）
          if (canShoot && target === s.player && barrierBlocks(s, e.x, e.y, s.player.x, s.player.y)) {
            canShoot = false;
          }
          if (canShoot) {
            // 弧形弹道（哥布林）
            if (e.arc) {
              const arcAng = ang + G.rand(-0.3, 0.3);
              s.bullets.push(new G.Bullet({
                x: e.x + Math.cos(arcAng) * e.r, y: e.y + Math.sin(arcAng) * e.r,
                vx: Math.cos(arcAng) * bSpeed * 0.8, vy: Math.sin(arcAng) * bSpeed * 0.8 - 60,
                dmg: bDmg, r: 3, color: bColor, friendly: false, gravity: 200
              }));
            } else {
              const b = new G.Bullet({
                x: e.x + Math.cos(ang) * e.r, y: e.y + Math.sin(ang) * e.r,
                vx: Math.cos(ang) * bSpeed, vy: Math.sin(ang) * bSpeed,
                dmg: bDmg, r: 3, color: bColor, friendly: false
              });
              // 减速射击（寒冻投核者）
              if (e.slowShot > 0) b.slow = e.slowShot;
              s.bullets.push(b);
            }
            e.fireT = 1 / e.rate;
        }
      }
      }

      // 虚纹召唤者（元晶守卫战）：不能召唤虚纹召唤者，避免递归爆炸；场上过多时停止召唤
      if (e.isSummoner) {
        e.summonTimer -= dt;
        if (e.summonTimer <= 0) {
          e.summonTimer = 3;
          if (s.enemies.length < 150) {
            const pool = this.getAvailableMonsterPool(s).filter(t => t !== 'summoner');
            if (pool.length > 0) {
              const sm = this.spawnEnemy(s, G.pick(pool), e.x + G.rand(-30, 30), e.y + G.rand(-30, 30), false);
              if (sm) { sm.summoned = true; s.enemies.push(sm); }
            }
          }
        }
      }

      // 低血量自爆（低血自爆兵）
      if (e.lowHpBomb && e.hp <= e.maxHp * 0.2 && !e._bombTriggered) {
        e._bombTriggered = true;
        e.hp = 0;
        G.FX.burst(e.x, e.y, '#ef4444', 15, (e.bombRange || 100) * 1.5, 5);
        G.audio.play('boom');
        // 伤害周围晶防装置
        for (const d of s.devices) {
          if (G.dist(e.x, e.y, d.x, d.y) < (e.bombRange || 100)) {
            d.hp -= (e.bombDmg || 8);
            if (d.hp <= 0) G.FX.burst(d.x, d.y, d.color, 6, 100, 3);
          }
        }
        // 伤害玩家
        if (!s.player.dead && G.dist(e.x, e.y, s.player.x, s.player.y) < (e.bombRange || 100)) {
          s.player.takeDamage((e.bombDmg || 8) * 0.5, s);
        }
      }

      // 死亡处理
      if (e.hp <= 0 && !e.dead) {
        this.killEnemy(s, e);
      }
    },

    killEnemy(s, e) {
      if (e.dead) return; // 防止重复击杀
      e.dead = true;
      s.kills++;
      if (e.boss) s.bossKills++;
      G.FX.burst(e.x, e.y, e.color, e.boss ? 20 : 10, e.boss ? 240 : 160, e.boss ? 5 : 3);
      G.audio.play(e.boss ? 'bossdie' : 'hit');
      // 自爆（孢囊自爆体）
      if (e.selfDestruct) {
        G.FX.burst(e.x, e.y, '#a855f7', 12, 150, 4);
        if (!s.player.dead && G.dist(e.x, e.y, s.player.x, s.player.y) < 120) {
          s.player.takeDamage(e.dmg * 1.5, s);
        }
        for (const d of s.devices) {
          if (d.hp <= 0) continue;
          if (G.dist(e.x, e.y, d.x, d.y) < 100) {
            d.hp -= e.dmg;
            if (d.hp <= 0) G.FX.burst(d.x, d.y, d.color, 6, 100, 3);
          }
        }
      }
      // 分裂（虚翼蝠群）
      if (e.splitType) {
        const st = e.splitType === 'mini_bat' ? 'bat' : e.splitType;
        for (let i = 0; i < 3; i++) {
          const sm = this.spawnEnemy(s, st, e.x + G.rand(-20, 20), e.y + G.rand(-20, 20), false);
          if (sm) { sm.summoned = true; sm.hp = sm.maxHp * 0.4; s.enemies.push(sm); }
        }
      }
      // 掉落金币
      const coinVal = e.coins ? (Array.isArray(e.coins) ? G.randint(e.coins[0], e.coins[1]) : e.coins[0]) : 2;
      const goldAmt = Math.round(coinVal * (e.elite ? 3 : 1) * (s.activeBuffs.goldMult || 1));
      s.gold += goldAmt; // 直接入账（燃烧/中毒/自爆击杀，粒子仅作表现）
      s.goldParticles.push({ x: e.x, y: e.y, tx: s.player.x, ty: s.player.y, life: 1.5, value: goldAmt });
      // 能量球概率掉落
      if (Math.random() < 0.2) {
        s.energyBalls.push({ x: e.x, y: e.y, tx: s.player.x, ty: s.player.y, life: 1.5, value: 15 });
      }
    },

    damageCrystal(s, dmg) {
      // 无敌模式下元晶不掉血
      if (s.cheats && s.cheats.god) return;
      if (s.crystal.shield > 0) {
        const absorbed = Math.min(s.crystal.shield, dmg);
        s.crystal.shield -= absorbed;
        dmg -= absorbed;
        G.FX.float(CRYSTAL_X, CRYSTAL_Y - 40, '护盾吸收 ' + absorbed, '#38bdf8', 14);
      }
      if (dmg > 0) {
        s.crystal.hp -= dmg;
        G.FX.burst(CRYSTAL_X, CRYSTAL_Y, '#f87171', 8, 120, 3);
        G.FX.addShake(8);
        G.audio.play('hurt');
      }
      if (s.crystal.hp <= 0) {
        s.crystal.hp = 0;
        this.finish(s, false);
      }
    },

    updateBullet(s, b, dt) {
      const wasFriendly = b.friendly && !b.dead;
      const bx = b.x, by = b.y;
      // 隐身敌人不受子弹伤害
      const hiddenHPs = new Map();
      if (b.friendly) {
        for (const e of s.enemies) {
          if (e._hidden && !e.dead) hiddenHPs.set(e, e.hp);
        }
      }
      b.update(s, dt);
      // 恢复隐身敌人被子弹打掉的HP
      for (const [e, hp] of hiddenHPs) {
        if (!e.dead && e.hp < hp) e.hp = hp;
      }
      // 玩家子弹击中敌人 → 触发仇恨
      if (wasFriendly && b.dead) {
        for (const e of s.enemies) {
          if (e.dead) continue;
          if (G.dist(bx, by, e.x, e.y) < e.r + b.r + 60) {
            e.aggroTimer = 3;
          }
        }
      }
      // 墙壁碰撞
      if (!b.dead && inWall(b.x, b.y, b.r)) {
        b.dead = true;
        G.FX.burst(b.x, b.y, b.color, 3, 60, 2);
        return;
      }
      // 子弹对晶防装置碰撞
      if (!b.dead) {
        for (const d of s.devices) {
          if (d.hp <= 0) continue;
          if (G.dist(b.x, b.y, d.x, d.y) < b.r + d.r) {
            // 友方子弹穿过我方建筑
            if (b.friendly) continue;
            d.hp -= b.dmg;
            G.FX.burst(d.x, d.y, '#f87171', 2, 40, 1);
            if (d.hp <= 0) {
              G.FX.burst(d.x, d.y, d.color, 8, 120, 3);
            }
            if (!b.pierce || b.pierce <= 0) { b.dead = true; break; }
            b.pierce--;
          }
        }
      }
      // 子弹对元晶碰撞
      if (!b.dead && !b.friendly) {
        if (G.dist(b.x, b.y, CRYSTAL_X, CRYSTAL_Y) < CRYSTAL_R + b.r) {
          this.damageCrystal(s, b.dmg);
          b.dead = true;
        }
      }
    },

    updateDevice(s, d, dt) {
      if (d.hp <= 0) return;
      // 属性已按等级写入晶防装置实例，直接读取实例字段
      // 机枪炮台
      if (d.range && d.rate && !d.burn) {
        // 晶防装置超频：攻速+50%、射程+15%（仅购买时快照的晶防装置）
        const oc = d.overclocked && (s.waveBuffs || []).indexOf('overclock') >= 0;
        const rng = oc ? d.range * 1.15 : d.range;
        const rate = oc ? d.rate * 1.5 : d.rate;
        d.fireT = (d.fireT || 0) - dt;
        if (d.fireT <= 0) {
          let best = null, bd = rng * rng;
          for (const e of s.enemies) {
            if (e.dead) continue;
            const dist = (e.x - d.x) * (e.x - d.x) + (e.y - d.y) * (e.y - d.y);
            if (dist < bd) { bd = dist; best = e; }
          }
          if (best) {
            d.fireT = 1 / rate;
            const ang = Math.atan2(best.y - d.y, best.x - d.x);
            s.bullets.push(new G.Bullet({
              x: d.x + Math.cos(ang) * d.r, y: d.y + Math.sin(ang) * d.r,
              vx: Math.cos(ang) * 400, vy: Math.sin(ang) * 400,
              dmg: d.dmg, r: 3, color: d.color, friendly: true
            }));
          }
        }
      }
      // 火焰炮台
      if (d.burn && d.range && d.rate) {
        const oc = d.overclocked && (s.waveBuffs || []).indexOf('overclock') >= 0;
        const rng = oc ? d.range * 1.15 : d.range;
        const rate = oc ? d.rate * 1.5 : d.rate;
        d.fireT = (d.fireT || 0) - dt;
        if (d.fireT <= 0) {
          d.fireT = 1 / rate;
          for (const e of s.enemies) {
            if (e.dead) continue;
            if (G.dist(e.x, e.y, d.x, d.y) < rng) {
              e.burnT = Math.max(e.burnT || 0, 1.5);
              e.takeDamage(d.dmg, s, {});
              // 炽焰扩散：点燃传染120px内相邻敌人
              if ((s.activeBuffs || {}).flameSpread) {
                for (const e2 of s.enemies) {
                  if (e2.dead || e2 === e) continue;
                  if (G.dist(e.x, e.y, e2.x, e2.y) < 120) {
                    e2.burnT = Math.max(e2.burnT || 0, 1.5);
                  }
                }
              }
            }
          }
        }
      }
      // 能量发生器
      if (d.auraEnergy && d.auraRange && !s.player.dead) {
        if (G.dist(s.player.x, s.player.y, d.x, d.y) < d.auraRange) {
          s.player.energy = Math.min(s.player.maxEnergy, s.player.energy + d.auraEnergy * dt);
          // 可视化能量粒子：从发生器飘向玩家
          d.energyParticleTimer = (d.energyParticleTimer || 0) - dt;
          if (d.energyParticleTimer <= 0) {
            d.energyParticleTimer = 0.3; // 每0.3秒产一个粒子
            s.energyBalls.push({
              x: d.x + G.rand(-8, 8), y: d.y + G.rand(-8, 8),
              tx: s.player.x, ty: s.player.y,
              life: 1.2, value: 0, // 纯视觉效果，能量已通过aura直接加
              fromDevice: true
            });
          }
        }
      }
      // 治疗图腾
      if (d.auraHeal && d.auraRange && !s.player.dead) {
        if (G.dist(s.player.x, s.player.y, d.x, d.y) < d.auraRange) {
          s.player.hp = Math.min(s.player.maxHp, s.player.hp + d.auraHeal * dt);
        }
      }
      // 电磁脉冲
      if (d.empRange && d.empSlow) {
        d.empCd = (d.empCd || 0) - dt;
        if (d.empCd <= 0) {
          d.empCd = d.empCd0 || 4;
          for (const e of s.enemies) {
            if (e.dead) continue;
            if (G.dist(e.x, e.y, d.x, d.y) < d.empRange) {
              e.slowT = Math.max(e.slowT || 0, 1.5);
              e.empSlow = d.empSlow;
            }
          }
          G.FX.burst(d.x, d.y, '#a78bfa', 5, 60, 2);
        }
      }
    },

    updateAlly(s, ally, dt) {
      ally.t -= dt;
      ally.life -= dt;
      if (ally.t <= 0) {
        ally.t = 0.5;
        let best = null, bd = 420 * 420;
        for (const e of s.enemies) {
          if (e.dead) continue;
          const d = (e.x - ally.x) * (e.x - ally.x) + (e.y - ally.y) * (e.y - ally.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const ang = Math.atan2(best.y - ally.y, best.x - ally.x);
          s.bullets.push(new G.Bullet({
            x: ally.x, y: ally.y, vx: Math.cos(ang) * 460, vy: Math.sin(ang) * 460,
            dmg: ally.dmg, r: 3, color: '#fb923c', friendly: true
          }));
        }
      }
    },

    updateGoldParticles(s, dt) {
      for (let i = s.goldParticles.length - 1; i >= 0; i--) {
        const gp = s.goldParticles[i];
        gp.life -= dt;
        if (gp.life <= 0) { s.goldParticles.splice(i, 1); continue; }
        // 飞向玩家
        const dx = s.player.x - gp.x, dy = s.player.y - gp.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 20) { s.goldParticles.splice(i, 1); continue; }
        const speed = 400;
        gp.x += (dx / dist) * speed * dt;
        gp.y += (dy / dist) * speed * dt;
      }
    },

    updateEnergyBalls(s, dt) {
      for (let i = s.energyBalls.length - 1; i >= 0; i--) {
        const eb = s.energyBalls[i];
        eb.life -= dt;
        if (eb.life <= 0) { s.energyBalls.splice(i, 1); continue; }
        const dx = s.player.x - eb.x, dy = s.player.y - eb.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 20) {
          s.player.energy = Math.min(s.player.maxEnergy, s.player.energy + eb.value);
          s.energyBalls.splice(i, 1);
          G.audio.play('pickup');
          continue;
        }
        const speed = 400;
        eb.x += (dx / dist) * speed * dt;
        eb.y += (dy / dist) * speed * dt;
      }
    },

    finish(s, win) {
      if (s.finished) return;
      s.finished = true;
      s.win = win;
      // 奖励计算
      const base = s.kills * 2 + s.wave * 15 + s.bossKills * 100;
      const crystalPct = s.crystal.hp / s.crystal.maxHp;
      const gems = Math.round(base * (1 + crystalPct * 0.5));
      s.gemsEarned = gems;
      G.save.gems += gems;
      G.save.runs++;
      G.save.kills += s.kills;
      if (win) G.save.wins++;
      G.save.bestSiegeWave = Math.max(G.save.bestSiegeWave || 0, s.wave);
      G.saveWrite();
      G.state = win ? 'victory' : 'gameover';
      G.audio.play(win ? 'win' : 'lose');
    }
  };

  // ==================== 绘制函数 ====================
  G.Siege.draw = function () {
    const s = G.game;
    if (!s) return;
    const ctx = G.ctx;
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, G.vw, G.vh);

    // 固定相机：地图居中
    ctx.save();
    ctx.translate(-Math.round(s.cam.x), -Math.round(s.cam.y));

    // 绘制地图背景
    this.drawMap(s);

    // 绘制网格
    this.drawGrid(s);

    // 绘制出生点
    this.drawSpawnPoints(s);

    // 绘制元晶
    this.drawCrystal(s);

    // 绘制晶防装置
    this.drawDevices(s);

    // 绘制金币粒子
    this.drawGoldParticles(s);

    // 绘制能量球
    this.drawEnergyBalls(s);

    // 绘制火径
    if (s.fireTrails) {
      for (const ft of s.fireTrails) {
        ctx.fillStyle = 'rgba(249,115,22,0.35)';
        ctx.beginPath(); ctx.arc(ft.x, ft.y, ft.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(251,146,60,0.5)';
        ctx.beginPath(); ctx.arc(ft.x, ft.y, ft.r * 0.6, 0, G.TAU); ctx.fill();
      }
    }

    // 绘制敌人
    this.drawEnemies(s);

    // 绘制子弹
    this.drawBullets(s);

    // 绘制玩家
    this.drawPlayer(s);

    // 绘制盟友（械晶哨塔）
    if (s.allies) {
      for (const ally of s.allies) {
        ctx.fillStyle = '#fb923c';
        ctx.beginPath(); ctx.arc(ally.x, ally.y, ally.r || 15, 0, G.TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ally.x, ally.y, ally.r || 15, 0, G.TAU); ctx.stroke();
      }
    }

    // 绘制放置提示（世界空间）
    if (s.placingDevice) this.drawPlacementHint(s);

    // 绘制特效（浮字、粒子等）
    G.FX.draw(ctx);

    ctx.restore();

    // HUD
    var uiX = Math.max(0, (G.vw - G.W) / 2);
    ctx.save();
    if (uiX > 0) ctx.translate(uiX, 0);
    this.drawHUD(s);
    if (s.shopOpen) this.drawShop(s);
    if (s.cheatOpen) this.drawCheatMenu(s);
    ctx.restore();
  };

  G.Siege.drawMap = function (s) {
    const ctx = G.ctx;
    // 地面底色
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // 通道区域（可通行）用浅色
    const hw = HALL_W / 2;
    ctx.fillStyle = '#1e2440';
    // 水平通道：从左端到右端
    ctx.fillRect(CRYSTAL_X - CRYSTAL_NO_BUILD_R - 20, CROSS_CY - hw, MAP_W - (CRYSTAL_X - CRYSTAL_NO_BUILD_R - 20), HALL_W);
    // 垂直通道：从顶端到底端
    ctx.fillRect(CROSS_CX - hw, 0, HALL_W, MAP_H);

    // 墙壁（深色）
    ctx.fillStyle = '#0f1323';
    for (const w of WALLS) {
      ctx.fillRect(w.x, w.y, w.w, w.h);
    }
    // 墙壁边缘
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    for (const w of WALLS) {
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }

    // 红色区间：元晶右侧的商人/建造区
    const zoneX = CRYSTAL_X + CRYSTAL_NO_BUILD_R + 20;
    const zoneY = CROSS_CY - hw + 20;
    const zoneW = CROSS_CX - hw - zoneX;
    const zoneH = HALL_W - 40;
    if (zoneW > 0) {
      ctx.fillStyle = 'rgba(239,68,68,0.08)';
      ctx.fillRect(zoneX, zoneY, zoneW, zoneH);
      ctx.strokeStyle = 'rgba(239,68,68,0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(zoneX, zoneY, zoneW, zoneH);
      ctx.setLineDash([]);
      G.text(ctx, '商人/建造区', zoneX + zoneW / 2, zoneY + zoneH / 2, 14, 'rgba(239,68,68,0.4)', 'center', true);
    }

    // 元晶不可建造区
    ctx.fillStyle = 'rgba(100,100,255,0.06)';
    ctx.beginPath(); ctx.arc(CRYSTAL_X, CRYSTAL_Y, CRYSTAL_NO_BUILD_R, 0, G.TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(100,100,255,0.15)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.arc(CRYSTAL_X, CRYSTAL_Y, CRYSTAL_NO_BUILD_R, 0, G.TAU); ctx.stroke();
    ctx.setLineDash([]);
  };

  G.Siege.drawGrid = function (s) {
    const ctx = G.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    const gridSize = 80;
    for (let x = 0; x < MAP_W; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); ctx.stroke();
    }
    for (let y = 0; y < MAP_H; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); ctx.stroke();
    }
  };

  G.Siege.drawSpawnPoints = function (s) {
    const ctx = G.ctx;
    for (const sp of SPAWN_POINTS) {
      // 紫色光柱
      const pulse = Math.sin(s.time * 3) * 0.3 + 0.7;
      ctx.fillStyle = 'rgba(168,85,247,' + (0.2 * pulse) + ')';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 60, 0, G.TAU); ctx.fill();
      ctx.fillStyle = 'rgba(168,85,247,' + (0.4 * pulse) + ')';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 40, 0, G.TAU); ctx.fill();
      ctx.fillStyle = '#a855f7';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 20, 0, G.TAU); ctx.fill();
      // 箭头指向元晶
      const ang = Math.atan2(CRYSTAL_Y - sp.y, CRYSTAL_X - sp.x);
      ctx.fillStyle = 'rgba(168,85,247,0.6)';
      ctx.save();
      ctx.translate(sp.x + Math.cos(ang) * 40, sp.y + Math.sin(ang) * 40);
      ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-8, -6); ctx.lineTo(-8, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  };

  G.Siege.drawCrystal = function (s) {
    const ctx = G.ctx;
    const c = s.crystal;
    // 光柱
    const pulse = Math.sin(s.time * 2) * 0.2 + 0.8;
    const hpRatio = c.hp / c.maxHp;
    let glowColor = hpRatio > 0.5 ? '#4ade80' : hpRatio > 0.3 ? '#fbbf24' : '#ef4444';
    // 外层光晕
    const grad = ctx.createRadialGradient(c.x, c.y, c.r * 0.5, c.x, c.y, c.r * 3);
    grad.addColorStop(0, glowColor.replace(')', ',0.5)').replace('rgb', 'rgba'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 3, 0, G.TAU); ctx.fill();

    // 元晶本体
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    // 菱形元晶
    ctx.moveTo(c.x, c.y - c.r);
    ctx.lineTo(c.x + c.r * 0.5, c.y);
    ctx.lineTo(c.x, c.y + c.r);
    ctx.lineTo(c.x - c.r * 0.5, c.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - c.r);
    ctx.lineTo(c.x + c.r * 0.25, c.y - c.r * 0.3);
    ctx.lineTo(c.x, c.y - c.r * 0.1);
    ctx.lineTo(c.x - c.r * 0.25, c.y - c.r * 0.3);
    ctx.closePath(); ctx.fill();

    // 护盾
    if (c.shield > 0) {
      ctx.strokeStyle = 'rgba(56,189,248,' + (0.5 + pulse * 0.3) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 10, 0, G.TAU); ctx.stroke();
    }

    // 血量条
    const barW = 80, barH = 8;
    const bx = c.x - barW / 2, by = c.y - c.r - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    G.roundRect(ctx, bx - 1, by - 1, barW + 2, barH + 2, 4); ctx.fill();
    ctx.fillStyle = glowColor;
    G.roundRect(ctx, bx, by, barW * hpRatio, barH, 4); ctx.fill();
    ctx.fillStyle = '#fff';
    G.text(ctx, Math.ceil(c.hp) + '/' + c.maxHp, c.x, by - 2, 12, '#fff', 'center', true);
  };

  G.Siege.drawDevices = function (s) {
    const ctx = G.ctx;
    const t = G.time || 0;
    for (const d of s.devices) {
      if (d.hp <= 0) continue;
      const r = d.r;
      const h = d.hp / d.maxHp;

      // 绘制晶防装置本体
      ctx.save();
      ctx.translate(d.x, d.y);

      switch (d.type) {
        case 'barrier':
          // 路障：Ⅰ木质 → Ⅱ钢铁 → Ⅲ尖刺
          if (d.tier >= 3) this._drawSpikeBarrier(ctx, r, h, t);
          else if (d.tier === 2) this._drawSteelBarrier(ctx, r, h, t);
          else this._drawWoodBarrier(ctx, r, h, t);
          break;
        case 'energy_gen':
          this._drawEnergyGen(ctx, r, h, t);
          break;
        case 'machine_gun':
          // 机枪：Ⅰ机枪 → Ⅱ/Ⅲ重机枪
          if (d.tier >= 2) this._drawGatlingTurret(ctx, r, h, t);
          else this._drawMachineGun(ctx, r, h, t);
          break;
        case 'flame_turret':
          // 火焰：Ⅰ火焰 → Ⅱ/Ⅲ喷火
          if (d.tier >= 2) this._drawInfernoTurret(ctx, r, h, t);
          else this._drawFlameTurret(ctx, r, h, t);
          break;
        case 'heal_totem':
          // 治疗：Ⅰ图腾 → Ⅱ/Ⅲ圣坛
          if (d.tier >= 2) this._drawHealShrine(ctx, r, h, t);
          else this._drawHealTotem(ctx, r, h, t);
          break;
        case 'emp_pulse':
          // 电磁：Ⅰ脉冲 → Ⅱ/Ⅲ核心
          if (d.tier >= 2) this._drawEmpMaster(ctx, r, h, t);
          else this._drawEmpPulse(ctx, r, h, t);
          break;
        default:
          ctx.fillStyle = d.color;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, G.TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, G.TAU); ctx.stroke();
      }

      ctx.restore();

      // 等级角标（Ⅱ/Ⅲ级金色小徽章）
      if (d.tier && d.tier > 1) {
        const tn = DEVICE_TIERS[d.tier].name;
        ctx.fillStyle = '#1f2937';
        ctx.beginPath(); ctx.arc(d.x, d.y - r - 10, 7, 0, G.TAU); ctx.fill();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(d.x, d.y - r - 10, 7, 0, G.TAU); ctx.stroke();
        G.text(ctx, tn, d.x, d.y - r - 6, 9, '#fbbf24', 'center', true);
      }

      // 光环效果（范围随晶防装置等级提升，读取实例字段）
      if (d.auraRange) {
        const pulse = 1 + Math.sin(t * 2) * 0.1;
        ctx.strokeStyle = d.color.replace(')', ',0.15)').replace('rgb', 'rgba');
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.auraRange * pulse, 0, G.TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (d.range && !d.auraRange) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.range, 0, G.TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (d.empRange) {
        const pulse = 1 + Math.sin(t * 3) * 0.08;
        ctx.strokeStyle = 'rgba(168,85,247,0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.empRange * pulse, 0, G.TAU); ctx.stroke();
        ctx.setLineDash([]);
      }

      // 血量条
      const barW = r * 2, barH = 4;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(d.x - barW / 2, d.y - r - 12, barW, barH);
      ctx.fillStyle = h > 0.5 ? '#4ade80' : h > 0.25 ? '#fbbf24' : '#ef4444';
      ctx.fillRect(d.x - barW / 2, d.y - r - 12, barW * h, barH);
    }
  };

  // ======== 各晶防装置绘制函数 ========

  // 木质路障：木栅栏风格
  G.Siege._drawWoodBarrier = function (ctx, r, hp, t) {
    const s = r; // 半边长
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-s + 2, -s + 2, s * 2, s * 2);
    // 主体木框
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.strokeStyle = '#5C2E0A';
    ctx.lineWidth = 2;
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    // 横梁
    ctx.fillStyle = '#A0522D';
    ctx.fillRect(-s, -s + 4, s * 2, 5);
    ctx.fillRect(-s, s - 9, s * 2, 5);
    // 竖板条
    ctx.fillStyle = '#6B3410';
    const planks = 4;
    for (let i = 0; i < planks; i++) {
      const px = -s + 4 + i * (s * 2 - 8) / (planks - 1);
      ctx.fillRect(px - 2, -s + 9, 4, s * 2 - 18);
    }
    // 木刺
    ctx.fillStyle = '#D2A679';
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const sx = -s + s * 0.5 * i + s * 0.25;
      ctx.moveTo(sx, -s);
      ctx.lineTo(sx + 4, -s - 6);
      ctx.lineTo(sx + 8, -s);
    }
    ctx.fill();
    // 损坏效果
    if (hp < 0.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s + 3, -s); ctx.lineTo(s - 5, s - 3);
      ctx.stroke();
    }
  };

  // 钢铁路障：金属墙壁风格
  G.Siege._drawSteelBarrier = function (ctx, r, hp, t) {
    const s = r;
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-s + 2, -s + 2, s * 2, s * 2);
    // 主体
    const grad = ctx.createLinearGradient(-s, -s, s, s);
    grad.addColorStop(0, '#cbd5e1');
    grad.addColorStop(0.5, '#94a3b8');
    grad.addColorStop(1, '#64748b');
    ctx.fillStyle = grad;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    // 铆钉
    ctx.fillStyle = '#334155';
    const rivetPos = [[-s + 6, -s + 6], [s - 6, -s + 6], [-s + 6, s - 6], [s - 6, s - 6]];
    for (const [rx, ry] of rivetPos) {
      ctx.beginPath(); ctx.arc(rx, ry, 3, 0, G.TAU); ctx.fill();
    }
    // 中线
    ctx.strokeStyle = 'rgba(71,85,105,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();
    // 损坏效果
    if (hp < 0.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s + 4, -s + 2); ctx.lineTo(s - 2, s - 4);
      ctx.moveTo(s - 2, -s + 2); ctx.lineTo(-s + 4, s - 4);
      ctx.stroke();
    }
  };

  // 能量发生器：旋转核心
  G.Siege._drawEnergyGen = function (ctx, r, hp, t) {
    const s = r;
    // 底座
    ctx.fillStyle = '#334155';
    ctx.fillRect(-s + 2, s - 6, s * 2 - 4, 6);
    ctx.fillRect(-s + 4, s - 10, s * 2 - 8, 4);
    // 主体
    const grad = ctx.createLinearGradient(0, -s, 0, s);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(0.5, '#0ea5e9');
    grad.addColorStop(1, '#0284c7');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-s + 4, -s);
    ctx.lineTo(s - 4, -s);
    ctx.lineTo(s - 2, s - 12);
    ctx.lineTo(-s + 2, s - 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0369a1';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 旋转能量环
    const angle = t * 3;
    ctx.save();
    ctx.translate(0, -s + r * 0.5);
    ctx.rotate(angle);
    ctx.strokeStyle = 'rgba(56,189,248,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, G.TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, G.TAU); ctx.fill();
    ctx.restore();
    // 能量粒子
    const pCount = 3;
    for (let i = 0; i < pCount; i++) {
      const pa = angle + i * G.TAU / pCount;
      const pr = 7 + Math.sin(t * 5 + i) * 2;
      ctx.fillStyle = 'rgba(56,189,248,' + (0.5 + Math.sin(t * 4 + i) * 0.3) + ')';
      ctx.beginPath();
      ctx.arc(Math.cos(pa) * pr, -s + r * 0.5 + Math.sin(pa) * pr, 2, 0, G.TAU);
      ctx.fill();
    }
  };

  // 机枪炮台：炮塔造型
  G.Siege._drawMachineGun = function (ctx, r, hp, t) {
    const s = r;
    // 底座
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(-s, s);
    ctx.lineTo(-s + 4, -s + 2);
    ctx.lineTo(s - 4, -s + 2);
    ctx.lineTo(s, s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 炮塔顶
    ctx.fillStyle = '#64748b';
    ctx.beginPath(); ctx.arc(0, -s + 5, s * 0.55, 0, G.TAU); ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -s + 5, s * 0.55, 0, G.TAU); ctx.stroke();
    // 炮管
    const aimAngle = Math.sin(t * 2) * 0.3;
    ctx.save();
    ctx.translate(0, -s + 5);
    ctx.rotate(aimAngle);
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, -3, s * 0.8, 6);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(s * 0.7, -4, 5, 8);
    ctx.restore();
    // 中心铆钉
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath(); ctx.arc(0, -s + 5, 3, 0, G.TAU); ctx.fill();
    // 射击闪光
    if (Math.sin(t * 10) > 0.7) {
      ctx.fillStyle = 'rgba(255,255,200,0.6)';
      ctx.beginPath();
      ctx.arc(0 + s * 0.8, -s + 5, 4, 0, G.TAU);
      ctx.fill();
    }
  };

  // 火焰炮台：火焰风格
  G.Siege._drawFlameTurret = function (ctx, r, hp, t) {
    const s = r;
    // 底座
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.moveTo(-s + 2, s);
    ctx.lineTo(-s, -s + 4);
    ctx.lineTo(s, -s + 4);
    ctx.lineTo(s - 2, s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 炮塔顶
    const grad = ctx.createRadialGradient(0, -s + 4, r * 0.2, 0, -s + 4, r * 0.6);
    grad.addColorStop(0, '#fbbf24');
    grad.addColorStop(0.6, '#f97316');
    grad.addColorStop(1, '#b91c1c');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, -s + 4, s * 0.55, 0, G.TAU); ctx.fill();
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -s + 4, s * 0.55, 0, G.TAU); ctx.stroke();
    // 火焰粒子
    const flameCount = 5;
    for (let i = 0; i < flameCount; i++) {
      const fa = (i / flameCount) * G.TAU + t * 2;
      const fr = s * 0.3 + Math.sin(t * 6 + i * 2) * 3;
      const fx = Math.cos(fa) * fr;
      const fy = -s + 4 + Math.sin(fa) * fr;
      ctx.fillStyle = 'rgba(251,191,36,' + (0.5 + Math.sin(t * 5 + i) * 0.3) + ')';
      ctx.beginPath(); ctx.arc(fx, fy, 3, 0, G.TAU); ctx.fill();
    }
    // 内部火心
    ctx.fillStyle = 'rgba(255,255,200,0.9)';
    ctx.beginPath(); ctx.arc(0, -s + 4, 3, 0, G.TAU); ctx.fill();
  };

  // 治疗图腾：图腾柱
  G.Siege._drawHealTotem = function (ctx, r, hp, t) {
    const s = r;
    // 底座
    ctx.fillStyle = '#166534';
    ctx.fillRect(-s + 2, s - 4, s * 2 - 4, 6);
    // 主体柱子
    const grad = ctx.createLinearGradient(-s, 0, s, 0);
    grad.addColorStop(0, '#22c55e');
    grad.addColorStop(0.5, '#4ade80');
    grad.addColorStop(1, '#16a34a');
    ctx.fillStyle = grad;
    ctx.fillRect(-s + 4, -s + 2, s * 2 - 8, s * 2 - 6);
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-s + 4, -s + 2, s * 2 - 8, s * 2 - 6);
    // 十字标识
    const crossW = s * 0.5, crossH = s * 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-crossW / 6, -crossH / 2, crossW / 3, crossH);
    ctx.fillRect(-crossW / 2, -crossH / 6, crossW, crossH / 3);
    // 光晕脉冲
    const pulse = 1 + Math.sin(t * 3) * 0.15;
    ctx.strokeStyle = 'rgba(74,222,128,' + (0.3 + Math.sin(t * 2) * 0.15) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, s * pulse, 0, G.TAU); ctx.stroke();
    // 粒子上升
    for (let i = 0; i < 3; i++) {
      const py = -s + (t * 30 + i * 20) % (s * 2);
      const px = Math.sin(t * 3 + i) * s * 0.5;
      ctx.fillStyle = 'rgba(74,222,128,' + (1 - py / (s * 2)) * 0.6 + ')';
      ctx.beginPath(); ctx.arc(px, py, 2, 0, G.TAU); ctx.fill();
    }
  };

  // 电磁脉冲：电磁线圈
  G.Siege._drawEmpPulse = function (ctx, r, hp, t) {
    const s = r;
    // 底座
    ctx.fillStyle = '#3b0764';
    ctx.fillRect(-s + 2, s - 4, s * 2 - 4, 6);
    // 主体
    const grad = ctx.createLinearGradient(0, -s, 0, s);
    grad.addColorStop(0, '#c084fc');
    grad.addColorStop(0.5, '#a78bfa');
    grad.addColorStop(1, '#7c3aed');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-s + 2, s - 6);
    ctx.lineTo(-s + 4, -s + 2);
    ctx.lineTo(s - 4, -s + 2);
    ctx.lineTo(s - 2, s - 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5b21b6';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 线圈环
    for (let i = 0; i < 3; i++) {
      const cy = -s + 6 + i * 6;
      ctx.strokeStyle = 'rgba(192,132,252,' + (0.4 + Math.sin(t * 5 + i) * 0.2) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-s + 5, cy);
      ctx.lineTo(s - 5, cy);
      ctx.stroke();
    }
    // 电弧
    ctx.strokeStyle = 'rgba(192,132,252,0.7)';
    ctx.lineWidth = 1.5;
    const arcCount = 3;
    for (let i = 0; i < arcCount; i++) {
      const aa = t * 4 + i * G.TAU / arcCount;
      const ar = s * 0.6 + Math.sin(t * 6 + i) * 3;
      ctx.beginPath();
      ctx.moveTo(0, -s + 2);
      const ex = Math.cos(aa) * ar;
      const ey = -s + 2 + Math.sin(aa) * ar;
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(ex, ey, 2, 0, G.TAU); ctx.fill();
    }
    // 脉冲波
    const waveR = (t * 60) % (s * 1.5);
    const waveAlpha = 1 - waveR / (s * 1.5);
    ctx.strokeStyle = 'rgba(168,85,247,' + (waveAlpha * 0.5) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -s + 2, waveR, 0, G.TAU); ctx.stroke();
  };

  G.Siege.drawGoldParticles = function (s) {
    const ctx = G.ctx;
    const t = G._time || 0;
    for (const gp of s.goldParticles) {
      const alpha = gp.life / 1.5;
      const pulse = 1 + Math.sin(t * 8 + gp.x) * 0.3;
      const r = 4 * pulse;
      // 光晕
      ctx.fillStyle = 'rgba(255,215,0,' + (alpha * 0.3) + ')';
      ctx.beginPath(); ctx.arc(gp.x, gp.y, r * 1.8, 0, G.TAU); ctx.fill();
      // 外圈
      ctx.fillStyle = 'rgba(255,200,0,' + alpha + ')';
      ctx.beginPath(); ctx.arc(gp.x, gp.y, r, 0, G.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(180,100,0,' + alpha + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(gp.x, gp.y, r, 0, G.TAU); ctx.stroke();
      // 内核亮点
      ctx.fillStyle = 'rgba(255,255,200,' + alpha + ')';
      ctx.beginPath(); ctx.arc(gp.x, gp.y, r * 0.4, 0, G.TAU); ctx.fill();
    }
  };

  G.Siege.drawEnergyBalls = function (s) {
    const ctx = G.ctx;
    const t = G._time || 0;
    for (const eb of s.energyBalls) {
      const alpha = eb.life / 1.5;
      const bob = Math.sin(t * 6 + eb.x) * 2;
      const by = eb.y + bob;
      if (eb.fromDevice) {
        // 晶防装置产生的蓝色能量粒子，带光晕
        ctx.fillStyle = 'rgba(37,99,235,' + (alpha * 0.4) + ')';
        ctx.beginPath(); ctx.arc(eb.x, by, 7, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(37,99,235,' + alpha + ')';
        ctx.beginPath(); ctx.arc(eb.x, by, 3, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(147,197,253,' + alpha + ')';
        ctx.beginPath(); ctx.arc(eb.x, by, 1.5, 0, G.TAU); ctx.fill();
      } else {
        // 普通能量球，带光晕
        ctx.fillStyle = 'rgba(56,189,248,' + (alpha * 0.3) + ')';
        ctx.beginPath(); ctx.arc(eb.x, by, 8, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(56,189,248,' + alpha + ')';
        ctx.beginPath(); ctx.arc(eb.x, by, 5, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(186,230,253,' + alpha + ')';
        ctx.beginPath(); ctx.arc(eb.x, by, 2, 0, G.TAU); ctx.fill();
      }
    }
  };

  G.Siege.drawEnemies = function (s) {
    const ctx = G.ctx;
    for (const e of s.enemies) {
      if (e.dead) continue;
      // 隐身怪（蚀根植体）：半透明
      if (e._hidden) {
        ctx.globalAlpha = 0.25;
        G.UI.drawEnemy(ctx, e, s);
        ctx.globalAlpha = 1;
        continue;
      }
      // 精英怪光圈
      if (e.elite) {
        ctx.strokeStyle = 'rgba(255,215,0,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, 0, G.TAU); ctx.stroke();
      }
      // 使用现有绘制逻辑
      G.UI.drawEnemy(ctx, e, s);
      // 血量条
      if (e.boss) {
        const hpRatio = e.hp / e.maxHp;
        const barW = e.r * 2, barH = 6;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - barW / 2, e.y - e.r - 16, barW, barH);
        ctx.fillStyle = hpRatio > 0.5 ? '#4ade80' : hpRatio > 0.25 ? '#fbbf24' : '#ef4444';
        ctx.fillRect(e.x - barW / 2, e.y - e.r - 16, barW * hpRatio, barH);
        ctx.fillStyle = '#fff';
        G.text(ctx, e.name, e.x, e.y - e.r - 22, 11, '#fff', 'center', true);
      }
    }
  };

  G.Siege.drawBullets = function (s) {
    const ctx = G.ctx;
    for (const b of s.bullets) {
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r || 3, 0, G.TAU); ctx.fill();
    }
  };

  G.Siege.drawPlayer = function (s) {
    const ctx = G.ctx;
    const p = s.player;
    if (p.dead) return;
    G.UI.drawPlayer(ctx, p);
  };

  G.Siege.drawHUD = function (s) {
    const ctx = G.ctx, p = s.player;
    // === 左上：角色属性（地牢模式风格）===
    G.text(ctx, '❤️', 10, 20, 13, '#f87171', 'center', true);
    G.drawBar(ctx, 26, 12, 210, 16, p.hp / p.maxHp, '#ef4444');
    G.text(ctx, Math.ceil(p.hp) + '/' + p.maxHp, 244, 20, 13, '#fff', 'center', true);
    G.text(ctx, '🛡️', 10, 39, 12, '#60a5fa', 'center', true);
    G.drawBar(ctx, 26, 33, 150, 12, p.armor / p.maxArmor, '#60a5fa');
    G.text(ctx, Math.round(p.armor) + '/' + p.maxArmor, 182, 39, 12, '#fff', 'center', true);
    G.text(ctx, '⚡', 10, 55, 12, '#38bdf8', 'center', true);
    G.drawBar(ctx, 26, 49, 150, 12, p.energy / p.maxEnergy, '#38bdf8');
    G.text(ctx, Math.floor(p.energy) + '/' + p.maxEnergy, 182, 55, 12, '#fff', 'center', true);
    G.text(ctx, p.emoji + ' ' + p.name, 16, 78, 15, '#fff', 'left', true);
    G.text(ctx, '重生: ' + s.respawns, 16, 96, 12, '#ffd54f', 'left');

    // 永久强化总览（仅显示有加成的项）
    const permParts = [];
    for (const upg of PERM_UPGRADES) {
      const lv = s.permUpgrades[upg.id] || 0;
      if (lv <= 0) continue;
      permParts.push(upg.icon + (upg.id === 'maxHp' ? '+' + lv * 5 + '生命'
        : upg.id === 'maxArmor' ? '+' + lv * 2 + '护甲'
        : upg.id === 'maxEnergy' ? '+' + lv * 20 + '能量'
        : upg.id === 'dmg' ? '+' + lv * 5 + '%攻'
        : upg.id === 'crit' ? '+' + lv * 3 + '%暴'
        : upg.id === 'fireRate' ? '+' + lv * 5 + '%速'
        : upg.id === 'petDmg' ? '+' + lv * 2 + '宠攻'
        : '-' + lv * 8 + '%宠速'));
    }
    if (permParts.length) {
      G.text(ctx, '⭐ ' + permParts.join(' '), 16, 114, 11, '#a78bfa', 'left', true);
    }

    // === 蚀潮临时增益图标（战斗期显示，灰/亮/已使用三态）===
    if (s.waveBuffs && s.waveBuffs.length) {
      G.text(ctx, '增益', 16, 132, 11, '#fbbf24', 'left', true);
      let bx = 52;
      for (const id of s.waveBuffs) {
        const b = BUFFS.find(x => x.id === id);
        if (!b) continue;
        const used = !!s.buffUsed[id];
        const active = !!s.buffActive[id];
        ctx.globalAlpha = (used || !active) ? 0.45 : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(bx, 130, 11, 0, G.TAU); ctx.fill();
        ctx.strokeStyle = used ? '#64748b' : (active ? '#4ade80' : '#64748b');
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, 130, 11, 0, G.TAU); ctx.stroke();
        G.text(ctx, b.icon, bx, 133, 12, '#fff', 'center', true);
        ctx.globalAlpha = 1;
        if (used) {
          G.text(ctx, '已用', bx, 144, 8, '#94a3b8', 'center', true);
        } else if (active) {
          G.text(ctx, '生效', bx, 144, 8, '#4ade80', 'center', true);
        } else {
          G.text(ctx, '待触发', bx, 144, 8, '#64748b', 'center', true);
        }
        bx += 26;
      }
    }

    // === 顶部中央：蚀潮信息 ===
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(G.W / 2 - 120, 0, 240, 40);
    const waveText = '第 ' + s.wave + ' 潮';
    G.text(ctx, waveText, G.W / 2, 14, 18, '#ffd54f', 'center', true);
    if (s.phase === 'fight') {
      const alive = s.spawnRemain + s.enemies.filter(e => !e.dead).length;
      G.text(ctx, '怪物剩余: ' + alive, G.W / 2, 32, 12, '#94a3b8', 'center');
      if (s.wave % 5 === 0 && !s.enemies.some(e => e.boss && !e.dead)) {
        G.text(ctx, '⚠ BOSS 潮', G.W / 2, 48, 13, '#f87171', 'center', true);
      }
    } else {
      G.text(ctx, '喘息期 ' + Math.ceil(s.restTimer) + 's', G.W / 2, 32, 14, '#4ade80', 'center', true);
      if ((s.wave + 1) % 5 === 0) {
        G.text(ctx, '⚠ 下一潮 BOSS', G.W / 2, 48, 13, '#f87171', 'center', true);
      }
    }

    // === 右上：金币 + 击杀 + 晶防装置 ===
    G.text(ctx, '🪙 ' + s.gold, G.W - 16, 22, 18, '#ffd54f', 'right', true);
    G.text(ctx, '击杀 ' + s.kills, G.W - 16, 44, 13, '#94a3b8', 'right');
    G.text(ctx, '晶防装置: ' + s.devices.filter(d => d.hp > 0).length + '/' + deviceLimit(s.wave), G.W - 16, 62, 12, '#94a3b8', 'right');

    // === Boss 血条 ===
    const boss = s.enemies.find(e => e.boss && !e.dead);
    if (boss) {
      G.text(ctx, boss.name, G.W / 2, 48, 16, '#f87171', 'center', true);
      G.drawBar(ctx, G.W / 2 - 200, 62, 400, 14, boss.hp / boss.maxHp, '#ef4444');
    }

    // === 底部：武器栏（地牢模式风格）===
    for (let i = 0; i < p.weapons.length; i++) {
      const w = p.weapons[i];
      const x = 14 + i * 82, y = G.H - 72;
      ctx.fillStyle = i === p.cur ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.45)';
      G.roundRect(ctx, x, y, 74, 56, 8); ctx.fill();
      ctx.strokeStyle = i === p.cur ? '#ffd54f' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      G.roundRect(ctx, x, y, 74, 56, 8); ctx.stroke();
      G.text(ctx, w.emoji, x + 37, y + 20, 24, '#fff', 'center');
      G.text(ctx, w.name, x + 37, y + 39, 10, '#e2e8f0', 'center');
      G.text(ctx, '耗能 ' + (w.energyCost || 0), x + 37, y + 51, 9, w.energyCost > 0 ? '#7dd3fc' : '#64748b', 'center');
    }

    // === 技能栏（PC端） ===
    const sk = p.skill;
    if (!G.isMobile) {
      const sx = G.W - 84, sy = G.H - 72;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      G.roundRect(ctx, sx, sy, 70, 56, 8); ctx.fill();
      G.text(ctx, sk.emoji, sx + 35, sy + 21, 24, '#fff', 'center');
      G.text(ctx, sk.name, sx + 35, sy + 40, 10, '#e2e8f0', 'center');
      G.text(ctx, '耗能 ' + sk.cost, sx + 35, sy + 51, 9, '#7dd3fc', 'center');
      if (sk.cdLeft > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        G.roundRect(ctx, sx, sy, 70, 56 * (sk.cdLeft / sk.cd), 8); ctx.fill();
        G.text(ctx, sk.cdLeft.toFixed(1), sx + 35, sy + 26, 15, '#fff', 'center', true);
      }
      G.text(ctx, '空格', sx + 35, sy - 9, 11, '#94a3b8', 'center');
    }

    // === 底部：晶旅商栈/建造按钮 ===
    G.UI.clear();
    if (s.phase === 'rest') {
      G.UI.button(G.W / 2 - 185, G.H - 50, 105, 36, s.shopOpen ? '关闭晶旅商栈' : '晶旅商栈 (B)', () => {
        s.shopOpen = !s.shopOpen;
        s.placingDevice = null;
        s.buildMode = false;
        s.removeMode = false;
        G.audio.play('click');
      });
      G.UI.button(G.W / 2 - 65, G.H - 50, 105, 36, s.buildMode ? '关闭建造' : '建造 (V)', () => {
        s.placingDevice = null;
        s.shopOpen = false;
        s.buildMode = !s.buildMode;
        s.removeMode = false;
        G.audio.play('click');
      });
      // 立刻开始下一潮（喘息期可提前开战）
      G.UI.button(G.W / 2 + 55, G.H - 50, 115, 36, '▶ 立刻下一潮', () => {
        s.shopOpen = false;
        s.buildMode = false;
        s.placingDevice = null;
        s.removeMode = false;
        G.Siege.startWave(s);
        G.audio.play('click');
      }, '#2a4a2a', '#3a6a3a');
    }
    // 撤退按钮：右上角（金币/击杀/晶防装置信息下方，不重叠）
    if (!s._retreatConfirm) {
      G.UI.button(G.W - 105, 88, 90, 26, '🏃 撤退', () => {
        s._retreatConfirm = true;
        G.audio.play('click');
      }, '#2a1f3a', '#3a2f5a');
    }

    // 撤退确认弹窗
    if (s._retreatConfirm) {
      const mw = 280, mh = 100;
      const mx = (G.W - mw) / 2, my = (G.H - mh) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      G.roundRect(ctx, mx, my, mw, mh, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(248,113,113,0.5)';
      ctx.lineWidth = 2;
      G.roundRect(ctx, mx, my, mw, mh, 10); ctx.stroke();
      G.text(ctx, '确定要撤退结算吗？', mx + mw / 2, my + 30, 15, '#f87171', 'center', true);
      G.text(ctx, '撤退后将获得当前蚀潮的奖励', mx + mw / 2, my + 50, 12, '#94a3b8', 'center');
      G.UI.button(mx + 20, my + 60, 100, 28, '确认撤退', () => {
        s.shopOpen = false; s.buildMode = false; s.placingDevice = null; s.removeMode = false; s.cheatOpen = false;
        s._retreatConfirm = false;
        G.Siege.finish(s, true);
      }, '#5a2a2a', '#7a3a3a');
      G.UI.button(mx + 160, my + 60, 100, 28, '取消', () => {
        s._retreatConfirm = false;
        G.audio.play('click');
      }, '#2a3a5c', '#3a4f7a');
    }
    if (s.buildMode) {
      this.drawBuildPanel(s);
    }

    // === 死亡提示（复活/阵亡倒计时） ===
    if (p.dead) {
      const msg = s.respawns > 0
        ? '💀 复活中 ' + Math.ceil(Math.max(0, 5 - s.respawnTimer)) + 's'
        : '💀 阵亡! ' + Math.ceil(Math.max(0, 5 - (s.defeatTimer || 0))) + 's 后失败';
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      G.roundRect(ctx, G.W / 2 - 150, G.H / 2 - 30, 300, 36, 8); ctx.fill();
      G.text(ctx, msg, G.W / 2, G.H / 2 - 8, 18, '#ef4444', 'center', true);
    }
  };

  G.Siege.drawShop = function (s) {
    const ctx = G.ctx;
    const panelW = 560, panelH = 400;
    const px = (G.W - panelW) / 2, py = 60;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    G.roundRect(ctx, px, py, panelW, panelH, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    G.roundRect(ctx, px, py, panelW, panelH, 12); ctx.stroke();

    G.text(ctx, '晶旅商栈 (第 ' + s.wave + ' 潮 - ' + (QUALITY_NAMES[qualityForWave(s.wave)] || qualityForWave(s.wave)) + '品质)', px + panelW / 2, py + 24, 18, '#ffd54f', 'center', true);
    G.text(ctx, '金币: ' + s.gold, px + panelW / 2, py + 44, 13, '#ffd54f', 'center');

    // 关闭按钮
    G.UI.button(px + panelW - 40, py + 8, 30, 28, 'X', () => { s.shopOpen = false; G.audio.play('click'); }, '#5a3a3a', '#7a4a4a');

    // 页签：商品 / 强化
    const tabY = py + 8, tabW = 130, tabH = 28;
    const tabX1 = px + 16, tabX2 = px + 16 + tabW + 8;
    G.UI.button(tabX1, tabY, tabW, tabH, '🛒 商品', () => { s.shopTab = 'shop'; G.audio.play('click'); }, s.shopTab === 'shop' ? '#2a4a3a' : '#2a2a3a', '#3a5a4a');
    G.UI.button(tabX2, tabY, tabW, tabH, '⭐ 永久强化', () => { s.shopTab = 'perm'; G.audio.play('click'); }, s.shopTab === 'perm' ? '#4a2a3a' : '#2a2a3a', '#6a3a4a');

    if (s.shopTab === 'perm') {
      this.drawPermUpgradePanel(s, px, py, panelW, panelH);
      return;
    }

    // 刷新按钮（仅商品页）
    G.UI.button(px + panelW - 160, py + 8, 100, 28, '刷新(' + s.shopRefreshCost + 'g)', () => G.Siege.refreshShop(s), '#2a3a5c', '#3a4f7a');

    // 商品列表（3列网格，最多12件）
    const itemW = 168, itemH = 50;
    const cols = 3, rows = 4;
    const startX = px + 16, startY = py + 60;
    const gapX = 12, gapY = 8;

    // 每潮限1个临时增益：本潮已购买则其余buff位置灰
    const nextBought = s.buffs.find(b => b.wave === s.wave + 1);

    for (let i = 0; i < Math.min(s.shopItems.length, cols * rows); i++) {
      const item = s.shopItems[i];
      const col = i % cols, row = Math.floor(i / cols);
      const ix = startX + col * (itemW + gapX);
      const iy = startY + row * (itemH + gapY);

      // buff位锁定：本潮已买过1个增益 → 另一个置灰不可点
      const buffLocked = item.kind === 'buff' && !!nextBought && !item.sold;
      const disabled = item.sold || buffLocked;

      ctx.fillStyle = disabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)';
      G.roundRect(ctx, ix, iy, itemW, itemH, 6); ctx.fill();
      if (disabled) {
        ctx.fillStyle = 'rgba(100,100,100,0.4)';
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        G.roundRect(ctx, ix, iy, itemW, itemH, 6); ctx.stroke();
      }

      let name = '', desc = '';
      let catTag = null;
      if (item.kind === 'weapon') { name = item.weapon.name; desc = '伤害:' + item.weapon.dmg; }
      else if (item.kind === 'potion') { name = item.name; desc = item.desc; }
      else if (item.kind === 'crystal_repair') { name = item.name; desc = item.desc; }
      else if (item.kind === 'revive') { name = item.name; desc = item.desc; }
      else if (item.kind === 'crystal_shield_item') { name = item.name; desc = item.desc; }
      else if (item.kind === 'buff') {
        name = item.buff.name; desc = item.buff.desc;
        catTag = BUFF_CATS[item.buff.cat] || '';
      }
      else if (item.kind === 'device') {
        const ddd = DEVICES[item.device];
        name = ddd ? ddd.name : '';
        desc = ddd ? ddd.levels.map(l => l.name).join(' / ') : '';
      }

      G.text(ctx, (item.icon || '') + ' ' + name, ix + 8, iy + 18, 13, disabled ? '#666' : '#e2e8f0', 'left', true);
      G.text(ctx, desc, ix + 8, iy + 36, 11, disabled ? '#555' : '#94a3b8', 'left');
      // 类别标签（buff卡片左上角小字）
      if (catTag) {
        G.text(ctx, '[' + catTag + ']', ix + 8, iy - 4, 9, disabled ? '#555' : '#fbbf24', 'left');
      }
      G.text(ctx, item.sold ? '已售' : (buffLocked ? '每潮限1' : item.price + 'g'), ix + itemW - 8, iy + 18, 13,
        item.sold ? '#666' : buffLocked ? '#888' : '#ffd54f', 'right', true);

      if (!disabled) {
        G.UI.button(ix, iy, itemW, itemH, '', () => G.Siege.buyItem(s, item), 'transparent', 'rgba(255,255,255,0.1)');
      }
    }
  };

  // 永久强化面板
  G.Siege.drawPermUpgradePanel = function (s, px, py, panelW, panelH) {
    const ctx = G.ctx;
    // 标题 + 剩余购买次数提示
    G.text(ctx, '⭐ 永久强化    本潮剩余: ' + s.permBuysLeft,
      px + panelW / 2, py + 44, 13, s.permBuysLeft <= 0 ? '#ef4444' : '#94a3b8', 'center', true);

    // 4列×2行 网格
    const itemW = 126, itemH = 74;
    const startX = px + 14, startY = py + 56;
    const gapX = 10, gapY = 12;
    const cols = 4;

    for (let i = 0; i < PERM_UPGRADES.length; i++) {
      const upg = PERM_UPGRADES[i];
      const level = s.permUpgrades[upg.id] || 0;
      const col = i % cols, row = Math.floor(i / cols);
      const ix = startX + col * (itemW + gapX);
      const iy = startY + row * (itemH + gapY);
      if (iy + itemH > py + panelH - 10) break;

      // 状态
      const unlocked = s.wave >= upg.unlockWave;
      const maxed = level >= upg.max;
      const locked = !unlocked;
      const poor = s.gold < upgradeCost(upg, level);
      const noBuys = s.permBuysLeft <= 0;
      const disabled = noBuys || maxed || locked || poor;

      // 背景
      ctx.fillStyle = maxed ? 'rgba(74,222,128,0.12)' : (disabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)');
      G.roundRect(ctx, ix, iy, itemW, itemH, 6); ctx.fill();
      ctx.strokeStyle = locked ? 'rgba(255,255,255,0.08)' : (disabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.22)');
      ctx.lineWidth = 1;
      G.roundRect(ctx, ix, iy, itemW, itemH, 6); ctx.stroke();

      // 名称 + 等级
      G.text(ctx, upg.icon + ' ' + upg.name + (maxed ? ' 满级' : ' Lv.' + level), ix + 4, iy + 16, 11, maxed ? '#4ade80' : '#e2e8f0', 'left', true);
      // 当前效果
      G.text(ctx, '当前: ' + this.permEffectText(s, upg, level), ix + 4, iy + 32, 9, '#94a3b8', 'left');
      // 下一级 / 费用
      if (!maxed && !locked) {
        const cost = upgradeCost(upg, level);
        G.text(ctx, '下一级: ' + this.permEffectText(s, upg, level + 1), ix + 4, iy + 46, 9, '#64748b', 'left');
        G.text(ctx, cost + 'g', ix + itemW - 4, iy + 62, 11, poor ? '#ef4444' : '#ffd54f', 'right', true);
      } else {
        G.text(ctx, maxed ? '✓ 已达满级' : '第 ' + upg.unlockWave + ' 潮解锁', ix + 4, iy + 58, 10, '#64748b', 'left');
      }

      // 按钮（可购买时显示）
      if (!disabled) {
        G.UI.button(ix, iy, itemW, itemH, '', () => G.Siege.buyPermUpgrade(s, upg.id), 'transparent', 'rgba(255,255,255,0.1)');
      } else if (noBuys && !maxed && !locked) {
        G.text(ctx, '次数已用尽', ix + 4, iy + 62, 9, '#ef4444', 'left');
      }
    }
  };

  // 当前效果文字
  G.Siege.permEffectText = function (s, upg, level) {
    switch (upg.id) {
      case 'maxHp': return '+' + level * 5 + ' HP';
      case 'maxArmor': return '+' + level * 2 + ' 护甲';
      case 'maxEnergy': return '+' + level * 20 + ' 能量';
      case 'dmg': return '+' + (level * 5) + '%';
      case 'crit': return '+' + (level * 3) + '%';
      case 'fireRate': return '+' + (level * 5) + '%';
      case 'petDmg': return '+' + level * 2 + ' 伤害';
      case 'petRate': return '间隔-' + (level * 8) + '%';
    }
    return '';
  };

  G.Siege.drawBuildPanel = function (s) {
    const ctx = G.ctx;
    const panelW = 560, panelH = 410;
    const px = (G.W - panelW) / 2, py = 5;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    G.roundRect(ctx, px, py, panelW, panelH, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    G.roundRect(ctx, px, py, panelW, panelH, 10); ctx.stroke();

    G.text(ctx, s.removeMode ? '拆除模式: 点击晶防装置拆除' : '建造面板 (点击地图放置)', px + panelW / 2, py + 22, 16, s.removeMode ? '#f87171' : '#ffd54f', 'center', true);
    G.text(ctx, '晶防装置: ' + s.devices.filter(d => d.hp > 0).length + '/' + deviceLimit(s.wave) + '  金币: ' + s.gold, px + panelW / 2, py + 42, 13, '#94a3b8', 'center');

    G.UI.button(px + panelW - 40, py + 6, 30, 24, 'X', () => { s.buildMode = false; G.audio.play('click'); }, '#5a3a3a', '#7a4a4a');
    G.UI.button(px + 10, py + 6, 100, 24, '拆除: ' + (s.removeMode ? '开' : '关'), () => {
      s.removeMode = !s.removeMode;
      if (s.removeMode) { s.placingDevice = null; s.buildMode = false; }
      G.audio.play('click');
    }, s.removeMode ? '#5a3a3a' : '#2a3a5c', s.removeMode ? '#7a4a4a' : '#3a4f7a');

    // 晶旅商栈风格网格：每个晶防装置等级一个紧凑卡，只显示名称与金币
    const list = [];
    for (const id of Object.keys(DEVICES)) {
      const dd = DEVICES[id];
      for (const tier of tierList(dd, s.wave)) {
        list.push({ id: id, tier: tier, dd: dd, st: deviceStats(dd, tier), name: deviceLevel(dd, tier).name });
      }
    }
    // 能量发生器排到最后
    list.sort((a, b) => (a.id === 'energy_gen' ? 1 : 0) - (b.id === 'energy_gen' ? 1 : 0));
    const itemW = 168, itemH = 50;
    const cols = 3, rows = 6;
    const startX = px + 16, startY = py + 60;
    const gapX = 12, gapY = 8;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const col = i % cols, row = Math.floor(i / cols);
      const ix = startX + col * (itemW + gapX);
      const iy = startY + row * (itemH + gapY);
      const unlocked = s.wave >= DEVICE_TIERS[it.tier].unlockWave;
      const isPlacing = s.placingDevice === it.id && s.placingTier === it.tier;
      // 卡底
      ctx.fillStyle = unlocked ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
      G.roundRect(ctx, ix, iy, itemW, itemH, 6); ctx.fill();
      if (unlocked) {
        ctx.strokeStyle = isPlacing ? '#7fd4ff' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = isPlacing ? 2 : 1;
        G.roundRect(ctx, ix, iy, itemW, itemH, 6); ctx.stroke();
      }
      // 名称（含等级）
      G.text(ctx, DEVICE_TIERS[it.tier].name + ' ' + it.name, ix + 10, iy + 18, 13,
        unlocked ? (isPlacing ? '#7fd4ff' : '#e2e8f0') : '#4b5563', 'left', true);
      // 价格（只显示金币）
      G.text(ctx, it.st.cost + 'g', ix + itemW - 10, iy + 18, 14,
        unlocked ? (s.gold >= it.st.cost ? '#ffd54f' : '#ef4444') : '#57534e', 'right', true);
      // 未解锁提示 / 放置按钮
      if (!unlocked) {
        G.text(ctx, DEVICE_TIERS[it.tier].unlockWave + '潮解锁', ix + itemW / 2, iy + 36, 10, '#f87171', 'center', true);
      } else {
        G.UI.button(ix, iy, itemW, itemH, '', () => {
          if (s.gold < it.st.cost) { G.audio.play('dry'); return; }
          s.removeMode = false;
          s.placingDevice = it.id;
          s.placingTier = it.tier;
          if (s.placingDevice) { s.buildMode = false; s._placingDeviceJustBought = true; } // 关闭建造面板，标记跳过本次点击
          G.audio.play('click');
        }, 'transparent', 'rgba(255,255,255,0.08)');
      }
    }
  };

  G.Siege.drawPlacementHint = function (s) {
    const ctx = G.ctx;
    // 全局绘制放置提示
    const dd = DEVICES[s.placingDevice];
    if (!dd) return;
    const tier = s.placingTier || 1;
    const st = deviceStats(dd, tier);
    const mx = G.mouse.x + Math.max(0, (G.vw - G.W) / 2) + s.cam.x, my = G.mouse.y + s.cam.y;
    // 检查位置合法性
    const valid = G.dist(mx, my, CRYSTAL_X, CRYSTAL_Y) >= CRYSTAL_NO_BUILD_R &&
      !inWall(mx, my, 10) &&
      SPAWN_POINTS.every(sp => G.dist(mx, my, sp.x, sp.y) >= 80) &&
      s.devices.filter(d => d.hp > 0).every(d => G.dist(mx, my, d.x, d.y) >= st.r + d.r + 10);
    ctx.fillStyle = valid ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)';
    ctx.beginPath(); ctx.arc(mx, my, st.r, 0, G.TAU); ctx.fill();
    ctx.strokeStyle = valid ? '#4ade80' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, st.r, 0, G.TAU); ctx.stroke();
    G.text(ctx, dd.name + ' ' + DEVICE_TIERS[tier].name + '级 (' + st.cost + 'g)', mx, my - st.r - 12, 12, '#fff', 'center', true);
  };

  G.Siege.drawCheatMenu = function (s) {
    const ctx = G.ctx;
    const px = G.W - 210, py = 50;
    const menuH = 310;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(px, py, 200, menuH);
    G.text(ctx, '作弊菜单', px + 100, py + 14, 14, '#ffd54f', 'center', true);
    const cheats = [
      { key: 'god', label: '无敌' },
      { key: 'ohk', label: '秒杀' },
      { key: 'infEnergy', label: '无限能量' },
      { key: 'infGold', label: '无限金币' },
      { key: 'speed', label: '加速' },
      { key: 'noCd', label: '无冷却' }
    ];
    for (let i = 0; i < cheats.length; i++) {
      const c = cheats[i];
      const y = py + 30 + i * 30;
      const active = s.cheats[c.key];
      G.UI.button(px + 10, y, 180, 24, c.label + (active ? ' ON' : ' OFF'), () => {
        s.cheats[c.key] = !s.cheats[c.key];
        G.audio.play('click');
      }, active ? '#3a5a3a' : '#2a3a5c', active ? '#4a7a4a' : '#3a4f7a');
    }

    // 自定义蚀潮
    const waveY = py + 30 + cheats.length * 30 + 6;
    G.text(ctx, '自定义蚀潮', px + 100, waveY + 10, 12, '#94a3b8', 'center');

    // 蚀潮输入框
    const inpy = waveY + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(px + 40, inpy, 60, 24);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 40, inpy, 60, 24);
    G.text(ctx, String(s._cheatWave || 1), px + 70, inpy + 14, 14, '#ffd54f', 'center', true);

    // 加减按钮
    G.UI.button(px + 10, inpy, 24, 24, '-', () => {
      s._cheatWave = Math.max(1, (s._cheatWave || 1) - 1);
      G.audio.play('click');
    }, '#2a3a5c', '#3a4f7a');
    G.UI.button(px + 106, inpy, 24, 24, '+', () => {
      s._cheatWave = Math.min(999, (s._cheatWave || 1) + 1);
      G.audio.play('click');
    }, '#2a3a5c', '#3a4f7a');

    // 快速跳转按钮
    const qy = inpy + 30;
    G.UI.button(px + 10, qy, 55, 22, '+5', () => {
      s._cheatWave = Math.min(999, (s._cheatWave || 1) + 5);
      G.audio.play('click');
    }, '#2a3a5c', '#3a4f7a');
    G.UI.button(px + 72, qy, 55, 22, '+10', () => {
      s._cheatWave = Math.min(999, (s._cheatWave || 1) + 10);
      G.audio.play('click');
    }, '#2a3a5c', '#3a4f7a');
    G.UI.button(px + 134, qy, 55, 22, '+50', () => {
      s._cheatWave = Math.min(999, (s._cheatWave || 1) + 50);
      G.audio.play('click');
    }, '#2a3a5c', '#3a4f7a');

    // 跳转按钮
    G.UI.button(px + 10, qy + 28, 180, 24, '🏃 跳到指定蚀潮', () => {
      const targetWave = s._cheatWave || 1;
      if (targetWave <= s.wave) {
        G.FX.float(CRYSTAL_X, CRYSTAL_Y - 60, '目标蚀潮不能小于当前蚀潮', '#ef4444', 14);
        return;
      }
      // 结算当前蚀潮奖励
      s.gold += Math.round(s.kills * 5 + s.bossKills * 100);
      // 跳过蚀潮
      s.wave = targetWave - 1;
      s.phase = 'rest';
      s.restTimer = 0;
      s.enemies = [];
      s.bullets = [];
      s.spawnQueue = [];
      s.bossSpawned = false;
      s._retreatConfirm = false;
      s.permBuysLeft = 1 + Math.floor(s.wave / 5);
      // 跳潮后立即应用永久强化加成（dmg/fireRate/petRate）
      if (s.player) {
        s.player.dmgMult = G.Siege.permDmgMult(s);
        s.player.fireRateMult = G.Siege.permFireRateMult(s);
        s.player.petRate = G.Siege.permPetRate(s);
      }
      G.audio.play('click');
      G.FX.float(CRYSTAL_X, CRYSTAL_Y - 60, '已跳到第 ' + targetWave + ' 潮', '#ffd54f', 18);
    }, '#3a5a3a', '#4a7a4a');
  };

  // ======== 升级版晶防装置绘制函数 ========

  // 尖刺路障：钢铁路障 + 金色尖刺（反伤）
  G.Siege._drawSpikeBarrier = function (ctx, r, hp, t) {
    const s = r;
    // 复用钢铁路障主体
    G.Siege._drawSteelBarrier(ctx, r, hp, t);
    // 外圈金色描边（升级标记）
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.9, 0, G.TAU); ctx.stroke();
    // 四周尖刺（脉冲动画）
    const spikeN = 8;
    const pulse = 1 + Math.sin(t * 4) * 0.15;
    ctx.fillStyle = '#e2e8f0';
    for (let i = 0; i < spikeN; i++) {
      const a = i / spikeN * G.TAU + t * 0.5;
      const bx = Math.cos(a), by = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(bx * s, by * s);
      ctx.lineTo(Math.cos(a - 0.3) * s * 0.75 + bx * 7 * pulse, Math.sin(a - 0.3) * s * 0.75 + by * 7 * pulse);
      ctx.lineTo(Math.cos(a + 0.3) * s * 0.75 + bx * 7 * pulse, Math.sin(a + 0.3) * s * 0.75 + by * 7 * pulse);
      ctx.closePath();
      ctx.fill();
    }
  };

  // 重机枪炮台：金色双管
  G.Siege._drawGatlingTurret = function (ctx, r, hp, t) {
    const s = r;
    // 底座（更大更厚重）
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.moveTo(-s - 2, s);
    ctx.lineTo(-s + 2, -s + 2);
    ctx.lineTo(s - 2, -s + 2);
    ctx.lineTo(s + 2, s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 炮塔顶（金色）
    const grad = ctx.createRadialGradient(0, -s + 5, 2, 0, -s + 5, s * 0.6);
    grad.addColorStop(0, '#fef3c7');
    grad.addColorStop(0.5, '#fbbf24');
    grad.addColorStop(1, '#b45309');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, -s + 5, s * 0.6, 0, G.TAU); ctx.fill();
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -s + 5, s * 0.6, 0, G.TAU); ctx.stroke();
    // 双管炮管（左右摆动更剧烈）
    const aimAngle = Math.sin(t * 3) * 0.4;
    ctx.save();
    ctx.translate(0, -s + 5);
    ctx.rotate(aimAngle);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(0, -5, s * 0.9, 4);
    ctx.fillRect(0, 1, s * 0.9, 4);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(s * 0.75, -6, 6, 5);
    ctx.fillRect(s * 0.75, 1, 6, 5);
    ctx.restore();
    // 高频射击闪光
    if (Math.sin(t * 18) > 0.5) {
      ctx.fillStyle = 'rgba(255,255,200,0.7)';
      ctx.beginPath();
      ctx.arc(s * 0.8, -s + 5, 5, 0, G.TAU);
      ctx.fill();
    }
  };

  // 喷火塔：火焰炮台 + 更旺火焰
  G.Siege._drawInfernoTurret = function (ctx, r, hp, t) {
    G.Siege._drawFlameTurret(ctx, r, hp, t);
    const s = r;
    // 外圈烈焰（动态）
    const flameN = 7;
    for (let i = 0; i < flameN; i++) {
      const fa = (i / flameN) * G.TAU + t * 2.5;
      const fr = s * 0.85 + Math.sin(t * 7 + i * 2) * 3;
      const fx = Math.cos(fa) * fr;
      const fy = Math.sin(fa) * fr;
      ctx.fillStyle = 'rgba(251,146,60,' + (0.35 + Math.sin(t * 6 + i) * 0.25) + ')';
      ctx.beginPath(); ctx.arc(fx, fy, 3.5, 0, G.TAU); ctx.fill();
    }
    // 中心白热
    ctx.fillStyle = 'rgba(255,255,220,0.95)';
    ctx.beginPath(); ctx.arc(0, -s + 4, 4, 0, G.TAU); ctx.fill();
  };

  // 生命圣坛：治疗图腾 + 圣光双翼
  G.Siege._drawHealShrine = function (ctx, r, hp, t) {
    G.Siege._drawHealTotem(ctx, r, hp, t);
    const s = r;
    // 翅膀状侧翼（浮动）
    const fl = Math.sin(t * 3) * 2;
    for (const dir of [-1, 1]) {
      ctx.fillStyle = 'rgba(134,239,172,0.7)';
      ctx.beginPath();
      ctx.moveTo(dir * s * 0.5, -s * 0.2);
      ctx.quadraticCurveTo(dir * s * 1.4, -s * 0.5 - fl, dir * s * 1.1, -s * 0.1);
      ctx.quadraticCurveTo(dir * s * 1.2, -s * 0.9 + fl, dir * s * 0.5, -s * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    // 顶部光环
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -s - 3, s * 0.5, s * 0.18, 0, 0, G.TAU); ctx.stroke();
  };

  // 电磁核心：双环脉冲
  G.Siege._drawEmpMaster = function (ctx, r, hp, t) {
    const s = r;
    // 底座
    ctx.fillStyle = '#2e1065';
    ctx.beginPath();
    ctx.moveTo(-s, s);
    ctx.lineTo(-s + 4, -s + 2);
    ctx.lineTo(s - 4, -s + 2);
    ctx.lineTo(s, s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4c1d95';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 核心（紫色渐变球）
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, s * 0.6);
    grad.addColorStop(0, '#f5f3ff');
    grad.addColorStop(0.5, '#c4b5fd');
    grad.addColorStop(1, '#7c3aed');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, G.TAU); ctx.fill();
    // 双环旋转（异向）
    ctx.save();
    ctx.strokeStyle = 'rgba(167,139,250,0.9)';
    ctx.lineWidth = 2;
    ctx.rotate(t * 2);
    ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, G.TAU); ctx.stroke();
    ctx.rotate(-t * 4);
    ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0.6, G.TAU - 0.6); ctx.stroke();
    ctx.restore();
    // 电弧粒子
    for (let i = 0; i < 4; i++) {
      const pa = t * 3 + i * G.TAU / 4;
      const pr = s * 0.4 + Math.sin(t * 5 + i * 2) * 3;
      ctx.fillStyle = 'rgba(221,214,254,0.9)';
      ctx.beginPath(); ctx.arc(Math.cos(pa) * pr, Math.sin(pa) * pr, 2, 0, G.TAU); ctx.fill();
    }
  };
})();