(function () {
  const G = window.G;

  G.UI = {
    buttons: [],
    sliders: [],
    clear() { this.buttons.length = 0; this.sliders.length = 0; },

    button(x, y, w, h, label, fn, color, hoverColor) {
      const hover = G.mouse.x >= x && G.mouse.x <= x + w && G.mouse.y >= y && G.mouse.y <= y + h;
      const c = hover ? (hoverColor || '#3a4f7a') : (color || '#2a3a5c');
      G.roundRect(G.ctx, x, y, w, h, 10);
      G.ctx.fillStyle = c; G.ctx.fill();
      G.ctx.strokeStyle = hover ? '#7fd4ff' : 'rgba(255,255,255,0.25)';
      G.ctx.lineWidth = 2;
      G.roundRect(G.ctx, x, y, w, h, 10); G.ctx.stroke();
      G.text(G.ctx, label, x + w / 2, y + h / 2, 19, '#ffffff', 'center', true);
      this.buttons.push({ x, y, w, h, fn });
      return hover;
    },

    slider(x, y, w, h, value, label, onChange) {
      const ctx = G.ctx;
      const mx = G.mouse.x, my = G.mouse.y;
      const hover = mx >= x && mx <= x + w && my >= y - 8 && my <= y + h + 8;
      // 拖动
      if (hover && G.mouse.down) {
        value = G.clamp((mx - x) / w, 0, 1);
        onChange(value);
      }
      // 标签
      G.text(ctx, label + ': ' + Math.round(value * 100) + '%', x, y - 4, 13, '#94a3b8', 'left');
      // 滑条背景
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      G.roundRect(ctx, x, y + 10, w, h, h / 2); ctx.fill();
      // 滑条填充
      if (value > 0.01) {
        ctx.fillStyle = '#7fd4ff';
        G.roundRect(ctx, x + 1, y + 11, (w - 2) * value, h - 2, (h - 2) / 2); ctx.fill();
      }
      // 滑块
      const kx = x + w * value;
      ctx.fillStyle = hover ? '#ffffff' : '#cbd5e1';
      ctx.beginPath(); ctx.arc(kx, y + 10 + h / 2, 7, 0, G.TAU); ctx.fill();
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(kx, y + 10 + h / 2, 7, 0, G.TAU); ctx.stroke();
      this.sliders.push({ x, y: y + 10, w, h, value, onChange });
      return value;
    },

    handleClick() {
      if (!G.mouse.clicked) return;
      const m = G.mouse;
      for (const b of this.buttons) {
        if (m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h) {
          G.audio.play('click');
          b.fn();
          // 消费点击后清除鼠标状态，防止按钮点击被误判为射击/放置等游戏操作
          G.mouse.clicked = false;
          G.mouse.triggered = false;
          G.mouse.down = false;
          return;
        }
      }
    },

    drawMenu() {
      const ctx = G.ctx;
      ctx.fillStyle = '#0d1420';
      ctx.fillRect(0, 0, G.W, G.H);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < G.W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, G.H); ctx.stroke(); }
      for (let y = 0; y < G.H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(G.W, y); ctx.stroke(); }
      G.text(ctx, '⚔️ 晶域守卫者', G.W / 2, 70, 48, '#ffd54f', 'center', true);
      G.text(ctx, '元晶守卫 · 本地单机版', G.W / 2, 112, 14, '#94a3b8', 'center');
      G.text(ctx, '星晶: ' + G.save.gems, 22, 28, 16, '#ffd54f', 'left', true);
      G.text(ctx, '通关: ' + G.save.wins + '  击杀: ' + G.save.kills + '  最佳层数: ' + (G.save.bestFloor || 0) + ' 域', 22, 50, 13, '#94a3b8');
      G.text(ctx, '元晶守卫战最高: 第 ' + (G.save.bestSiegeWave || 0) + ' 潮', 22, 66, 13, '#a78bfa');
      G.UI.clear();
      G.UI.button(G.W / 2 - 120, 142, 240, 42, '开始游戏', () => {
        G.audio.unlock();
        G.changeState('charselect');
      });
      G.UI.button(G.W / 2 - 120, 196, 240, 42, '元晶守卫战', () => {
        G.audio.unlock();
        G.changeState('siegechar');
      }, '#3a1f5a', '#5a2f8a');
      G.UI.button(G.W / 2 - 120, 250, 240, 42, '联机模式', () => { if (G.Net) G.Net.openLobby(); }, '#2f4a6f', '#3f5f8f');
      G.UI.button(G.W / 2 - 120, 304, 115, 42, '音效: ' + (G.save.sound ? '开' : '关'), () => {
        G.save.sound = !G.save.sound;
        G.audio.setEnabled(G.save.sound);
        G.saveWrite();
      });
      G.UI.button(G.W / 2 + 5, 304, 115, 42, '音乐: ' + (G.save.music ? '开' : '关'), () => {
        G.save.music = !G.save.music;
        G.audio.setMusicEnabled(G.save.music);
        G.saveWrite();
      });
      const sx = G.W / 2 - 120, sw = 240;
      G.save.masterVol = G.UI.slider(sx, 360, sw, 8, G.save.masterVol || 0.7, '主音量', (v) => {
        G.save.masterVol = v; G.audio.setMasterVolume(v); G.saveWrite();
      });
      G.save.sfxVol = G.UI.slider(sx, 385, sw, 8, G.save.sfxVol || 0.7, '音效音量', (v) => {
        G.save.sfxVol = v; G.audio.setSfxVolume(v); G.saveWrite();
      });
      G.save.musicVol = G.UI.slider(sx, 410, sw, 8, G.save.musicVol || 0.4, '音乐音量', (v) => {
        G.save.musicVol = v; G.audio.setMusicVolume(v); G.saveWrite();
      });
      G.UI.button(G.W / 2 - 120, 434, 240, 40, '自动射击: ' + (G.save.autofire ? '开' : '关'), () => {
        G.save.autofire = !G.save.autofire;
        G.saveWrite();
      });
      G.UI.button(G.W / 2 - 120, 478, 240, 40, '📖 图鉴', () => {
        G.changeState('gallery');
      }, '#3a1f5a', '#5a2f8a');
      G.text(ctx, '操作: WASD 移动 · 鼠标瞄准 · 左键射击 · 空格技能 · E 交互 · Q 切枪 · Esc 暂停', G.W / 2, 532, 13, '#64748b', 'center');
    },

    drawGallery() {
      const ctx = G.ctx;
      ctx.fillStyle = '#0d1420';
      ctx.fillRect(0, 0, G.W, G.H);
      G.UI.clear();
      // 初始化状态
      if (!G.gallery) G.gallery = { tab: 'monster', scroll: 0, selected: null, dragY: 0, dragging: false };
      const g = G.gallery;
      // 返回按钮
      G.UI.button(20, 10, 80, 34, '← 返回', () => G.changeState('menu'), '#5a3a2a', '#7a4a3a');
      G.text(ctx, '📖 图鉴', G.W / 2, 28, 28, '#ffd54f', 'center', true);
      // 页签
      const tabY = 52, tabW = 140, tabH = 34;
      const tabX1 = G.W / 2 - tabW - 8;
      const tabX2 = G.W / 2 + 8;
      G.UI.button(tabX1, tabY, tabW, tabH, '怪物图鉴', () => { g.tab = 'monster'; g.scroll = 0; g.selected = null; }, g.tab === 'monster' ? '#3a1f5a' : '#2a2a3a', g.tab === 'monster' ? '#5a2f8a' : '#3a3a4a');
      G.UI.button(tabX2, tabY, tabW, tabH, '武器图鉴', () => { g.tab = 'weapon'; g.scroll = 0; g.selected = null; }, g.tab === 'weapon' ? '#3a1f5a' : '#2a2a3a', g.tab === 'weapon' ? '#5a2f8a' : '#3a3a4a');
      // 内容区
      const cy = 94, ch = G.H - cy - 10;
      const listW = 210, detailX = 230, detailW = G.W - detailX - 20;
      // 列表背景
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(10, cy, listW, ch);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, cy, listW, ch);
      // 详情背景
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(detailX, cy, detailW, ch);
      ctx.strokeRect(detailX, cy, detailW, ch);
      // 构建列表
      var items = [];
      if (g.tab === 'monster') {
        items = Object.keys(G.ENEMIES).map(k => ({ id: k, ...G.ENEMIES[k] }));
      } else {
        items = Object.keys(G.WEAPONS).map(k => ({ id: k, ...G.WEAPONS[k] }));
      }
      // 列表项
      const itemH = 36, padding = 4;
      const maxScroll = Math.max(0, items.length * itemH - ch + 10);
      // 鼠标滚轮滚动
      if (G.mouse.wheel) {
        g.scroll += G.mouse.wheel * 30;
        g.scroll = G.clamp(g.scroll, 0, maxScroll);
        G.mouse.wheel = 0;
      }
      // 触摸拖拽滚动（手机端）
      const inListArea = G.mouse.x >= 14 && G.mouse.x <= 10 + listW - 4 && G.mouse.y >= cy && G.mouse.y <= cy + ch;
      if (G.mouse.down && inListArea) {
        if (!g.dragging) {
          g.dragging = true;
          g.dragY = G.mouse.y;
        } else {
          const dy = g.dragY - G.mouse.y;
          g.scroll += dy;
          g.scroll = G.clamp(g.scroll, 0, maxScroll);
          g.dragY = G.mouse.y;
        }
      } else {
        g.dragging = false;
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(10, cy, listW, ch); ctx.clip();
      for (var i = 0; i < items.length; i++) {
        const iy = cy + 4 + i * itemH - g.scroll;
        if (iy < cy - itemH || iy > cy + ch) continue;
        const item = items[i];
        const hover = G.mouse.x >= 14 && G.mouse.x <= 10 + listW - 4 && G.mouse.y >= iy && G.mouse.y <= iy + itemH - 2;
        const selected = g.selected && g.selected.id === item.id;
        ctx.fillStyle = selected ? 'rgba(255,255,255,0.12)' : (hover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)');
        ctx.fillRect(14, iy, listW - 8, itemH - 2);
        // 注册为按钮，由 handleClick 在 update() 中处理点击
        this.buttons.push({ x: 14, y: iy, w: listW - 8, h: itemH - 2, fn: (() => {
          const it = item; return () => { g.selected = it; G.audio.play('click'); };
        })() });
        var emoji = g.tab === 'monster' ? '' : (item.emoji || '');
        var name = item.name || item.id;
        ctx.fillStyle = '#e2e8f0';
        G.text(ctx, emoji + ' ' + name, 24, iy + itemH / 2 + 4, 13, '#e2e8f0', 'left');
        if (g.tab === 'monster') {
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(14, iy + itemH - 3, listW - 8, 1);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(14, iy + itemH - 3, listW - 8, 1);
        }
      }
      ctx.restore();
      // 滚动指示器
      if (maxScroll > 0) {
        const sbH = ch * ch / (items.length * itemH);
        const sbY = cy + (g.scroll / maxScroll) * (ch - sbH);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(10 + listW - 6, sbY, 4, sbH);
      }
      // 详情区域
      if (g.selected) {
        const sel = g.selected;
        const dx = detailX + 14, dy = cy + 14;
        // 缩略图区
        const thumbX = detailX + detailW / 2 - 30, thumbY = dy + 20;
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(thumbX - 60, thumbY - 70, 180, 170);
        ctx.save();
        ctx.translate(thumbX + 30, thumbY + 20);
        if (g.tab === 'monster') {
          this.drawGalleryMonster(ctx, sel);
        } else {
          this.drawGalleryWeapon(ctx, sel);
        }
        ctx.restore();
        // 属性文字
        var tx = dx, ty = thumbY + 100;
        ctx.fillStyle = '#ffd54f';
        G.text(ctx, sel.name, tx, ty, 20, '#ffd54f', 'left', true);
        ty += 28;
        if (g.tab === 'monster') {
          var lines = [];
          lines.push('HP: ' + sel.hp + '  速度: ' + sel.speed + '  伤害: ' + sel.dmg);
          lines.push('半径: ' + sel.r + 'px  金币: ' + (sel.coins ? sel.coins[0] + '~' + sel.coins[1] : '?'));
          if (sel.contact) lines.push('类型: 近战接触');
          if (sel.ranged) lines.push('类型: 远程射击' + (sel.burst > 1 ? ' (' + sel.burst + '连射)' : '') + '  射速: ' + (sel.rate || '?') + 's');
          if (sel.charge) lines.push('特殊: 冲锋攻击');
          if (sel.frontShield) lines.push('特殊: 正面减伤70%（需绕后）');
          if (sel.chargedShot) lines.push('特殊: 蓄力' + sel.chargeTime + '秒后射出高伤箭(' + sel.chargedDmg + ')');
          if (sel.reviveInterval) lines.push('特殊: 每' + sel.reviveInterval + '秒复活一只死亡小怪');
          if (sel.lowHpBomb) lines.push('特殊: HP<30%时自爆(范围' + sel.bombRange + ', 伤害' + sel.bombDmg + ')');
          if (sel.unstoppable) lines.push('特殊: 免疫击退/减速');
          if (sel.healInterval) lines.push('特殊: 每' + sel.healInterval + '秒回复周围' + sel.healAmount + 'HP');
          if (sel.fireTrail) lines.push('特殊: 移动留下火焰路径');
          if (sel.contactBomb) lines.push('特殊: 触碰即爆(范围' + sel.bombRange + ', 伤害' + sel.bombDmg + ')');
          if (sel.lanceRange) lines.push('特殊: 突刺距离' + sel.lanceRange + 'px, 击退');
          if (sel.bossGuardAura) lines.push('特殊: 为附近BOSS提供30%减伤');
          if (sel.selfDestruct) lines.push('特殊: 死亡自爆(范围60, 伤害3)');
          if (sel.arc) lines.push('特殊: 抛物线投掷');
          if (sel.hide) lines.push('特殊: 伪装静止, 靠近' + sel.detectRange + 'px触发');
          if (sel.slowAura) lines.push('特殊: ' + sel.slowAura + 'px减速光环');
          if (sel.slowShot) lines.push('特殊: 子弹减速' + sel.slowShot + '秒');
          if (sel.stunOnHit) lines.push('特殊: 冲锋眩晕玩家' + sel.stunOnHit + '秒');
          if (sel.splitType) lines.push('特殊: 死亡分裂2只小虚翼蝠');
          if (sel.teleport) lines.push('特殊: 每' + sel.teleport + '秒瞬移');
          if (sel.lifesteal) lines.push('特殊: 攻击回复' + sel.lifesteal + 'HP');
          for (var li = 0; li < lines.length; li++) {
            ctx.fillStyle = '#94a3b8';
            G.text(ctx, lines[li], tx, ty + li * 18, 12, '#94a3b8', 'left');
          }
        } else {
          // 武器详情
          var typeNames = { pistol: '单发', auto: '连射', melee: '近战', bow: '蓄力' };
          var wlines = [];
          wlines.push('类型: ' + (typeNames[sel.type] || sel.type) + '  价格: ' + sel.price + ' 🪙');
          wlines.push('伤害: ' + sel.dmg + '  射速: ' + sel.rate + '/s  能量: ' + sel.energyCost);
          if (sel.type === 'melee') {
            wlines.push('范围: ' + (sel.range || '?') + 'px  弧度: ' + (sel.arc ? Math.round(sel.arc * 57.3) + '°' : '?'));
          } else {
            wlines.push('弹丸: ' + (sel.pellets || 1) + '  散布: ' + (sel.spread || 0) + '  弹速: ' + (sel.bSpeed || '?'));
          }
          if (sel.crit > 5) wlines.push('暴击: +' + sel.crit + '%');
          if (sel.pierce) wlines.push('穿透: +' + sel.pierce);
          if (sel.knock) wlines.push('击退: ' + sel.knock);
          if (sel.burn) wlines.push('灼烧: ' + sel.burn + '秒');
          if (sel.slow) wlines.push('减速: ' + Math.round(sel.slow * 100) + '%');
          if (sel.aoe) wlines.push('AOE范围: ' + sel.aoe);
          if (sel.poison) wlines.push('中毒: ' + sel.poison + '秒');
          if (sel.charge) wlines.push('蓄力: ' + sel.charge + '秒');
          for (var wi = 0; wi < wlines.length; wi++) {
            ctx.fillStyle = '#94a3b8';
            G.text(ctx, wlines[wi], tx, ty + wi * 18, 12, '#94a3b8', 'left');
          }
        }
      } else {
        G.text(ctx, '← 点击左侧列表查看详情', detailX + detailW / 2, cy + ch / 2 + 4, 16, '#94a3b8', 'center');
      }
    },

    drawGalleryMonster(ctx, m) {
      var r = Math.min(40, Math.max(14, m.r || 14));
      var type = m.id || '';
      var color = m.color || '#888';
      // 阴影
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, r * 0.8, r * 0.8, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      // 身体
      ctx.fillStyle = color;
      if (type === 'mushroom') {
        ctx.fillStyle = '#d8b4fe';
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c084fc';
        ctx.beginPath(); ctx.arc(0, -4, r * 0.85, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#f5f3ff';
        ctx.beginPath(); ctx.arc(-4, -5, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(4, -5, 3, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'goblin') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#65a30d';
        ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(-14, -18); ctx.lineTo(-2, -8); ctx.fill();
        ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(14, -18); ctx.lineTo(2, -8); ctx.fill();
      } else if (type === 'plant') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#166534';
        ctx.fillRect(-3, r - 4, 6, 8);
        ctx.fillStyle = '#f87171';
        ctx.beginPath(); ctx.arc(-5, 2, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(5, 2, 3, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'beetle') {
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.2, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.beginPath(); ctx.arc(0, -r * 0.5, r * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(-3, -r * 0.5 - 1, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(3, -r * 0.5 - 1, 2, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'ice_beast') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(103,232,249,0.15)';
        ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f0f9ff';
        for (var ii = 0; ii < 5; ii++) {
          var ang = ii * Math.PI * 2 / 5;
          ctx.beginPath(); ctx.arc(Math.cos(ang) * r * 0.5, Math.sin(ang) * r * 0.5, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      } else if (type === 'snowman') {
        ctx.beginPath(); ctx.arc(0, -3, r * 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 5, r * 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-3, -16); ctx.lineTo(3, -16); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(-3, -5, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(3, -5, 1.5, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'caveman') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-6, -r - 6, 12, 8);
      } else if (type === 'bat_swarm' || type === 'mini_bat') {
        var isMini = type === 'mini_bat';
        ctx.fillStyle = isMini ? '#c4b5fd' : '#a78bfa';
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = isMini ? '#a78bfa' : '#8b5cf6';
        ctx.beginPath(); ctx.moveTo(-r, -3); ctx.lineTo(-r - 8, -8); ctx.lineTo(-r, -6); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r, -3); ctx.lineTo(r + 8, -8); ctx.lineTo(r, -6); ctx.fill();
      } else if (type === 'shadow') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(76,29,149,0.3)';
        ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(-3, -2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(3, -2, 2, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'ghost_mage') {
        ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8b5cf6';
        ctx.fillRect(8, -6, 3, 14);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(9, -8, 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (type === 'armor_knight') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.fillRect(-2, -r - 2, r * 0.6, r * 1.4);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(-2, -r - 4, r * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(148,163,184,0.2)';
        ctx.beginPath(); ctx.arc(r * 0.5, 0, r * 0.5, -Math.PI / 3, Math.PI / 3); ctx.fill();
      } else if (type === 'crossbowman') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(8, -4, 14, 4);
        ctx.fillRect(18, -5, 2, 6);
      } else if (type === 'necromancer') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4c1d95';
        ctx.fillRect(-3, -r - 8, 6, 12);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, -r - 10, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(-1, -r - 10, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(1, -r - 10, 1, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'bomber') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-2, -r - 8, 4, 9);
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.arc(0, -r - 10, 3, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'golem') {
        ctx.fillRect(-r * 0.8, -r * 0.9, r * 1.6, r * 1.8);
        ctx.fillStyle = '#57534e';
        ctx.beginPath(); ctx.arc(0, -r * 0.5, r * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(-4, -r * 0.5 - 2, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(4, -r * 0.5 - 2, 3, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'dark_priest') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(0, -r - 6, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(124,58,237,0.1)';
        ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'hellhound') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-14, -18); ctx.lineTo(-2, -8); ctx.fill();
        ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(14, -18); ctx.lineTo(2, -8); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(-4, -3, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(4, -3, 2, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'bomb_spider') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#991b1b';
        ctx.beginPath(); ctx.arc(0, -3, r * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(-2, -4, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(2, -4, 1.5, 0, Math.PI * 2); ctx.fill();
        for (var si = 0; si < 4; si++) {
          var sang = si * Math.PI * 2 / 4;
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(Math.cos(sang) * r + 2, Math.sin(sang) * r + 2, 6, 2);
        }
      } else if (type === 'spearman') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d97706';
        ctx.fillRect(8, -2, 22, 4);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.moveTo(30, -3); ctx.lineTo(38, 0); ctx.lineTo(30, 3); ctx.closePath(); ctx.fill();
      } else if (type === 'boss_guard') {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-4, -r - 4, 8, 6);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(0, -r - 6, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(71,85,105,0.15)';
        ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'slime') {
        // 蚀浆怪：果冻状椭圆 + 高光
        ctx.beginPath(); ctx.ellipse(0, 2, r * 1.05, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.25, r * 0.3, r * 0.18, -0.4, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'bat') {
        // 虚翼蝠：圆身 + 三角翼 + 尖耳
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c084fc';
        ctx.beginPath(); ctx.moveTo(-r * 0.5, -2); ctx.lineTo(-r * 1.5, -10); ctx.lineTo(-r * 0.5, 3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.5, -2); ctx.lineTo(r * 1.5, -10); ctx.lineTo(r * 0.5, 3); ctx.fill();
        ctx.fillStyle = '#d8b4fe';
        ctx.beginPath(); ctx.moveTo(-3, -r * 0.5); ctx.lineTo(-5, -r * 1.3); ctx.lineTo(0, -r * 0.7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(3, -r * 0.5); ctx.lineTo(5, -r * 1.3); ctx.lineTo(0, -r * 0.7); ctx.fill();
      } else if (type === 'shooter') {
        // 蚀射虫：头盔 + 枪管
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.beginPath(); ctx.arc(0, -r * 0.3, r * 0.7, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#475569';
        ctx.fillRect(r * 0.4, -2, r * 1.2, 5);
        ctx.fillRect(r * 1.4, -3, r * 0.4, 7);
      } else if (type === 'turret') {
        // 蚀晶炮台：方底座 + 炮管
        ctx.fillRect(-r * 0.8, -r * 0.3, r * 1.6, r * 0.6);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(r * 0.2, -r * 0.55, r * 1.4, r * 0.35);
        ctx.fillStyle = '#475569';
        ctx.fillRect(-r * 0.6, r * 0.2, r * 1.2, r * 0.3);
      } else if (type === 'brute') {
        // 厚甲蚀卫：大圆 + 红色尖刺肩甲 + 头盔
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b91c1c';
        ctx.beginPath(); ctx.moveTo(-r * 0.85, -r * 0.2); ctx.lineTo(-r * 1.5, -r * 0.9); ctx.lineTo(-r * 0.45, -r * 0.5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.85, -r * 0.2); ctx.lineTo(r * 1.5, -r * 0.9); ctx.lineTo(r * 0.45, -r * 0.5); ctx.fill();
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath(); ctx.arc(0, -r * 0.3, r * 0.75, Math.PI, 0); ctx.fill();
      } else if (type === 'skeleton') {
        // 骨弩手：骷髅脸 + 弓
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.15, r * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.15, r * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(-r * 0.15, r * 0.1, r * 0.3, r * 0.15);
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(r * 0.8, 0, r * 0.55, -Math.PI * 0.55, Math.PI * 0.55); ctx.stroke();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(r * 0.15, 0); ctx.lineTo(r * 1.25, 0); ctx.stroke();
      } else if (type === 'mage') {
        // 蚀纹法师：尖帽 + 法杖
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7c3aed';
        ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.4); ctx.lineTo(0, -r * 1.7); ctx.lineTo(r * 0.6, -r * 0.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(r * 0.5, -r * 0.5, 3, r * 1.1);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(r * 0.5 + 1.5, -r * 0.5, r * 0.3, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'ghost') {
        // 残虚影：圆顶 + 波浪底
        ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(0, -r * 0.2, r, Math.PI, 0); ctx.fill();
        ctx.fillRect(-r, -r * 0.2, r * 2, r * 0.5);
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.2);
        ctx.lineTo(-r, r * 0.5);
        for (var wj = 0; wj < 4; wj++) {
          var wx = -r + (wj * 2 + 1) * r * 0.5;
          ctx.quadraticCurveTo(wx, r * 0.1, wx + r * 0.25, r * 0.5);
        }
        ctx.lineTo(r, -r * 0.2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (type === 'raider') {
        // 劫掠蚀徒：橙色身体 + 面具 + 斧头
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7c2d12';
        ctx.beginPath(); ctx.arc(0, -r * 0.15, r * 0.7, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(-3, -r * 0.25, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(3, -r * 0.25, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(r * 0.5, r * 0.1, 3, r * 1.1);
        ctx.fillStyle = '#f87171';
        ctx.beginPath(); ctx.moveTo(r * 0.5 + 1, -r * 0.4); ctx.lineTo(r * 0.5 + 7, r * 0.0); ctx.lineTo(r * 0.5 - 3, r * 0.0); ctx.closePath(); ctx.fill();
      } else if (type === 'flyer') {
        // 高域突袭者：红色身体 + 翅膀 + 眼睛
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.moveTo(-r * 0.5, -2); ctx.lineTo(-r * 1.4, -10); ctx.lineTo(-r * 0.5, 3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.5, -2); ctx.lineTo(r * 1.4, -10); ctx.lineTo(r * 0.5, 3); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(-3, -2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(3, -2, 2, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'summoner') {
        // 虚纹召唤者：紫色法袍 + 尖帽 + 法杖 + 光环
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5b21b6';
        ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.3); ctx.lineTo(0, -r * 1.5); ctx.lineTo(r * 0.5, -r * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(r * 0.5, -r * 0.4, 3, r * 1.0);
        ctx.fillStyle = '#a78bfa';
        ctx.beginPath(); ctx.arc(r * 0.5 + 1.5, -r * 0.4, r * 0.25, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(168,85,247,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(0, 0, r + 8, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      }
      // 描边
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      // 眼睛（朝右看）
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-4 + r * 0.3, -2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4 + r * 0.3, -2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(-4 + r * 0.4, -2, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4 + r * 0.4, -2, 1.5, 0, Math.PI * 2); ctx.fill();
    },

    drawGalleryWeapon(ctx, w) {
      if (w.type === 'melee') {
        // 近战武器：剑/斧形状
        ctx.fillStyle = w.color || '#d9f99d';
        ctx.fillRect(-4, -18, 8, 30);
        ctx.fillRect(-8, 8, 16, 6);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-3, 12, 6, 10);
        ctx.fillStyle = w.color || '#d9f99d';
        if (w.id === 'battle_axe') {
          ctx.beginPath(); ctx.arc(0, -20, 18, -0.8, Math.PI + 0.8); ctx.fill();
        }
      } else if (w.type === 'bow') {
        // 弓
        ctx.strokeStyle = w.color || '#fbbf24';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 5, 22, -Math.PI * 0.7, Math.PI * 0.7); ctx.stroke();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-2, -28, 4, 40);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-18, 8); ctx.lineTo(18, 8); ctx.stroke();
      } else {
        // 枪械/法杖
        ctx.fillStyle = w.color || '#ffd54f';
        ctx.fillRect(-6, -8, 22, 16);
        ctx.fillRect(14, -4, 12, 6);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-6, 6, 10, 8);
        if (w.type === 'auto') {
          // 自动武器加弹匣
          ctx.fillStyle = '#444';
          ctx.fillRect(4, 10, 8, 6);
        }
        // 法杖宝石
        if (w.id === 'fire' || w.id === 'ice' || w.id === 'thunder_staff' || w.id === 'poison_dart' || w.id === 'lightning') {
          ctx.fillStyle = w.color;
          ctx.beginPath(); ctx.arc(26, -1, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath(); ctx.arc(24, -2, 2, 0, Math.PI * 2); ctx.fill();
        }
      }
    },

    drawLobbyBg() {
      const ctx = G.ctx;
      G.UI.clear();
      ctx.fillStyle = '#0d1420';
      ctx.fillRect(0, 0, G.W, G.H);
      G.text(ctx, '⚔️ 联机大厅', G.W / 2, 110, 44, '#ffd54f', 'center', true);
      G.text(ctx, '创建或加入房间，与好友一同冒险（2~4 人）', G.W / 2, 158, 16, '#94a3b8', 'center');
      G.text(ctx, '房主选择晶悟，所有增强效果对全队生效', G.W / 2, 184, 13, '#7fd4ff', 'center');
    },

    drawCharSelect() {
      const ctx = G.ctx;
      ctx.fillStyle = '#0d1420';
      ctx.fillRect(0, 0, G.W, G.H);
      G.text(ctx, '选择角色', G.W / 2, 42, 32, '#ffd54f', 'center', true);
      if (G.state === 'siegechar') {
        G.text(ctx, '元晶守卫战', G.W / 2, 62, 14, '#a78bfa', 'center', true);
      }
      G.text(ctx, '星晶: ' + G.save.gems, G.W - 18, 38, 18, '#ffd54f', 'right', true);

      const cs = G.CHARACTERS;
      const cw = 185, ch = 170, gap = 18, cols = 3;
      const x0 = G.W / 2 - (cols * cw + (cols - 1) * gap) / 2;
      const y0 = 64;
      G.UI.clear();
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        const col = i % cols, row = Math.floor(i / cols);
        const x = x0 + col * (cw + gap), y = y0 + row * (ch + 12);
        const unlocked = G.save.unlocked.includes(c.id);
        const hover = G.mouse.x >= x && G.mouse.x <= x + cw && G.mouse.y >= y && G.mouse.y <= y + ch;
        const selected = G.selectedChar === c.id;
        ctx.fillStyle = hover ? '#22304e' : '#182438';
        G.roundRect(ctx, x, y, cw, ch, 12); ctx.fill();
        ctx.strokeStyle = selected ? '#ffd54f' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = selected ? 3 : 1.5;
        G.roundRect(ctx, x, y, cw, ch, 12); ctx.stroke();
        ctx.globalAlpha = unlocked ? 1 : 0.45;
        G.text(ctx, c.emoji, x + cw / 2, y + 36, 38, '#fff', 'center');
        G.text(ctx, c.name, x + cw / 2, y + 70, 19, '#fff', 'center', true);
        G.text(ctx, '❤' + c.base.hp + ' 🛡' + c.base.armor + ' ⚡' + c.base.energy, x + cw / 2, y + 94, 12, '#cbd5e1', 'center');
        G.text(ctx, '暴击 ' + c.base.crit + '% · 移速 ' + c.base.speed, x + cw / 2, y + 112, 11, '#94a3b8', 'center');
        G.text(ctx, c.skill.name + ' (' + c.skill.cost + '⚡)', x + cw / 2, y + 130, 11, '#7fd4ff', 'center');
        ctx.globalAlpha = 1;
        if (unlocked) G.text(ctx, '已解锁', x + cw / 2, y + ch - 14, 13, '#4ade80', 'center', true);
        else G.text(ctx, '🔒 ' + c.cost + ' 星晶', x + cw / 2, y + ch - 14, 13, '#ffd54f', 'center', true);
        this.buttons.push({ x, y, w: cw, h: ch, fn: (() => { const cc = c; return () => this.selectChar(cc); })() });
      }

      const sel = G.CHARACTERS.find(c => c.id === G.selectedChar);
      if (sel) {
        G.text(ctx, sel.desc, G.W / 2, 446, 14, '#94a3b8', 'center');
        G.text(ctx, '技能「' + sel.skill.name + '」: ' + sel.skill.desc + '  (冷却 ' + sel.skill.cd + 's)', G.W / 2, 466, 14, '#7fd4ff', 'center');
      }
      this.button(30, G.H - 52, 130, 40, '返回', () => G.changeState('menu'));
      this.button(G.W - 210, G.H - 52, 180, 40, '虚蚀因子: ' + (G.useFactors ? '开' : '关'), () => { G.useFactors = !G.useFactors; });
      var startLabel = G.state === 'siegechar' ? '守卫元晶' : '进入虚蚀领域';
      var startColor = G.state === 'siegechar' ? '#4a2f7a' : '#2f6f4f';
      this.button(G.W / 2 - 100, G.H - 56, 200, 44, startLabel, () => {
        G.audio.unlock();
        if (G.state === 'siegechar') {
          G.startSiege(G.selectedChar);
        } else {
          G.startRun(G.selectedChar, G.useFactors);
        }
      }, startColor);
    },

    selectChar(c) {
      if (G.save.unlocked.includes(c.id)) {
        G.selectedChar = c.id;
        G.audio.play('click');
        return;
      }
      if (G.save.gems >= c.cost) {
        G.save.gems -= c.cost;
        G.save.unlocked.push(c.id);
        G.selectedChar = c.id;
        G.saveWrite();
        G.audio.play('buy');
      } else {
        G.audio.play('dry');
      }
    },

    drawHUD(game) {
      const ctx = G.ctx, p = game.player;
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
      let statusY = 96;
      if (game.factors && game.factors.length) {
        G.text(ctx, '因子: ' + game.factors.map(f => f.emoji + f.name).join('  '), 16, statusY, 12, '#fbbf24');
        statusY += 16;
      }
      G.text(ctx, '第 ' + game.floor + ' 域', G.W / 2, 16, 18, '#fff', 'center', true);
      const wrm = game.room;
      if (wrm.waveMax > 1 && !wrm.cleared) {
        const curWave = wrm.waveState === 'active' ? wrm.wave : wrm.wave + 1;
        G.text(ctx, '蚀潮 ' + Math.min(curWave, wrm.waveMax) + '/' + wrm.waveMax, G.W / 2, 38, 13, '#fbbf24', 'center', true);
      }
      G.text(ctx, '🪙 ' + (game.player ? game.player.coins : 0), G.W - 16, 22, 18, '#ffd54f', 'right', true);
      G.text(ctx, '击杀 ' + game.kills, G.W - 16, 44, 13, '#94a3b8', 'right');

      const boss = game.enemies.find(e => e.boss && !e.dead);
      if (boss) {
        G.text(ctx, boss.name, G.W / 2, 48, 16, '#f87171', 'center', true);
        G.drawBar(ctx, G.W / 2 - 200, 62, 400, 14, boss.hp / boss.maxHp, '#ef4444');
      }

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

      for (let i = 0; i < p.weapons.length; i++) {
        const w = p.weapons[i];
        const x = 14 + i * 82, y = G.H - 72;
        if (G.mouse.x >= x && G.mouse.x <= x + 74 && G.mouse.y >= y && G.mouse.y <= y + 56) {
          this.drawWeaponTooltip(ctx, w, x + 37, y);
        }
      }
      const s = p.skill;
      if (!G.isMobile) {
        const sx = G.W - 84, sy = G.H - 72;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        G.roundRect(ctx, sx, sy, 70, 56, 8); ctx.fill();
        G.text(ctx, s.emoji, sx + 35, sy + 21, 24, '#fff', 'center');
        G.text(ctx, s.name, sx + 35, sy + 40, 10, '#e2e8f0', 'center');
        G.text(ctx, '耗能 ' + s.cost, sx + 35, sy + 51, 9, '#7dd3fc', 'center');
        if (s.cdLeft > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.62)';
          G.roundRect(ctx, sx, sy, 70, 56 * (s.cdLeft / s.cd), 8); ctx.fill();
          G.text(ctx, s.cdLeft.toFixed(1), sx + 35, sy + 26, 15, '#fff', 'center', true);
        }
        G.text(ctx, '空格', sx + 35, sy - 9, 11, '#94a3b8', 'center');
      }

      const d = game.dungeon;
      const mw = d.gridW * 26, mh = d.gridH * 17;
      const mx = G.W - mw - 18, my = 66;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      G.roundRect(ctx, mx - 4, my - 4, mw + 8, mh + 8, 6); ctx.fill();
      for (const r of d.rooms) {
        const px = mx + r.gx * 26, py = my + r.gy * 17;
        if (!r.visited) {
          // draw unvisited rooms (dim + red dot) so players can find the last combat room
          ctx.fillStyle = 'rgba(71,85,105,0.35)';
          ctx.fillRect(px, py, 24, 15);
          if (r.type === 'start' || r.type === 'monster' || r.type === 'elite') {
            ctx.fillStyle = '#ef4444';
            ctx.beginPath(); ctx.arc(px + 19, py + 4, 3, 0, G.TAU); ctx.fill();
          }
          ctx.strokeStyle = 'rgba(148,163,184,0.45)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px, py, 24, 15);
          continue;
        }
        if (r === game.room) ctx.fillStyle = '#7fd4ff';
        else if (r.type === 'boss') ctx.fillStyle = d.bossUnlocked ? '#4ade80' : '#ef4444';
        else if (r.type === 'shop') ctx.fillStyle = '#fbbf24';
        else if (r.type === 'treasure') ctx.fillStyle = '#c084fc';
        else if (r.type === 'revive') ctx.fillStyle = '#2dd4bf';
        else ctx.fillStyle = '#475569';
        ctx.fillRect(px, py, 24, 15);
        if (r.cleared) {
          ctx.fillStyle = 'rgba(5,46,22,0.85)';
          ctx.beginPath(); ctx.arc(px + 19, py + 4, 4.5, 0, G.TAU); ctx.fill();
          G.text(ctx, '✓', px + 19, py + 4, 9, '#4ade80', 'center', true);
        } else if (r.type === 'start' || r.type === 'monster' || r.type === 'elite' || r.type === 'boss') {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath(); ctx.arc(px + 19, py + 4, 3, 0, G.TAU); ctx.fill();
        }
        if (r === game.room) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(px, py, 24, 15); }
      }

      G.text(ctx, '✓已清 · ●未清 · 蓝=当前 · 青=晶泉房', mx, my + mh + 12, 9, '#94a3b8');
      if (game.banner && game.banner.t > 0) {
        ctx.globalAlpha = Math.min(1, game.banner.t);
        G.text(ctx, game.banner.text, G.W / 2, 100, 24, '#ffd54f', 'center', true);
        ctx.globalAlpha = 1;
      }
      if (game.bossLockMsgT > 0) {
        ctx.globalAlpha = Math.min(1, game.bossLockMsgT);
        G.text(ctx, game.bossLockMsg, G.W / 2, 130, 18, '#4ade80', 'center', true);
        ctx.globalAlpha = 1;
      }
      if (game.interactHint) {
        G.text(ctx, game.interactHint, G.W / 2, G.H - 98, 15, '#7fd4ff', 'center');
      }
    },

    drawTalent(game) {
      const ctx = G.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, G.W, G.H);
      G.text(ctx, '选择晶悟', G.W / 2, 110, 34, '#ffd54f', 'center', true);
      G.text(ctx, '点击卡片选择晶悟，然后继续闯关', G.W / 2, 140, 14, '#94a3b8', 'center');
      const cards = game.talentChoices;
      const cw = 250, ch = 250, gap = 30;
      const x0 = G.W / 2 - (cw * cards.length + gap * (cards.length - 1)) / 2;
      G.UI.clear();
      for (let i = 0; i < cards.length; i++) {
        const t = cards[i];
        const x = x0 + i * (cw + gap), y = 155;
        const hover = G.mouse.x >= x && G.mouse.x <= x + cw && G.mouse.y >= y && G.mouse.y <= y + ch;
        ctx.fillStyle = hover ? '#2c3e5c' : '#1b2740';
        G.roundRect(ctx, x, y, cw, ch, 12); ctx.fill();
        ctx.strokeStyle = hover ? '#7fd4ff' : 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        G.roundRect(ctx, x, y, cw, ch, 12); ctx.stroke();
        G.text(ctx, t.emoji, x + cw / 2, y + 75, 52, '#fff', 'center');
        G.text(ctx, t.name, x + cw / 2, y + 150, 22, '#fff', 'center', true);
        G.text(ctx, t.desc, x + cw / 2, y + 195, 14, '#94a3b8', 'center');
        this.buttons.push({ x, y, w: cw, h: ch, fn: (() => { const tt = t; return () => G.applyTalentChoice(game, tt); })() });
      }
    },

    drawShop(game) {
      const ctx = G.ctx, p = game.player;
      ctx.fillStyle = 'rgba(0,0,0,0.74)';
      ctx.fillRect(0, 0, G.W, G.H);
      G.text(ctx, '商人小店', G.W / 2, 80, 30, '#fbbf24', 'center', true);
      G.text(ctx, '金币: ' + (game.player ? game.player.coins : 0), G.W / 2, 116, 18, '#ffd54f', 'center');
      const items = game.room.shop.stock;
      const cw = 200, ch = 210, gap = 22;
      const x0 = G.W / 2 - (cw * items.length + gap * (items.length - 1)) / 2;
      G.UI.clear();
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const x = x0 + i * (cw + gap), y = 150;
        ctx.fillStyle = '#1b2740';
        G.roundRect(ctx, x, y, cw, ch, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1.5;
        G.roundRect(ctx, x, y, cw, ch, 12); ctx.stroke();
        if (it.kind === 'weapon') {
          const wd = it.weapon;
          G.text(ctx, wd.emoji, x + cw / 2, y + 42, 40, '#fff', 'center');
          G.text(ctx, wd.name, x + cw / 2, y + 80, 18, '#fff', 'center', true);
          const lines = G.weaponStatLines(wd);
          for (let li = 0; li < lines.length; li++) {
            G.text(ctx, lines[li], x + cw / 2, y + 104 + li * 14, 11, '#94a3b8', 'center');
          }
        } else {
          G.text(ctx, '🧪', x + cw / 2, y + 42, 40, '#fff', 'center');
          G.text(ctx, it.name, x + cw / 2, y + 80, 18, '#fff', 'center', true);
          G.text(ctx, it.desc, x + cw / 2, y + 108, 12, '#94a3b8', 'center');
        }
        if (it.sold) {
          G.text(ctx, '已售出', x + cw / 2, y + ch - 24, 15, '#64748b', 'center', true);
        } else {
          this.button(x + 34, y + ch - 46, cw - 68, 36, it.price + ' 🪙', (() => { const item = it; return () => G.buyShopItem(game, item); })(), (game.player ? game.player.coins : 0) >= it.price ? '#2f6f4f' : '#5a5a5a');
        }
      }
      for (let i = 0; i < p.weapons.length; i++) {
        const w = p.weapons[i];
        const x = 14 + i * 82, y = G.H - 72;
        if (G.mouse.x >= x && G.mouse.x <= x + 74 && G.mouse.y >= y && G.mouse.y <= y + 56) {
          this.drawWeaponTooltip(ctx, w, x + 37, y);
        }
      }
      if (game.replaceConfirm) {
        G.UI.clear();
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(0, 0, G.W, G.H);
        const rcItem = game.replaceConfirm.item;
        const curW = p.weapons[p.cur];
        G.text(ctx, '武器槽已满', G.W / 2, 175, 26, '#ffd54f', 'center', true);
        G.text(ctx, '购买「' + rcItem.weapon.name + '」将替换当前武器「' + curW.name + '」，是否继续?', G.W / 2, 218, 14, '#e2e8f0', 'center');
        G.text(ctx, '金币 ' + (game.player ? game.player.coins : 0) + ' / 价格 ' + rcItem.price + ' 🪙', G.W / 2, 244, 13, '#fbbf24', 'center');
        this.button(G.W / 2 - 125, 282, 115, 46, '确认替换', () => G.confirmReplaceWeapon(game), '#2f6f4f');
        this.button(G.W / 2 + 10, 282, 115, 46, '取消', () => { game.replaceConfirm = null; }, '#5a5a5a');
        return;
      }
      this.button(G.W / 2 - 70, G.H - 64, 140, 40, '离开', () => {
        if (game.player) game.player.shopOpen = false;
        if (G.Net && G.Net.active && G.Net.closeShop) G.Net.closeShop();
      });
    },


    drawWeaponTooltip(ctx, w, anchorX, anchorY) {
      const lines = G.weaponStatLines(w);
      const tw = 210, th = 24 + lines.length * 15;
      const x = Math.min(Math.max(anchorX - 40, 8), G.W - tw - 8);
      const y = Math.max(anchorY - th - 8, 8);
      ctx.fillStyle = 'rgba(8,12,22,0.96)';
      G.roundRect(ctx, x, y, tw, th, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(125,212,255,0.5)';
      ctx.lineWidth = 1.5;
      G.roundRect(ctx, x, y, tw, th, 8); ctx.stroke();
      G.text(ctx, w.emoji + ' ' + w.name, x + 10, y + 14, 13, '#ffd54f', 'left', true);
      lines.forEach((l, li) => G.text(ctx, l, x + 10, y + 32 + li * 15, 11, '#cbd5e1', 'left'));
    },
    drawPause(game) {
      const ctx = G.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.66)';
      ctx.fillRect(0, 0, G.W, G.H);
      G.text(ctx, '⏸ 暂停', G.W / 2, 50, 32, '#fff', 'center', true);
      G.UI.clear();
      const isNet = !!(G.Net && G.Net.active);
      let y = 100;
      G.UI.button(G.W / 2 - 110, y, 220, 40, '继续游戏', () => { G.paused = false; });
      y += 48;
      G.UI.button(G.W / 2 - 110, y, 105, 40, '音效: ' + (G.save.sound ? '开' : '关'), () => {
        G.save.sound = !G.save.sound;
        G.audio.setEnabled(G.save.sound);
        G.saveWrite();
      });
      G.UI.button(G.W / 2 + 5, y, 105, 40, '音乐: ' + (G.save.music ? '开' : '关'), () => {
        G.save.music = !G.save.music;
        G.audio.setMusicEnabled(G.save.music);
        G.saveWrite();
      });
      y += 48;
      const sx = G.W / 2 - 110, sw = 220;
      G.save.masterVol = G.UI.slider(sx, y, sw, 8, G.save.masterVol || 0.7, '主音量', (v) => {
        G.save.masterVol = v; G.audio.setMasterVolume(v); G.saveWrite();
      });
      y += 25;
      G.save.sfxVol = G.UI.slider(sx, y, sw, 8, G.save.sfxVol || 0.7, '音效音量', (v) => {
        G.save.sfxVol = v; G.audio.setSfxVolume(v); G.saveWrite();
      });
      y += 25;
      G.save.musicVol = G.UI.slider(sx, y, sw, 8, G.save.musicVol || 0.4, '音乐音量', (v) => {
        G.save.musicVol = v; G.audio.setMusicVolume(v); G.saveWrite();
      });
      y += 36;
      G.UI.button(G.W / 2 - 110, y, 220, 40, '自动射击: ' + (G.save.autofire ? '开' : '关'), () => {
        G.save.autofire = !G.save.autofire;
        G.saveWrite();
      });
      y += 48;
      if (!isNet) G.UI.button(G.W / 2 - 110, y, 220, 40, '重新开局', () => {
        if (G.state === 'siege') {
          G.startSiege(G.selectedChar);
        } else {
          G.startRun(G.selectedChar, G.useFactors);
        }
      });
      y += 48;
      G.UI.button(G.W / 2 - 110, y, 220, 40, '返回大厅', () => {
        G.game = null;
        G.paused = false;
        if (G.Net && G.Net.active) { G.Net.backToLobby(); return; }
        G.changeState('menu');
      });
    },

    drawCheatMenu(game) {
      const ctx = G.ctx;
      const cx = G.W - 210, cy = 60, cw = 200;
      // 面板背景
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      G.roundRect(ctx, cx, cy, cw, 320, 10); ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      G.roundRect(ctx, cx, cy, cw, 320, 10); ctx.stroke();
      // 标题
      G.text(ctx, '🛠 调试菜单 [K]', cx + cw / 2, cy + 24, 15, '#f59e0b', 'center', true);
      G.UI.clear();
      const items = [
        { id: 'god', label: '无敌', desc: '不受伤害' },
        { id: 'ohk', label: '秒杀', desc: '一击必杀' },
        { id: 'infEnergy', label: '无限能量', desc: '能量不消耗' },
        { id: 'infGold', label: '无限金币', desc: '金币 9999' },
        { id: 'speed', label: '加速', desc: '移速 x2' },
        { id: 'noCd', label: '无冷却', desc: '技能无冷却' }
      ];
      let iy = cy + 42;
      for (const item of items) {
        const on = game.cheats[item.id];
        const bg = on ? '#22c55e' : '#374151';
        const hover = G.mouse.x >= cx + 10 && G.mouse.x <= cx + cw - 10 && G.mouse.y >= iy && G.mouse.y <= iy + 34;
        if (hover) {
          ctx.fillStyle = on ? '#16a34a' : '#4b5563';
        } else {
          ctx.fillStyle = bg;
        }
        G.roundRect(ctx, cx + 10, iy, cw - 20, 34, 6); ctx.fill();
        G.text(ctx, (on ? '[ON] ' : '[OFF] ') + item.label, cx + 24, iy + 12, 13, '#fff', 'left', true);
        G.text(ctx, item.desc, cx + 24, iy + 26, 10, '#94a3b8', 'left');
        G.UI.buttons.push({ x: cx + 10, y: iy, w: cw - 20, h: 34, fn: () => {
          game.cheats[item.id] = !game.cheats[item.id];
          // 特殊处理无限金币
          if (item.id === 'infGold' && game.cheats.infGold) {
            game.gold = Math.max(game.gold, 9999);
          }
        } });
        iy += 40;
      }
      G.text(ctx, '外层: 晶簇边境 · 中层: 蚀影秘境 · 核心: 虚蚀核心', cx + cw / 2, cy + 312, 10, '#64748b', 'center');
    },

    drawEnd(game, win) {
      const ctx = G.ctx;
      ctx.fillStyle = 'rgba(8,6,12,0.85)';
      ctx.fillRect(0, 0, G.W, G.H);
      const isSiege = G.state === 'siege' || (game.wave !== undefined);
      if (win) {
        if (isSiege) {
          G.text(ctx, '🛡️ 元晶尚存!', G.W / 2, 130, 44, '#4ade80', 'center', true);
        } else {
          G.text(ctx, '🏆 通关成功!', G.W / 2, 130, 44, '#ffd54f', 'center', true);
          G.text(ctx, '击败了全部 3 域的 BOSS', G.W / 2, 178, 16, '#94a3b8', 'center');
        }
      } else {
        if (isSiege) {
          G.text(ctx, '💎 元晶已摧毁', G.W / 2, 130, 44, '#f87171', 'center', true);
        } else {
          G.text(ctx, '💀 游戏结束', G.W / 2, 130, 44, '#f87171', 'center', true);
        }
      }
      var rows;
      if (isSiege) {
        rows = [
          '存活蚀潮: 第 ' + (game.wave || 0) + ' 潮',
          '击杀敌人: ' + (game.kills || 0),
          '击败BOSS: ' + (game.bossKills || 0),
          '元晶剩余: ' + Math.ceil(game.crystal ? game.crystal.hp : 0) + '/' + (game.crystal ? game.crystal.maxHp : 80),
          '获得星晶: +' + (game.gemsEarned || 0)
        ];
      } else {
        rows = [
          '到达: 第 ' + game.floor + ' 域',
          '击杀敌人: ' + game.kills,
          '获得金币: ' + (game.player ? game.player.coins : 0),
          '击败BOSS: ' + game.bossKills,
          '获得星晶: +' + game.gemsEarned
        ];
      }
      for (let i = 0; i < rows.length; i++) {
        G.text(ctx, rows[i], G.W / 2, 235 + i * 30, 18, '#e2e8f0', 'center');
      }
      G.text(ctx, '星晶余额: ' + G.save.gems, G.W / 2, 235 + rows.length * 30 + 12, 16, '#ffd54f', 'center');
      G.UI.clear();
      G.UI.button(G.W / 2 - 100, G.H - 108, 200, 48, '返回大厅', () => {
        G.game = null;
        if (G.Net && G.Net.inSession) { G.Net.backToLobby(); return; }
        G.changeState('menu');
      });
      G.text(ctx, '按 Enter 返回', G.W / 2, G.H - 44, 13, '#64748b', 'center');
    },

    drawGameOver(game) { this.drawEnd(game, false); },
    drawVictory(game) { this.drawEnd(game, true); },

    drawRoom(game) {
      const ctx = G.ctx, r = game.room;
      const floor = game.floor;
      const palettes = [
        { base: '#0d1f12', tile: '#122a18', wall: '#1a3a24' },
        { base: '#0f1a2e', tile: '#152238', wall: '#1e3a5f' },
        { base: '#1a0f0f', tile: '#261212', wall: '#3a1a1a' }
      ];
      const pal = palettes[G.clamp(floor - 1, 0, 2)];
      ctx.fillStyle = pal.base;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = pal.tile;
      const ts = 64;
      for (let ty = 0; ty < Math.ceil(r.h / ts); ty++) {
        for (let tx = 0; tx < Math.ceil(r.w / ts); tx++) {
          if ((tx + ty) % 2 === 0) continue;
          ctx.fillRect(r.x + tx * ts, r.y + ty * ts, ts, ts);
        }
      }
      // 地面主题装饰
      const t = G.time;
      if (floor === 3) {
        // 核心：龟裂熔岩光芒
        for (let i = 0; i < 10; i++) {
          const cx = r.x + ((i * 149 + 37) % r.w);
          const cy = r.y + ((i * 193 + 73) % r.h);
          const pulse = 0.4 + 0.3 * Math.sin(t * 2 + i);
          ctx.globalAlpha = 0.08 * pulse;
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          const len = G.rand(30, 55);
          const ang = G.rand(0, G.TAU);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
          ctx.lineTo(cx + Math.cos(ang + 0.4) * len * 0.5, cy + Math.sin(ang + 0.4) * len * 0.5);
          ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // 墙壁
      ctx.fillStyle = pal.wall;
      ctx.fillRect(r.x - 46, r.y - 46, r.w + 92, 46);
      ctx.fillRect(r.x - 46, r.y + r.h, r.w + 92, 46);
      ctx.fillRect(r.x - 46, r.y, 46, r.h);
      ctx.fillRect(r.x + r.w, r.y, 46, r.h);
      // 墙壁主题装饰
      if (floor === 1) {
        // 外层：发光蘑菇
        for (let i = 0; i < 6; i++) {
          const side = i % 4;
          let mx, my;
          if (side === 0) { mx = r.x - 30; my = r.y + ((i * 180 + 60) % r.h); }
          else if (side === 1) { mx = r.x + r.w + 30; my = r.y + ((i * 180 + 60) % r.h); }
          else if (side === 2) { mx = r.x + ((i * 250 + 80) % r.w); my = r.y - 30; }
          else { mx = r.x + ((i * 250 + 80) % r.w); my = r.y + r.h + 30; }
          const glow = 0.35 + 0.2 * Math.sin(t * 2.5 + i);
          ctx.globalAlpha = glow;
          ctx.fillStyle = i % 2 === 0 ? '#4ade80' : '#60a5fa';
          ctx.beginPath(); ctx.arc(mx, my, 5, 0, G.TAU); ctx.fill();
          ctx.globalAlpha = glow * 0.3;
          ctx.beginPath(); ctx.arc(mx, my, 14, 0, G.TAU); ctx.fill();
          ctx.fillStyle = '#d9f99d';
          ctx.fillRect(mx - 2, my - 6, 4, 7);
          ctx.fillStyle = i % 2 === 0 ? '#4ade80' : '#60a5fa';
          ctx.beginPath(); ctx.arc(mx, my - 8, 4, 0, Math.PI); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (floor === 2) {
        // 中层：天花板冰锥
        ctx.fillStyle = 'rgba(147,197,253,0.25)';
        for (let i = 0; i < 8; i++) {
          const ix = r.x + ((i * 160 + 40) % r.w);
          const h = G.rand(20, 45);
          ctx.beginPath();
          ctx.moveTo(ix - 6, r.y - 46);
          ctx.lineTo(ix, r.y - 46 - h);
          ctx.lineTo(ix + 6, r.y - 46);
          ctx.closePath(); ctx.fill();
        }
        // 墙壁蓝光反射
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#93c5fd';
        ctx.fillRect(r.x - 46, r.y, 46, r.h);
        ctx.fillRect(r.x + r.w, r.y, 46, r.h);
        ctx.globalAlpha = 1;
      } else if (floor === 3) {
        // 核心：恶魔浮雕
        ctx.fillStyle = 'rgba(239,68,68,0.12)';
        for (let i = 0; i < 4; i++) {
          const side = i % 2;
          let dx, dy;
          if (side === 0) { dx = r.x - 22; dy = r.y + ((i * 300 + 120) % r.h); }
          else { dx = r.x + r.w + 22; dy = r.y + ((i * 300 + 120) % r.h); }
          // 简单的恶魔脸
          ctx.beginPath(); ctx.arc(dx, dy, 14, 0, G.TAU); ctx.fill();
          ctx.fillStyle = 'rgba(239,68,68,0.2)';
          ctx.beginPath(); ctx.arc(dx - 5, dy - 3, 3, 0, G.TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(dx + 5, dy - 3, 3, 0, G.TAU); ctx.fill();
          // 角
          ctx.beginPath();
          ctx.moveTo(dx - 10, dy - 10);
          ctx.lineTo(dx - 6, dy - 4);
          ctx.lineTo(dx - 2, dy - 10);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(dx + 2, dy - 10);
          ctx.lineTo(dx + 6, dy - 4);
          ctx.lineTo(dx + 10, dy - 10);
          ctx.fill();
          ctx.fillStyle = 'rgba(239,68,68,0.12)';
        }
        ctx.globalAlpha = 1;
      }
      this.drawDoors(game);

      for (const ob of r.obstacles) {
        if (ob.dead) continue;
        ctx.fillStyle = '#6b4a2f';
        G.roundRect(ctx, ob.x - 18, ob.y - 18, 36, 36, 4); ctx.fill();
        ctx.strokeStyle = '#8a6138';
        ctx.lineWidth = 2;
        G.roundRect(ctx, ob.x - 18, ob.y - 18, 36, 36, 4); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(ob.x - 18, ob.y - 18, 36, 17);
        if (ob.hp < 18) G.drawBar(ctx, ob.x - 14, ob.y - 26, 28, 4, ob.hp / 18, '#ef4444');
      }

      for (const pk of r.pickups) if (!pk.dead) this.drawPickup(ctx, pk);
      for (const c of r.chests) this.drawChest(ctx, c, game);

      if (r.shop) this.drawShopNpc(ctx, r.shop, game);

      if (r.portal) {
        const t2 = G.time;
        for (let i = 0; i < 3; i++) {
          const a = t2 * 3 + i * G.TAU / 3;
          ctx.fillStyle = 'rgba(167,139,250,0.85)';
          ctx.beginPath(); ctx.arc(r.portal.x + Math.cos(a) * 26, r.portal.y + Math.sin(a) * 26, 6, 0, G.TAU); ctx.fill();
        }
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(r.portal.x, r.portal.y, 32, 0, G.TAU); ctx.stroke();
      }

      if (r.revive) {
        ctx.globalAlpha = r.revive.used ? 0.35 : 0.65 + 0.3 * Math.sin(G.time * 3);
        ctx.fillStyle = '#134e4a';
        ctx.beginPath(); ctx.arc(r.revive.x, r.revive.y, 24, 0, G.TAU); ctx.fill();
        ctx.strokeStyle = '#2dd4bf';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(r.revive.x, r.revive.y, 24, 0, G.TAU); ctx.stroke();
        ctx.fillStyle = '#5eead4';
        ctx.beginPath(); ctx.arc(r.revive.x, r.revive.y, 9, 0, G.TAU); ctx.fill();
        G.text(ctx, '✚', r.revive.x, r.revive.y, 15, '#ffffff', 'center', true);
        if (!r.revive.used) G.text(ctx, '复活泉水', r.revive.x, r.revive.y - 36, 12, '#5eead4', 'center', true);
        ctx.globalAlpha = 1;
      }

      if (r.waveState === 'telegraph' && r.waveSpawns && r.waveSpawns.length) {
        for (const s of r.waveSpawns) {
          const pulse = 0.5 + 0.5 * Math.abs(Math.sin(G.time * 6));
          ctx.globalAlpha = 0.35 + 0.5 * pulse;
          ctx.strokeStyle = '#ffd54f';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(s.x, s.y, 16 + pulse * 5, 0, G.TAU); ctx.stroke();
          ctx.fillStyle = 'rgba(255,213,79,0.28)';
          ctx.beginPath(); ctx.arc(s.x, s.y, 12, 0, G.TAU); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      // 环境粒子
      G.FX.drawAmbient(ctx);

      for (const e of game.enemies) if (!e.pending && !(e.spawnIn > 0)) this.drawEnemy(ctx, e, game);
      // 火径绘制
      if (game.fireTrails && game.fireTrails.length > 0) {
        for (const ft of game.fireTrails) {
          ctx.fillStyle = 'rgba(249,115,22,0.35)';
          ctx.beginPath(); ctx.arc(ft.x, ft.y, ft.r, 0, G.TAU); ctx.fill();
          ctx.fillStyle = 'rgba(251,191,36,0.2)';
          ctx.beginPath(); ctx.arc(ft.x, ft.y, ft.r * 0.6, 0, G.TAU); ctx.fill();
        }
      }
      for (const a of game.allies) this.drawAlly(ctx, a);
      const plist = (game.players && game.players.length) ? game.players : [game.player];
      for (const pl of plist) if (!pl.dead || game.playerDeadT < 1) this.drawPlayer(ctx, pl);
      this.drawExitArrow(game);

      for (const b of game.bullets) {
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, G.TAU); ctx.fill();
      }
      G.FX.draw(ctx);
    },

    drawDoors(game) {
      const ctx = G.ctx, r = game.room, d = game.dungeon;
      const dw = 130;
      const sides = ['up', 'down', 'left', 'right'];
      for (const side of sides) {
        const dr = r.doors[side];
        if (!dr) continue;
        const toRoom = d.roomOf[dr.to];
        const open = r.cleared && (toRoom.type !== 'boss' || d.bossUnlocked);
        let corridor = null, lockX, lockY, lockW, lockH;
        if (side === 'up') {
          const gap = Math.max(60, r.y - (toRoom.y + toRoom.h));
          corridor = { x: dr.dx - dw / 2, y: r.y - gap, w: dw, h: gap };
          lockX = dr.dx - dw / 2; lockY = r.y - Math.min(gap, 100); lockW = dw; lockH = Math.min(gap, 100);
        } else if (side === 'down') {
          const gap = Math.max(60, toRoom.y - (r.y + r.h));
          corridor = { x: dr.dx - dw / 2, y: r.y + r.h, w: dw, h: gap };
          lockX = dr.dx - dw / 2; lockY = r.y + r.h; lockW = dw; lockH = Math.min(gap, 100);
        } else if (side === 'left') {
          const gap = Math.max(60, r.x - (toRoom.x + toRoom.w));
          corridor = { x: r.x - gap, y: dr.dy - dw / 2, w: gap, h: dw };
          lockX = r.x - Math.min(gap, 100); lockY = dr.dy - dw / 2; lockW = Math.min(gap, 100); lockH = dw;
        } else {
          const gap = Math.max(60, toRoom.x - (r.x + r.w));
          corridor = { x: r.x + r.w, y: dr.dy - dw / 2, w: gap, h: dw };
          lockX = r.x + r.w; lockY = dr.dy - dw / 2; lockW = Math.min(gap, 100); lockH = dw;
        }

        if (open) {
          ctx.fillStyle = '#121a28';
          ctx.fillRect(corridor.x, corridor.y, corridor.w, corridor.h);
          const glow = toRoom.type === 'boss' ? '#4ade80' : '#38bdf8';
          ctx.strokeStyle = glow;
          ctx.lineWidth = 3;
          ctx.strokeRect(corridor.x + 2, corridor.y + 2, corridor.w - 4, corridor.h - 4);
          ctx.globalAlpha = 0.35 + 0.25 * Math.sin(G.time * 4);
          ctx.fillStyle = glow;
          ctx.fillRect(corridor.x, corridor.y, corridor.w, corridor.h);
          ctx.globalAlpha = 0.7 + 0.3 * Math.sin(G.time * 4);
          const arrow = side === 'right' ? '▶' : side === 'left' ? '◀' : side === 'up' ? '▲' : '▼';
          G.text(ctx, arrow, corridor.x + corridor.w / 2, corridor.y + corridor.h / 2, 26, glow, 'center', true);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = toRoom.type === 'boss' ? '#7f1d1d' : '#2c3a52';
          ctx.fillRect(lockX, lockY, lockW, lockH);
          G.text(ctx, '🔒', lockX + lockW / 2, lockY + lockH / 2, 15, toRoom.type === 'boss' ? '#f87171' : '#94a3b8', 'center');
        }
      }
    },


    drawExitArrow(game) {
      const ctx = G.ctx, r = game.room, p = game.player;
      if (!r.cleared || p.dead) return;
      let tx = null, ty = null;
      if (r.portal) {
        tx = r.portal.x; ty = r.portal.y;
      } else {
        const d = game.dungeon;
        const cxm = r.x + r.w / 2, cym = r.y + r.h / 2;
        const isTarget = (room) => {
          if (room.cleared) return false;
          if (room.type === 'monster' || room.type === 'elite' || room.type === 'start') return true;
          return room.type === 'boss' && d.bossUnlocked;
        };
        const prev = {};
        const queue = [r.id];
        const seen = new Set([r.id]);
        let target = null;
        while (queue.length && !target) {
          const cur = queue.shift();
          const room = d.roomOf[cur];
          for (const dir of ['up', 'down', 'left', 'right']) {
            const door = room.doors[dir];
            if (!door) continue;
            const nb = d.roomOf[door.to];
            if (nb.type === 'boss' && !d.bossUnlocked) continue; // BOSS 门未解锁不可通过
            if (seen.has(nb.id)) continue;
            seen.add(nb.id);
            prev[nb.id] = { from: cur, dir: dir };
            if (isTarget(nb)) { target = nb; break; }
            if (nb.cleared) queue.push(nb.id); // 只能穿过已清空的房间
          }
        }
        if (!target || !prev[target.id]) return;
        let step = target;
        while (prev[step.id].from !== r.id) step = d.roomOf[prev[step.id].from];
        const dirToTarget = prev[step.id].dir;
        if (dirToTarget === 'up') { tx = (r.doors.up && r.doors.up.dx != null) ? r.doors.up.dx : cxm; ty = r.y - 55; }
        else if (dirToTarget === 'down') { tx = (r.doors.down && r.doors.down.dx != null) ? r.doors.down.dx : cxm; ty = r.y + r.h + 55; }
        else if (dirToTarget === 'left') { tx = r.x - 55; ty = (r.doors.left && r.doors.left.dy != null) ? r.doors.left.dy : cym; }
        else { tx = r.x + r.w + 55; ty = (r.doors.right && r.doors.right.dy != null) ? r.doors.right.dy : cym; }
      }
      const a = Math.atan2(ty - p.y, tx - p.x);
      const bob = Math.sin(G.time * 5) * 3;
      const ax = p.x + Math.cos(a) * 48, ay = p.y - 34 + bob;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(G.time * 6);
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      G.text(ctx, '出口', ax, ay - 14, 11, '#ffd54f', 'center', true);
    },
    drawPickup(ctx, pk) {
      const bob = Math.sin(pk.t * 4) * 3;
      const x = pk.x, y = pk.y + bob;
      if (pk.type === 'coin') {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x, y, 7, 0, G.TAU); ctx.fill();
        ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, G.TAU); ctx.stroke();
        ctx.fillStyle = '#fde68a';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, G.TAU); ctx.fill();
      } else if (pk.type === 'hp') {
        ctx.fillStyle = '#ef4444';
        G.roundRect(ctx, x - 8, y - 6, 16, 12, 3); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 2, y - 4, 4, 8);
        ctx.fillRect(x - 4, y - 2, 8, 4);
      } else if (pk.type === 'energy') {
        // 蓝色能量球
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath(); ctx.arc(x, y, 7, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(125,211,252,0.5)';
        ctx.beginPath(); ctx.arc(x, y - 1, 3, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y - 2, 1.5, 0, G.TAU); ctx.fill();
      } else if (pk.type === 'weapon') {
        const w = G.WEAPONS[pk.weaponId];
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        G.roundRect(ctx, x - 17, y - 17, 34, 34, 6); ctx.fill();
        ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2;
        G.roundRect(ctx, x - 17, y - 17, 34, 34, 6); ctx.stroke();
        G.text(ctx, w.emoji, x, y, 22, '#fff', 'center');
      }
    },

    drawChest(ctx, c, game) {
      if (c.opened) {
        ctx.fillStyle = '#4a3728';
        G.roundRect(ctx, c.x - 16, c.y - 10, 32, 20, 4); ctx.fill();
        return;
      }
      const near = G.dist(game.player.x, game.player.y, c.x, c.y) < 70;
      ctx.fillStyle = near ? '#8a6138' : '#6b4a2f';
      G.roundRect(ctx, c.x - 18, c.y - 14, 36, 28, 5); ctx.fill();
      ctx.fillStyle = '#3f2d1e';
      G.roundRect(ctx, c.x - 18, c.y - 2, 36, 6, 2); ctx.fill();
      ctx.strokeStyle = near ? '#ffd54f' : '#fbbf24';
      ctx.lineWidth = 2;
      G.roundRect(ctx, c.x - 18, c.y - 14, 36, 28, 5); ctx.stroke();
    },

    drawShopNpc(ctx, shop, game) {
      const near = G.dist(game.player.x, game.player.y, shop.x, shop.y) < 100;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(shop.x, shop.y + 22, 16, 6, 0, 0, G.TAU); ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.arc(shop.x, shop.y, 16, 0, G.TAU); ctx.fill();
      ctx.fillStyle = '#92400e';
      ctx.beginPath(); ctx.moveTo(shop.x - 18, shop.y - 4); ctx.lineTo(shop.x, shop.y - 34); ctx.lineTo(shop.x + 18, shop.y - 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(shop.x - 5, shop.y - 1, 3, 0, G.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(shop.x + 5, shop.y - 1, 3, 0, G.TAU); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(shop.x - 5, shop.y - 1, 1.5, 0, G.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(shop.x + 5, shop.y - 1, 1.5, 0, G.TAU); ctx.fill();
      G.text(ctx, '商人', shop.x, shop.y - 44, 13, '#fbbf24', 'center', true);
      if (near) G.text(ctx, 'E 交易', shop.x, shop.y + 38, 13, '#7fd4ff', 'center');
    },

    drawEnemy(ctx, e, game) {
      ctx.save();
      const bob = e.type === 'slime' ? Math.sin(G.time * 6 + e.id) * 3 : 0;
      const x = e.x, y = e.y + bob;
      // 蚀根植体：伪装态半透明，攻击态显形
      if (e.type === 'plant') {
        const target = G.nearestPlayer(game, x, y);
        const d = target ? G.dist(x, y, target.x, target.y) : 999;
        if (d >= e.detectRange) {
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#14532d';
          ctx.beginPath(); ctx.arc(x, y, 8, 0, G.TAU); ctx.fill();
          ctx.fillStyle = '#22c55e';
          ctx.beginPath(); ctx.arc(x, y, 5, 0, G.TAU); ctx.fill();
          ctx.restore();
          return;
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x, y + e.r * 0.8, e.r * 0.8, e.r * 0.3, 0, 0, G.TAU); ctx.fill();
      ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : e.color;
      // 孢囊自爆体：蘑菇形状
      if (e.type === 'mushroom') {
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#d8b4fe';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#c084fc';
        ctx.beginPath(); ctx.arc(x, y - 4, e.r * 0.85, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#f5f3ff';
        ctx.beginPath(); ctx.arc(x - 4, y - 5, 3, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 4, y - 5, 3, 0, G.TAU); ctx.fill();
      } else if (e.type === 'goblin') {
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#65a30d';
        ctx.beginPath(); ctx.moveTo(x - 8, y - 8); ctx.lineTo(x - 14, y - 18); ctx.lineTo(x - 2, y - 8); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 8, y - 8); ctx.lineTo(x + 14, y - 18); ctx.lineTo(x + 2, y - 8); ctx.fill();
      } else if (e.type === 'plant') {
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#166534';
        ctx.fillRect(x - 3, y + e.r - 4, 6, 8);
        ctx.fillStyle = '#f87171';
        ctx.beginPath(); ctx.arc(x - 5, y + 2, 3, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 5, y + 2, 3, 0, G.TAU); ctx.fill();
      } else if (e.type === 'beetle') {
        ctx.beginPath(); ctx.ellipse(x, y, e.r * 1.2, e.r * 0.7, 0, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.beginPath(); ctx.arc(x, y - e.r * 0.5, e.r * 0.5, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x - 3, y - e.r * 0.5 - 1, 2, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 3, y - e.r * 0.5 - 1, 2, 0, G.TAU); ctx.fill();
        if (e.state === 'stun') {
          ctx.fillStyle = '#fbbf24';
          G.text(ctx, '★', x, y - e.r - 12, 14, '#fbbf24', 'center');
        }
      } else if (e.type === 'ice_beast') {
        // 凝霜蚀兽：冰晶外形 + 减速光环
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#67e8f9';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(103,232,249,0.15)';
        ctx.beginPath(); ctx.arc(x, y, 120, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#f0f9ff';
        for (let i = 0; i < 5; i++) {
          const ang = G.time * 0.5 + i * G.TAU / 5;
          const rx = x + Math.cos(ang) * e.r * 0.5;
          const ry = y + Math.sin(ang) * e.r * 0.5;
          ctx.beginPath(); ctx.arc(rx, ry, 2.5, 0, G.TAU); ctx.fill();
        }
      } else if (e.type === 'snowman') {
        // 寒冻投核者：雪人形状
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#e0f2fe';
        ctx.beginPath(); ctx.arc(x, y - 3, e.r * 0.7, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y + 5, e.r * 0.9, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x - 3, y - 16); ctx.lineTo(x + 3, y - 16); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(x - 3, y - 5, 1.5, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 3, y - 5, 1.5, 0, G.TAU); ctx.fill();
      } else if (e.type === 'caveman') {
        // 蛮荒冲撞者：粗壮野人 + 冲锋效果
        ctx.fillStyle = e.state === 'charge' ? '#f87171' : (e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#d4a574');
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(x - 6, y - e.r - 6, 12, 8);
        if (e.state === 'windup') {
          ctx.fillStyle = '#fbbf24';
          G.text(ctx, '!', x, y - e.r - 14, 14, '#fbbf24', 'center');
        }
      } else if (e.type === 'bat_swarm' || e.type === 'mini_bat') {
        // 虚翼蝠群：三只小虚翼蝠聚在一起
        const isMini = e.type === 'mini_bat';
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : (isMini ? '#c4b5fd' : '#a78bfa');
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        // 翅膀
        ctx.fillStyle = isMini ? '#a78bfa' : '#8b5cf6';
        ctx.beginPath(); ctx.moveTo(x - e.r, y - 3); ctx.lineTo(x - e.r - 8, y - 8); ctx.lineTo(x - e.r, y - 6); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + e.r, y - 3); ctx.lineTo(x + e.r + 8, y - 8); ctx.lineTo(x + e.r, y - 6); ctx.fill();
      } else if (e.type === 'shadow') {
        // 影刃蚀刺：暗紫色 + 烟雾效果
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#4c1d95';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(76,29,149,0.3)';
        ctx.beginPath(); ctx.arc(x, y, e.r + 6, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x - 3, y - 2, 2, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 3, y - 2, 2, 0, G.TAU); ctx.fill();
      } else if (e.type === 'ghost_mage') {
        // 残虚术者：半透明 + 法杖
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#c4b5fd';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#8b5cf6';
        ctx.fillRect(x + 8, y - 6, 3, 14);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x + 9, y - 8, 3, 0, G.TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (e.type === 'armor_knight') {
        // 重甲型蚀铁卫：盾牌+盔甲
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#94a3b8';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.fillRect(x - 2, y - e.r - 2, e.r * 0.6, e.r * 1.4);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x - 2, y - e.r - 4, e.r * 0.3, 0, G.TAU); ctx.fill();
        // 正面盾牌标记
        ctx.fillStyle = 'rgba(148,163,184,0.2)';
        ctx.beginPath(); ctx.arc(x + e.r * 0.5, y, e.r * 0.5, -Math.PI / 3, Math.PI / 3); ctx.fill();
      } else if (e.type === 'crossbowman') {
        // 蓄力晶弩手：弩箭形状
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#f59e0b';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(x + 8, y - 4, 14, 4);
        ctx.fillRect(x + 18, y - 5, 2, 6);
        if (e.state === 'charging') {
          ctx.fillStyle = '#fbbf24';
          const chargePct = 1 - (e.stateT / e.chargeTime);
          ctx.beginPath(); ctx.arc(x - 3, y - e.r - 6, 4 + chargePct * 4, 0, G.TAU); ctx.fill();
        }
      } else if (e.type === 'necromancer') {
        // 亡纹招魂师：紫色法袍+骷髅法杖
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#6b21a8';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#4c1d95';
        ctx.fillRect(x - 3, y - e.r - 8, 6, 12);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y - e.r - 10, 3, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(x - 1, y - e.r - 10, 1, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 1, y - e.r - 10, 1, 0, G.TAU); ctx.fill();
      } else if (e.type === 'bomber') {
        // 低血自爆兵：红色+引线
        ctx.fillStyle = e.hp < e.maxHp * 0.3 ? '#fca5a5' : (e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#ef4444');
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(x - 2, y - e.r - 8, 4, 9);
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.arc(x, y - e.r - 10, 3, 0, G.TAU); ctx.fill();
        if (e.hp < e.maxHp * 0.3) {
          ctx.fillStyle = '#ef4444';
          G.text(ctx, '!!', x, y - e.r - 16, 14, '#ef4444', 'center');
        }
      } else if (e.type === 'golem') {
        // 重蚀岩甲像：大型石巨人
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#78716c';
        ctx.fillRect(x - e.r * 0.8, y - e.r * 0.9, e.r * 1.6, e.r * 1.8);
        ctx.fillStyle = '#57534e';
        ctx.beginPath(); ctx.arc(x, y - e.r * 0.5, e.r * 0.5, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x - 4, y - e.r * 0.5 - 2, 3, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 4, y - e.r * 0.5 - 2, 3, 0, G.TAU); ctx.fill();
      } else if (e.type === 'dark_priest') {
        // 蚀纹祭司：紫袍+治疗光环
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#7c3aed';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x, y - e.r - 6, 5, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(124,58,237,0.1)';
        ctx.beginPath(); ctx.arc(x, y, 200, 0, G.TAU); ctx.fill();
      } else if (e.type === 'hellhound') {
        // 燃迹猎犬：火焰兽
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#f97316';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.moveTo(x - 6, y - 8); ctx.lineTo(x - 14, y - 18); ctx.lineTo(x - 2, y - 8); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 6, y - 8); ctx.lineTo(x + 14, y - 18); ctx.lineTo(x + 2, y - 8); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x - 4, y - 3, 2, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 4, y - 3, 2, 0, G.TAU); ctx.fill();
      } else if (e.type === 'bomb_spider') {
        // 触炸蛛体：红色小蜘蛛
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#dc2626';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#991b1b';
        ctx.beginPath(); ctx.arc(x, y - 3, e.r * 0.5, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x - 2, y - 4, 1.5, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 2, y - 4, 1.5, 0, G.TAU); ctx.fill();
        for (let i = 0; i < 4; i++) {
          const ang = i * G.TAU / 4;
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(x + Math.cos(ang) * e.r + 2, y + Math.sin(ang) * e.r + 2, 6, 2);
        }
      } else if (e.type === 'spearman') {
        // 精锐刺锋卫：金色长枪
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#fbbf24';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#d97706';
        ctx.fillRect(x + 8, y - 2, 22, 4);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.moveTo(x + 30, y - 3); ctx.lineTo(x + 38, y); ctx.lineTo(x + 30, y + 3); ctx.closePath(); ctx.fill();
      } else if (e.type === 'boss_guard') {
        // 蚀域守卫：暗色+光环
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#475569';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x - 4, y - e.r - 4, 8, 6);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x, y - e.r - 6, 4, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(71,85,105,0.15)';
        ctx.beginPath(); ctx.arc(x, y, 200, 0, G.TAU); ctx.fill();
      } else if (e.type === 'slime') {
        // 蚀浆怪：果冻状椭圆 + 高光
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#4ecb71';
        ctx.beginPath(); ctx.ellipse(x, y + 2, e.r * 1.05, e.r * 0.72, 0, 0, G.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(x - e.r * 0.25, y - e.r * 0.25, e.r * 0.3, e.r * 0.18, -0.4, 0, G.TAU); ctx.fill();
      } else if (e.type === 'bat') {
        // 虚翼蝠：圆身 + 三角翼 + 尖耳
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#e879f9';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#c084fc';
        ctx.beginPath(); ctx.moveTo(x - e.r * 0.5, y - 2); ctx.lineTo(x - e.r * 1.5, y - 10); ctx.lineTo(x - e.r * 0.5, y + 3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + e.r * 0.5, y - 2); ctx.lineTo(x + e.r * 1.5, y - 10); ctx.lineTo(x + e.r * 0.5, y + 3); ctx.fill();
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#d8b4fe';
        ctx.beginPath(); ctx.moveTo(x - 3, y - e.r * 0.5); ctx.lineTo(x - 5, y - e.r * 1.3); ctx.lineTo(x, y - e.r * 0.7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 3, y - e.r * 0.5); ctx.lineTo(x + 5, y - e.r * 1.3); ctx.lineTo(x, y - e.r * 0.7); ctx.fill();
      } else if (e.type === 'shooter') {
        // 蚀射虫：头盔 + 枪管
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#fb923c';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.beginPath(); ctx.arc(x, y - e.r * 0.3, e.r * 0.7, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#475569';
        ctx.fillRect(x + e.r * 0.4, y - 2, e.r * 1.2, 5);
        ctx.fillRect(x + e.r * 1.4, y - 3, e.r * 0.4, 7);
      } else if (e.type === 'turret') {
        // 蚀晶炮台：方底座 + 炮管
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#94a3b8';
        ctx.fillRect(x - e.r * 0.8, y - e.r * 0.3, e.r * 1.6, e.r * 0.6);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(x + e.r * 0.2, y - e.r * 0.55, e.r * 1.4, e.r * 0.35);
        ctx.fillStyle = '#475569';
        ctx.fillRect(x - e.r * 0.6, y + e.r * 0.2, e.r * 1.2, e.r * 0.3);
      } else if (e.type === 'brute') {
        // 厚甲蚀卫：大圆 + 红色尖刺肩甲 + 头盔
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#ef4444';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#b91c1c';
        ctx.beginPath(); ctx.moveTo(x - e.r * 0.85, y - e.r * 0.2); ctx.lineTo(x - e.r * 1.5, y - e.r * 0.9); ctx.lineTo(x - e.r * 0.45, y - e.r * 0.5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + e.r * 0.85, y - e.r * 0.2); ctx.lineTo(x + e.r * 1.5, y - e.r * 0.9); ctx.lineTo(x + e.r * 0.45, y - e.r * 0.5); ctx.fill();
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath(); ctx.arc(x, y - e.r * 0.3, e.r * 0.75, Math.PI, 0); ctx.fill();
      } else if (e.type === 'skeleton') {
        // 骨弩手：骷髅脸 + 弓
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#d4d4d8';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(x - e.r * 0.3, y - e.r * 0.15, e.r * 0.22, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + e.r * 0.3, y - e.r * 0.15, e.r * 0.22, 0, G.TAU); ctx.fill();
        ctx.fillRect(x - e.r * 0.15, y + e.r * 0.1, e.r * 0.3, e.r * 0.15);
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x + e.r * 0.8, y, e.r * 0.55, -Math.PI * 0.55, Math.PI * 0.55); ctx.stroke();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + e.r * 0.15, y); ctx.lineTo(x + e.r * 1.25, y); ctx.stroke();
      } else if (e.type === 'mage') {
        // 蚀纹法师：尖帽 + 法杖
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#c084fc';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#7c3aed';
        ctx.beginPath(); ctx.moveTo(x - e.r * 0.6, y - e.r * 0.4); ctx.lineTo(x, y - e.r * 1.7); ctx.lineTo(x + e.r * 0.6, y - e.r * 0.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(x + e.r * 0.5, y - e.r * 0.5, 3, e.r * 1.1);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x + e.r * 0.5 + 1.5, y - e.r * 0.5, e.r * 0.3, 0, G.TAU); ctx.fill();
      } else if (e.type === 'ghost') {
        // 残虚影：圆顶 + 波浪底
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : 'rgba(148,163,184,0.8)';
        ctx.beginPath(); ctx.arc(x, y - e.r * 0.2, e.r, Math.PI, 0); ctx.fill();
        ctx.fillRect(x - e.r, y - e.r * 0.2, e.r * 2, e.r * 0.5);
        ctx.beginPath();
        ctx.moveTo(x - e.r, y - e.r * 0.2);
        ctx.lineTo(x - e.r, y + e.r * 0.5);
        for (var wi = 0; wi < 4; wi++) {
          var wx = x - e.r + (wi * 2 + 1) * e.r * 0.5;
          ctx.quadraticCurveTo(wx, y + e.r * 0.1, wx + e.r * 0.25, y + e.r * 0.5);
        }
        ctx.lineTo(x + e.r, y - e.r * 0.2);
        ctx.fill();
      } else if (e.type === 'raider') {
        // 劫掠蚀徒：戴面具 + 持斧
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#f97316';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#7c2d12';
        ctx.beginPath(); ctx.arc(x, y - e.r * 0.2, e.r * 0.7, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x - 3, y - e.r * 0.3, 2, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 3, y - e.r * 0.3, 2, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(x + e.r * 0.5, y - e.r * 0.3, 3, e.r * 1.3);
        ctx.fillStyle = '#f87171';
        ctx.beginPath(); ctx.moveTo(x + e.r * 0.5 + 1, y - e.r * 0.7); ctx.lineTo(x + e.r * 0.5 + 7, y - e.r * 0.3); ctx.lineTo(x + e.r * 0.5 - 3, y - e.r * 0.3); ctx.closePath(); ctx.fill();
      } else if (e.type === 'flyer') {
        // 高域突袭者：带翅膀，更小更轻
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#ef4444';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.moveTo(x - e.r * 0.5, y - 2); ctx.lineTo(x - e.r * 1.5, y - 10); ctx.lineTo(x - e.r * 0.5, y + 3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + e.r * 0.5, y - 2); ctx.lineTo(x + e.r * 1.5, y - 10); ctx.lineTo(x + e.r * 0.5, y + 3); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x - 3, y - 2, 2, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 3, y - 2, 2, 0, G.TAU); ctx.fill();
      } else if (e.type === 'summoner') {
        // 虚纹召唤者：紫色法袍 + 法杖 + 召唤光环
        ctx.fillStyle = e.slowT > 0 ? '#7dd3fc' : e.burnT > 0 ? '#fb923c' : '#7c3aed';
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
        ctx.fillStyle = '#5b21b6';
        ctx.beginPath(); ctx.moveTo(x - e.r * 0.5, y - e.r * 0.3); ctx.lineTo(x, y - e.r * 1.5); ctx.lineTo(x + e.r * 0.5, y - e.r * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(x + e.r * 0.5, y - e.r * 0.4, 3, e.r * 1.0);
        ctx.fillStyle = '#a78bfa';
        ctx.beginPath(); ctx.arc(x + e.r * 0.5 + 1.5, y - e.r * 0.4, e.r * 0.25, 0, G.TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(168,85,247,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(x, y, e.r + 8, 0, G.TAU); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, e.r, 0, G.TAU); ctx.stroke();
      if (e.elite) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(x - 10, y - e.r - 2);
        ctx.lineTo(x, y - e.r - 14);
        ctx.lineTo(x + 10, y - e.r - 2);
        ctx.closePath(); ctx.fill();
      }
      const target = G.nearestPlayer(game, x, y) || game.player;
      const a = Math.atan2(target.y - y, target.x - x);
      const ex = Math.cos(a) * e.r * 0.3, ey = Math.sin(a) * e.r * 0.3;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 4 + ex, y - 2 + ey, 3, 0, G.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 4 + ex, y - 2 + ey, 3, 0, G.TAU); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(x - 4 + ex * 1.3, y - 2 + ey * 1.3, 1.5, 0, G.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 4 + ex * 1.3, y - 2 + ey * 1.3, 1.5, 0, G.TAU); ctx.fill();
      if (e.boss) {
        G.text(ctx, e.name, x, y - e.r - 16, 15, '#f87171', 'center', true);
      } else if (e.hp < e.maxHp) {
        G.drawBar(ctx, x - e.r, y - e.r - 9, e.r * 2, 5, e.hp / e.maxHp, '#ef4444');
      }
      ctx.restore();
    },

    drawAlly(ctx, a) {
      ctx.fillStyle = '#fb923c';
      G.roundRect(ctx, a.x - 12, a.y - 12, 24, 24, 4); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(a.x - 5, a.y - 4, 4, 4);
      ctx.fillRect(a.x + 1, a.y - 4, 4, 4);
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 2;
      G.roundRect(ctx, a.x - 12, a.y - 12, 24, 24, 4); ctx.stroke();
    },

    drawPlayer(ctx, p) {
      if (p.name) G.text(ctx, p.name, p.x, p.y - 26, 10, '#e2e8f0', 'center');
      const flicker = p.invuln > 0 && Math.floor(G.time * 20) % 2 === 0;
      ctx.save();
      if (flicker) ctx.globalAlpha = 0.45;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 14, 14, 6, 0, 0, G.TAU); ctx.fill();
      if (p.dashT > 0) {
        ctx.fillStyle = 'rgba(125,211,252,0.5)';
        ctx.beginPath(); ctx.arc(p.x - p.dashDx * 22, p.y - p.dashDy * 22, p.r - 4, 0, G.TAU); ctx.fill();
      }
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, G.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, G.TAU); ctx.stroke();
      const ex = Math.cos(p.aimAngle) * 5, ey = Math.sin(p.aimAngle) * 5;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.x - 4 + ex, p.y - 3 + ey, 4, 0, G.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 4 + ex, p.y - 3 + ey, 4, 0, G.TAU); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(p.x - 4 + ex * 1.4, p.y - 3 + ey * 1.4, 2, 0, G.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 4 + ex * 1.4, p.y - 3 + ey * 1.4, 2, 0, G.TAU); ctx.fill();

      const w = p.weapon();
      if (w) {
        const a = p.aimAngle;
        const wx = p.x + Math.cos(a) * 18, wy = p.y + Math.sin(a) * 18;
        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(a);
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(w.emoji, 0, 0);
        ctx.restore();
        // 武器动态状态：
        // - 单人模式：w 是真实 Weapon 实例（有 swingT），弓的蓄力写在 p.drawBowCharge 上；
        // - 联机自机：用本地预测实例 _predW（即时手感，快照重建不丢状态）；
        // - 联机远程玩家：用服务端快照字段 wswing/wcharge/wdraw。
        const pw = p._predW;
        const swingT = (w && typeof w.swingT === 'number' && w.swingT > 0) ? w.swingT
          : (pw && pw.type === 'melee') ? pw.swingT
          : (p.wswing || 0);
        const bowCharge = (p.drawBowCharge > 0) ? p.drawBowCharge
          : (pw && pw.type === 'bow') ? pw.charge
          : (p.wdraw || 0);
        if (w.type === 'melee' && swingT > 0) {
          const prog = 1 - swingT / 0.28;
          const a0 = a - w.arc / 2 + prog * w.arc;
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(p.x, p.y, w.range, a0 - w.arc / 2, a0 + w.arc / 2); ctx.stroke();
        }
        if (w.type === 'bow' && bowCharge > 0) {
          ctx.strokeStyle = 'rgba(251,191,36,0.9)';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, 40 + bowCharge * 50, a - 0.3, a + 0.3); ctx.stroke();
        }
      }
      if (p.fireBuffT > 0) {
        ctx.fillStyle = 'rgba(255,213,79,0.4)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 7, 0, G.TAU); ctx.fill();
      }
      const pet = p.pet;
      ctx.fillStyle = '#f472b6';
      G.roundRect(ctx, pet.x - 8, pet.y - 8, 16, 16, 4); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(pet.x - 4, pet.y - 3, 3, 4);
      ctx.fillRect(pet.x + 1, pet.y - 3, 3, 4);
      ctx.fillStyle = '#111';
      ctx.fillRect(pet.x - 3, pet.y - 2, 1.5, 2);
      ctx.fillRect(pet.x + 2, pet.y - 2, 1.5, 2);
      ctx.restore();
    }
  };
})();

