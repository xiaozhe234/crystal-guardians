(function () {
  const G = window.G;
  const KEY = 'yqq_save_v1';
  const DEFAULT = { gems: 0, unlocked: ['warden'], wins: 0, runs: 0, kills: 0, bestFloor: 0, bestSiegeWave: 0, sound: true, music: true, autofire: false, masterVol: 0.7, sfxVol: 0.7, musicVol: 0.4 };

  G.saveLoad = function () {
    try {
      const raw = localStorage.getItem(KEY);
      G.save = raw ? Object.assign({}, DEFAULT, JSON.parse(raw)) : Object.assign({}, DEFAULT);
    } catch (e) {
      G.save = Object.assign({}, DEFAULT);
    }
    // 为方便测试：全部角色默认解锁可用
    G.save.unlocked = G.CHARACTERS.map(c => c.id);
  };
  G.saveWrite = function () {
    try { localStorage.setItem(KEY, JSON.stringify(G.save)); } catch (e) {}
  };
  G.addGems = function (n) { G.save.gems += n; G.saveWrite(); };
})();
