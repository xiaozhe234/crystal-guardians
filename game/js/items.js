(function () {
  const G = window.G;
  let pid = 1;

  G.Pickup = function (o) {
    this.id = pid++;
    this.type = o.type;
    this.x = o.x; this.y = o.y;
    this.value = o.value || 1;
    this.weaponId = o.weaponId || null;
    this.t = G.rand(0, 3);
    this.dead = false;
  };

  G.Pickup.prototype.collect = function (game, player) {
    if (this.dead) return;
    const p = player || game.player;
    if (this.type === 'coin') {
      p.coins = (p.coins || 0) + this.value;
      G.FX.float(this.x, this.y - 16, '+' + this.value, '#fbbf24', 14);
      G.audio.play('coin');
      this.dead = true;
    } else if (this.type === 'hp') {
      if (p.hp >= p.maxHp) return;
      p.hp = Math.min(p.maxHp, p.hp + this.value);
      G.FX.float(this.x, this.y - 16, '+' + this.value, '#4ade80', 15);
      G.audio.play('heal');
      this.dead = true;
    } else if (this.type === 'energy') {
      if (p.energy >= p.maxEnergy) { this.dead = true; return; }  // 满能量也能吸附，但不增加
      p.energy = Math.min(p.maxEnergy, p.energy + this.value);
      G.FX.float(this.x, this.y - 16, '+' + this.value, '#38bdf8', 14);
      G.audio.play('heal');
      this.dead = true;
    }
  };

  G.Chest = function (o) {
    this.x = o.x; this.y = o.y;
    this.big = !!o.big;
    this.opened = false;
  };

  G.Chest.prototype.open = function (game) {
    if (this.opened) return;
    this.opened = true;
    G.audio.play('chest');
    G.FX.burst(this.x, this.y, '#ffd54f', 14, 180, 4);
    if (this.big) {
      const w = G.pick(G.shopWeapons());
      game.pickups.push(new G.Pickup({ type: 'weapon', x: this.x, y: this.y - 44, weaponId: w.id }));
      game.pickups.push(new G.Pickup({ type: 'coin', x: this.x + 34, y: this.y, value: G.randint(15, 30) }));
      game.pickups.push(new G.Pickup({ type: 'hp', x: this.x - 34, y: this.y, value: 2 }));
    } else {
      if (Math.random() < 0.6) {
        const w = G.pick(G.shopWeapons());
        game.pickups.push(new G.Pickup({ type: 'weapon', x: this.x, y: this.y - 34, weaponId: w.id }));
      } else {
        game.pickups.push(new G.Pickup({ type: 'coin', x: this.x, y: this.y, value: G.randint(12, 26) }));
      }
      if (Math.random() < 0.5) game.pickups.push(new G.Pickup({ type: 'energy', x: this.x + 26, y: this.y, value: 25 }));
    }
  };
})();
