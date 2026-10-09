(function () {
  const G = window.G;

  G.CHARACTERS = [
    { id: 'warden', name: '晶卫', emoji: '🛡️', color: '#5b8def', desc: '均衡的战士，技能强化火力输出', cost: 0,
      base: { hp: 7, armor: 3, energy: 200, crit: 5, speed: 180, regen: 0 },
      skill: { id: 'fury', name: '晶核过载', emoji: '🔥', desc: '4秒内攻速+100%', cost: 0, cd: 15 } },
    { id: 'striker', name: '锋影', emoji: '🗡️', color: '#2dd4bf', desc: '灵活的刺客，瞬影步闪避一切攻击', cost: 500,
      base: { hp: 5, armor: 2, energy: 200, crit: 15, speed: 210, regen: 0 },
      skill: { id: 'roll', name: '瞬影步', emoji: '💨', desc: '向前翻滚并短暂无敌', cost: 0, cd: 12 } },
    { id: 'sparkweaver', name: '雷纹', emoji: '🧙', color: '#a78bfa', desc: '掌控雷电的法师，链式闪电打击群敌', cost: 800,
      base: { hp: 5, armor: 2, energy: 200, crit: 5, speed: 170, regen: 0 },
      skill: { id: 'zap', name: '晶纹雷击', emoji: '⚡', desc: '闪电攻击最近3个敌人', cost: 0, cd: 14 } },
    { id: 'luminary', name: '晶辉', emoji: '👼', color: '#fbbf24', desc: '神圣的治疗者，持续恢复生命', cost: 800,
      base: { hp: 6, armor: 2, energy: 200, crit: 5, speed: 170, regen: 0 },
      skill: { id: 'heal', name: '晶泉回涌', emoji: '💖', desc: '3秒内恢复6点生命', cost: 0, cd: 16 } },
    { id: 'machinist', name: '械晶', emoji: '🔧', color: '#fb923c', desc: '机械大师，召唤晶哨塔协助作战', cost: 1000,
      base: { hp: 6, armor: 3, energy: 200, crit: 5, speed: 170, regen: 0 },
      skill: { id: 'turret', name: '召唤晶哨塔', emoji: '🗼', desc: '召唤一座自动炮台', cost: 0, cd: 15 } },
    { id: 'shade', name: '暗蚀', emoji: '🥷', color: '#94a3b8', desc: '暗影之刃，突袭沿途所有敌人', cost: 1000,
      base: { hp: 6, armor: 2, energy: 200, crit: 20, speed: 200, regen: 0 },
      skill: { id: 'dash', name: '虚蚀突穿', emoji: '🌪️', desc: '朝瞄准方向突进并造成伤害', cost: 0, cd: 12 } }
  ];

  G.WEAPONS = {
    pistol:  { id: 'pistol', name: '碎晶手枪', emoji: '🔫', type: 'pistol', dmg: 3, rate: 2.6, pellets: 1, spread: 3, bSpeed: 520, bSize: 3, energyCost: 0, color: '#ffd54f', price: 0, crit: 5 },
    smg:     { id: 'smg', name: '连射晶弩', emoji: '🔫', type: 'auto', dmg: 2, rate: 8.5, pellets: 1, spread: 6, bSpeed: 540, bSize: 3, energyCost: 2, color: '#7dd3fc', price: 30, crit: 5 },
    shotgun: { id: 'shotgun', name: '晶爆裂管', emoji: '💥', type: 'pistol', dmg: 2.2, rate: 1.4, pellets: 5, spread: 14, bSpeed: 480, bSize: 3, energyCost: 4, color: '#fca5a5', price: 40, crit: 5 },
    laser:   { id: 'laser', name: '晶光射线', emoji: '⚡', type: 'auto', dmg: 1.5, rate: 11, pellets: 1, spread: 2, bSpeed: 720, bSize: 2, energyCost: 3, color: '#c4b5fd', price: 35, crit: 8, pierce: 1 },
    sniper:  { id: 'sniper', name: '超射程晶狙', emoji: '🎯', type: 'pistol', dmg: 12, rate: 0.9, pellets: 1, spread: 0, bSpeed: 950, bSize: 4, energyCost: 6, color: '#86efac', price: 50, crit: 15, pierce: 3, knock: 140 },
    sword:   { id: 'sword', name: '晶钢斩刃', emoji: '🗡️', type: 'melee', dmg: 10, rate: 1.3, range: 100, arc: 2.2, color: '#d9f99d', price: 45, crit: 10, knock: 120, energyCost: 5 },
    spear:   { id: 'spear', name: '晶锋长刺', emoji: '🔱', type: 'melee', dmg: 7, rate: 1.7, range: 120, arc: 1.0, color: '#fde68a', price: 40, crit: 8, knock: 100, energyCost: 4 },
    bow:     { id: 'bow', name: '纹弓', emoji: '🏹', type: 'bow', dmg: 4, rate: 1.2, charge: 0.7, bSpeed: 620, bSize: 4, color: '#fbbf24', price: 40, crit: 10, energyCost: 3 },
    fire:    { id: 'fire', name: '燃晶杖', emoji: '🪄', type: 'auto', dmg: 5, rate: 2.2, pellets: 1, spread: 3, bSpeed: 430, bSize: 5, energyCost: 5, color: '#fb923c', price: 40, crit: 5, burn: 2 },
    ice:     { id: 'ice', name: '凝晶杖', emoji: '❄️', type: 'auto', dmg: 4, rate: 2.4, pellets: 1, spread: 3, bSpeed: 430, bSize: 5, energyCost: 5, color: '#67e8f9', price: 40, crit: 5, slow: 0.55 },
    grenade: { id: 'grenade', name: '蚀爆晶珠', emoji: '💣', type: 'pistol', dmg: 13, rate: 1.1, pellets: 1, spread: 2, bSpeed: 420, bSize: 5, energyCost: 6, color: '#f87171', price: 45, crit: 5, aoe: 70 },
    gatling: { id: 'gatling', name: '晶核转轮机枪', emoji: '🌀', type: 'auto', dmg: 1.2, rate: 16, pellets: 1, spread: 10, bSpeed: 520, bSize: 3, energyCost: 4, color: '#fde047', price: 60, crit: 5 },
    crossbow:{ id: 'crossbow', name: '速射重弩', emoji: '🏹', type: 'auto', dmg: 3.5, rate: 5, pellets: 1, spread: 4, bSpeed: 580, bSize: 3, energyCost: 3, color: '#d4a574', price: 35, crit: 8, pierce: 1 },
    boomerang:{ id: 'boomerang', name: '晶叶回旋', emoji: '🪃', type: 'pistol', dmg: 8, rate: 1.8, pellets: 1, spread: 2, bSpeed: 380, bSize: 5, energyCost: 4, color: '#fbbf24', price: 40, crit: 10, pierce: 5, knock: 80 },
    lightning:{ id: 'lightning', name: '链电晶杖', emoji: '⚡', type: 'auto', dmg: 3, rate: 6, pellets: 1, spread: 1, bSpeed: 750, bSize: 3, energyCost: 6, color: '#c084fc', price: 55, crit: 12, pierce: 2 },
    shuriken:{ id: 'shuriken', name: '晶棱飞刺', emoji: '💠', type: 'pistol', dmg: 9, rate: 2.0, pellets: 1, spread: 2, bSpeed: 500, bSize: 3, energyCost: 4, color: '#a78bfa', price: 45, crit: 5, pierce: 4 },
    revolver:{ id: 'revolver', name: '晶轮击发枪', emoji: '🔫', type: 'pistol', dmg: 6, rate: 1.8, pellets: 1, spread: 2, bSpeed: 550, bSize: 4, energyCost: 2, color: '#fbbf24', price: 40, crit: 20 },
    burst_shotgun:{ id: 'burst_shotgun', name: '连发晶爆管', emoji: '💥', type: 'pistol', dmg: 3.5, rate: 1.3, pellets: 6, spread: 16, bSpeed: 460, bSize: 4, energyCost: 6, color: '#ef4444', price: 65, crit: 5, knock: 70 },
    assault:{ id: 'assault', name: '速射晶管', emoji: '🔫', type: 'auto', dmg: 3, rate: 8.0, pellets: 1, spread: 4, bSpeed: 560, bSize: 3, energyCost: 3, color: '#93c5fd', price: 50, crit: 5 },
    poison_dart:{ id: 'poison_dart', name: '蚀毒镖枪', emoji: '🪄', type: 'auto', dmg: 2.5, rate: 4.8, pellets: 1, spread: 3, bSpeed: 480, bSize: 2, energyCost: 3, color: '#4ade80', price: 55, crit: 5, poison: 3 },
    thunder_staff:{ id: 'thunder_staff', name: '鸣雷晶杖', emoji: '⚡', type: 'auto', dmg: 5, rate: 2.5, pellets: 1, spread: 2, bSpeed: 700, bSize: 3, energyCost: 7, color: '#c084fc', price: 75, crit: 10, pierce: 3 },
    lightsaber:{ id: 'lightsaber', name: '晶能光刃', emoji: '⚔️', type: 'melee', dmg: 9, rate: 2.2, range: 95, arc: 1.6, color: '#67e8f9', price: 65, crit: 20, knock: 80, energyCost: 3 },
    battle_axe:{ id: 'battle_axe', name: '晶裂巨斧', emoji: '🪓', type: 'melee', dmg: 16, rate: 0.9, range: 110, arc: 4.2, color: '#f87171', price: 75, crit: 10, knock: 180, energyCost: 6 },
    heavy_sniper:{ id: 'heavy_sniper', name: '穿域重狙', emoji: '🎯', type: 'pistol', dmg: 28, rate: 0.6, pellets: 1, spread: 0, bSpeed: 1000, bSize: 5, energyCost: 10, color: '#facc15', price: 90, crit: 20, pierce: 6, knock: 200 },
    rpg:{ id: 'rpg', name: '晶爆巨炮', emoji: '🚀', type: 'pistol', dmg: 22, rate: 0.7, pellets: 1, spread: 1, bSpeed: 380, bSize: 6, energyCost: 8, color: '#ef4444', price: 85, crit: 5, aoe: 120, knock: 150 }
  };

  G.ENEMIES = {
    slime:    { name: '蚀浆怪', hp: 10, speed: 75, dmg: 1, r: 14, color: '#4ecb71', contact: true, coins: [2, 3] },
    bat:      { name: '虚翼蝠', hp: 6, speed: 150, dmg: 2, r: 12, color: '#e879f9', contact: true, coins: [2, 3] },
    shooter:  { name: '蚀射虫', hp: 8, speed: 85, dmg: 2, r: 13, color: '#fb923c', ranged: true, rate: 1.5, bSpeed: 300, coins: [2, 4] },
    turret:   { name: '蚀晶炮台', hp: 12, speed: 30, dmg: 2, r: 16, color: '#94a3b8', ranged: true, burst: 3, rate: 2.0, bSpeed: 320, coins: [3, 4] },
    brute:    { name: '厚甲蚀卫', hp: 30, speed: 65, dmg: 3, r: 20, color: '#ef4444', contact: true, charge: true, coins: [4, 6] },
    skeleton: { name: '骨弩手', hp: 7, speed: 70, dmg: 2, r: 13, color: '#d4d4d8', ranged: true, rate: 1.6, bSpeed: 280, coins: [2, 4] },
    mage:     { name: '蚀纹法师', hp: 9, speed: 55, dmg: 3, r: 14, color: '#c084fc', ranged: true, burst: 2, rate: 2.2, bSpeed: 240, coins: [3, 5] },
    ghost:    { name: '残虚影', hp: 5, speed: 110, dmg: 2, r: 11, color: '#94a3b8', contact: true, coins: [2, 3] },
    mushroom: { name: '孢囊自爆体', hp: 8, speed: 50, dmg: 2, r: 14, color: '#a855f7', contact: true, selfDestruct: true, coins: [2, 4] },
    goblin:   { name: '蚀獠投矛手', hp: 9, speed: 80, dmg: 2, r: 13, color: '#84cc16', ranged: true, rate: 1.8, bSpeed: 220, arc: true, coins: [2, 5] },
    plant:    { name: '蚀根植体', hp: 15, speed: 0, dmg: 3, r: 16, color: '#22c55e', ranged: true, rate: 2.0, bSpeed: 300, detectRange: 180, hide: true, coins: [3, 5] },
    beetle:   { name: '蚀壳冲撞虫', hp: 12, speed: 110, dmg: 2, r: 14, color: '#b45309', contact: true, charge: true, coins: [2, 4] },
    // 2层：永冻冰窟
    ice_beast:  { name: '凝霜蚀兽', hp: 14, speed: 60, dmg: 2, r: 16, color: '#67e8f9', contact: true, slowAura: 120, coins: [3, 6] },
    snowman:    { name: '寒冻投核者', hp: 18, speed: 65, dmg: 3, r: 15, color: '#e0f2fe', ranged: true, rate: 1.8, bSpeed: 260, slowShot: 2, coins: [4, 7] },
    caveman:    { name: '蛮荒冲撞者', hp: 25, speed: 100, dmg: 4, r: 18, color: '#d4a574', contact: true, charge: true, stunOnHit: 0.3, coins: [4, 8] },
    bat_swarm:  { name: '虚翼蝠群', hp: 4, speed: 180, dmg: 1, r: 10, color: '#a78bfa', contact: true, splitType: 'mini_bat', coins: [1, 2] },
    shadow:     { name: '影刃蚀刺', hp: 12, speed: 140, dmg: 5, r: 14, color: '#4c1d95', contact: true, teleport: 3, coins: [5, 8] },
    ghost_mage: { name: '残虚术者', hp: 10, speed: 70, dmg: 3, r: 14, color: '#c4b5fd', ranged: true, rate: 1.6, bSpeed: 240, lifesteal: 2, coins: [3, 6] },
    // 3层：暗黑熔岩城
    armor_knight: { name: '重甲型蚀铁卫', hp: 40, speed: 60, dmg: 5, r: 18, color: '#94a3b8', contact: true, frontShield: true, coins: [6, 10] },
    crossbowman:  { name: '蓄力晶弩手', hp: 16, speed: 75, dmg: 5, r: 14, color: '#f59e0b', ranged: true, chargedShot: true, chargeTime: 1.5, chargedDmg: 8, rate: 2.5, bSpeed: 500, coins: [5, 8] },
    necromancer:  { name: '亡纹招魂师', hp: 22, speed: 55, dmg: 3, r: 15, color: '#6b21a8', ranged: true, rate: 1.8, bSpeed: 240, reviveInterval: 5, coins: [5, 10] },
    bomber:       { name: '低血自爆兵', hp: 20, speed: 130, dmg: 6, r: 14, color: '#ef4444', contact: true, lowHpBomb: true, bombRange: 100, bombDmg: 8, coins: [5, 8] },
    golem:        { name: '重蚀岩甲像', hp: 60, speed: 35, dmg: 8, r: 22, color: '#78716c', contact: true, unstoppable: true, coins: [8, 12] },
    dark_priest:  { name: '蚀纹祭司', hp: 25, speed: 60, dmg: 4, r: 15, color: '#7c3aed', ranged: true, rate: 1.8, bSpeed: 260, healInterval: 4, healAmount: 15, healRange: 200, coins: [5, 8] },
    hellhound:    { name: '燃迹猎犬', hp: 28, speed: 150, dmg: 6, r: 16, color: '#f97316', contact: true, fireTrail: true, coins: [6, 10] },
    bomb_spider:  { name: '触炸蛛体', hp: 8, speed: 180, dmg: 1, r: 10, color: '#dc2626', contact: true, contactBomb: true, bombRange: 80, bombDmg: 6, coins: [3, 5] },
    spearman:     { name: '精锐刺锋卫', hp: 35, speed: 80, dmg: 7, r: 17, color: '#fbbf24', contact: true, lanceRange: 150, lanceKnock: 120, coins: [7, 12] },
    boss_guard:   { name: '蚀域守卫', hp: 80, speed: 45, dmg: 6, r: 20, color: '#475569', contact: true, bossGuardAura: true, coins: [0, 0] },
    // 元晶守卫战专属怪物
    raider:      { name: '劫掠蚀徒', hp: 18, speed: 85, dmg: 4, r: 14, color: '#f97316', contact: true, coins: [4, 7] },
    flyer:       { name: '高域突袭者', hp: 8, speed: 130, dmg: 5, r: 12, color: '#ef4444', contact: true, coins: [3, 5] },
    summoner:    { name: '虚纹召唤者', hp: 22, speed: 55, dmg: 3, r: 15, color: '#7c3aed', ranged: true, rate: 1.5, bSpeed: 240, coins: [5, 8] }
  };

  G.BOSSES = {
    slimeking:  { name: '蚀浆之王', hp: 120, speed: 80, dmg: 3, r: 36, color: '#22c55e', coins: 30 },
    turretboss: { name: '重炮蚀塔', hp: 200, speed: 0, dmg: 3, r: 42, color: '#64748b', coins: 40 },
    darkknight: { name: '虚蚀统帅', hp: 400, speed: 110, dmg: 5, r: 30, color: '#7c3aed', coins: 50 }
  };
  G.BOSS_ORDER = ['slimeking', 'turretboss', 'darkknight'];

  G.TALENTS = [
    { id: 'hp', name: '晶脉扩张', emoji: '❤️', desc: '生命上限+1并回复2点', apply(p) { p.maxHp += 1; p.hp = Math.min(p.maxHp, p.hp + 2); } },
    { id: 'armor', name: '晶壳强化', emoji: '🛡️', desc: '护甲上限+1并回满', apply(p) { p.maxArmor += 1; p.armor = p.maxArmor; } },
    { id: 'energy', name: '晶核容量', emoji: '🔵', desc: '恢复30%能量并增加10上限', apply(p) { p.maxEnergy += 10; p.energy = Math.min(p.maxEnergy, p.energy + p.maxEnergy * 0.3); } },
    { id: 'dmg', name: '蚀敌怒化', emoji: '💪', desc: '伤害+15%', apply(p) { p.dmgMult += 0.15; } },
    { id: 'rate', name: '晶纹速射', emoji: '⚡', desc: '攻速+15%', apply(p) { p.fireRateMult += 0.15; } },
    { id: 'crit', name: '晶眼洞察', emoji: '🎯', desc: '暴击+8%', apply(p) { p.crit += 8; } },
    { id: 'speed', name: '晶步疾行', emoji: '👟', desc: '移速+10%', apply(p) { p.moveMult += 0.10; } },
    { id: 'pet', name: '晶兽唤醒', emoji: '🐱', desc: '宠物伤害+2', apply(p) { p.petDmg += 2; } },
    { id: 'magnet', name: '磁力增幅', emoji: '🧲', desc: '拾取范围翻倍', apply(p) { p.magnetMult = (p.magnetMult || 1) * 2; } }
  ];

  G.FACTORS = [
    { id: 'strong', name: '虚蚀增疫', emoji: '👹', desc: '敌人生命+60%', apply(g, p) { g.enemyHpMult *= 1.6; } },
    { id: 'glass', name: '晶核脆弱化', emoji: '🧨', desc: '伤害+25%，生命-2', apply(g, p) { p.dmgMult += 0.25; p.maxHp = Math.max(2, p.maxHp - 2); p.hp = Math.min(p.hp, p.maxHp); } },
    { id: 'infinite', name: '晶能无竭', emoji: '♾️', desc: '武器与技能能量消耗为0', apply(g, p) { g.infiniteEnergy = true; } },
    { id: 'swift', name: '虚蚀疾行', emoji: '💨', desc: '敌人移速+40%', apply(g, p) { g.enemySpeedMult *= 1.4; } },
    { id: 'critmaster', name: '晶脉通窍', emoji: '🎯', desc: '暴击+15%', apply(g, p) { p.crit += 15; } },
    { id: 'berserk', name: '蚀息狂怒', emoji: '😡', desc: '攻速+40%，伤害-20%', apply(g, p) { p.fireRateMult += 0.4; p.dmgMult *= 0.8; } }
  ];
})();