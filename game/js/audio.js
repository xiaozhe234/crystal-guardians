(function () {
  const G = window.G;
  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;

  // BGM Audio 元素
  let bgmEls = {};
  let currentBGM = null;
  let bgmTheme = 0;

  function ac() {
    return ctx;
  }

  function ensureNodes() {
    if (!ctx) return false;
    if (!masterGain) {
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.connect(masterGain);
      // 音乐音量通过 media element 控制，不通过 Web Audio
      masterGain.gain.value = G.save.masterVol || 0.7;
      sfxGain.gain.value = G.save.sfxVol || 0.7;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slide) {
    const c = ac(); if (!c || !ensureNodes()) return;
    try {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(Math.max(30, freq), c.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.1, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(sfxGain);
      o.start(); o.stop(c.currentTime + dur + 0.03);
    } catch (e) {}
  }

  function noise(dur, vol, filterFreq) {
    const c = ac(); if (!c || !ensureNodes()) return;
    try {
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
      const g = c.createGain(); g.gain.value = vol || 0.1;
      src.connect(f); f.connect(g); g.connect(sfxGain);
      src.start();
    } catch (e) {}
  }

  function seq(list) {
    const c = ac(); if (!c || !ensureNodes()) return;
    let t = c.currentTime;
    for (const s of list) {
      try {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = s.type || 'square';
        o.frequency.setValueAtTime(s.f, t);
        g.gain.setValueAtTime(s.v || 0.08, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + s.d);
        o.connect(g); g.connect(sfxGain);
        o.start(t); o.stop(t + s.d + 0.02);
      } catch (e) {}
      t += s.d;
    }
  }

  // 初始化 BGM 音频元素
  function initBGMElements() {
    if (bgmEls[1]) return; // 已初始化
    const files = {
      1: 'resource/bgm/外层-晶簇边境.m4a',
      2: 'resource/bgm/中层-蚀影秘境.m4a',
      3: 'resource/bgm/核心-虚蚀核心.mp3'
    };
    for (const key in files) {
      try {
        const a = new Audio(files[key]);
        a.loop = true;
        a.preload = 'auto';
        a.volume = (G.save.musicVol || 0.4) * (G.save.masterVol || 0.7);
        bgmEls[key] = a;
      } catch (e) {}
    }
  }

  function stopBGM() {
    if (currentBGM) {
      try { currentBGM.pause(); currentBGM.currentTime = 0; } catch (e) {}
      currentBGM = null;
    }
    bgmTheme = 0;
  }

  const S = {
    shoot:   () => tone(760 + Math.random() * 300, 0.05, 'square', 0.045, -420),
    swing:   () => noise(0.08, 0.06, 2200),
    hit:     () => tone(220, 0.12, 'sawtooth', 0.06, -120),
    hurt:    () => { tone(160, 0.18, 'sawtooth', 0.09, -80); noise(0.1, 0.05, 900); },
    boom:    () => { tone(90, 0.35, 'sine', 0.14, -50); noise(0.3, 0.12, 500); },
    coin:    () => { tone(1200, 0.06, 'square', 0.05); tone(1600, 0.09, 'square', 0.05); },
    heal:    () => { tone(520, 0.1, 'sine', 0.07); tone(780, 0.14, 'sine', 0.07); },
    click:   () => tone(900, 0.04, 'square', 0.04),
    pickup:  () => { tone(660, 0.07, 'square', 0.05); tone(990, 0.1, 'square', 0.05); },
    dry:     () => tone(140, 0.08, 'square', 0.05),
    switch:  () => { tone(440, 0.05, 'square', 0.04); tone(660, 0.06, 'square', 0.04); },
    chest:   () => { tone(523, 0.1, 'triangle', 0.08); tone(659, 0.1, 'triangle', 0.08); tone(784, 0.16, 'triangle', 0.08); },
    skill:   () => tone(300, 0.16, 'sawtooth', 0.07, 300),
    eshoot:  () => tone(300, 0.08, 'sawtooth', 0.05, -120),
    block:   () => tone(700, 0.08, 'triangle', 0.06, -200),
    bossdie: () => { tone(200, 0.5, 'sawtooth', 0.1, -150); noise(0.4, 0.1, 400); },
    unlock:  () => { tone(523, 0.12, 'triangle', 0.08); tone(659, 0.12, 'triangle', 0.08); tone(784, 0.2, 'triangle', 0.08); },
    talent:  () => { tone(659, 0.1, 'triangle', 0.07); tone(880, 0.16, 'triangle', 0.07); },
    buy:     () => { tone(784, 0.08, 'square', 0.06); tone(1046, 0.14, 'square', 0.06); },
    level:   () => { tone(392, 0.12, 'triangle', 0.08); tone(523, 0.12, 'triangle', 0.08); tone(659, 0.2, 'triangle', 0.08); },
    alert:   () => { tone(660, 0.09, 'square', 0.06); tone(880, 0.14, 'square', 0.06); },
    spawn:   () => { tone(420, 0.07, 'triangle', 0.05); tone(560, 0.09, 'triangle', 0.05); },
    bow:     () => tone(500 + Math.random() * 100, 0.08, 'triangle', 0.06, 200),
    win:     () => seq([{ f: 523, d: 0.12 }, { f: 659, d: 0.12 }, { f: 784, d: 0.12 }, { f: 1046, d: 0.3, v: 0.1 }]),
    lose:    () => { tone(300, 0.3, 'sawtooth', 0.08, -150); tone(200, 0.5, 'sawtooth', 0.08, -100); }
  };

  G.audio = {
    enabled: true,
    musicEnabled: true,
    audioUnlocked: false,
    focus: null,
    play(name) {
      if (!G.audio.enabled) return;
      const f = S[name];
      if (f) f();
    },
    setEnabled(b) { G.audio.enabled = b; },
    setMusicEnabled(b) {
      G.audio.musicEnabled = b;
      if (!b) { stopBGM(); }
      else if (bgmTheme > 0) { G.audio.startBGM(bgmTheme); }
    },
    setMasterVolume(v) {
      G.save.masterVol = v;
      if (masterGain) masterGain.gain.value = v;
      G.audio._updateBGMVolume();
    },
    setSfxVolume(v) {
      G.save.sfxVol = v;
      if (sfxGain) sfxGain.gain.value = v;
    },
    setMusicVolume(v) {
      G.save.musicVol = v;
      G.audio._updateBGMVolume();
    },
    _updateBGMVolume() {
      const vol = (G.save.musicVol || 0.4) * (G.save.masterVol || 0.7);
      for (const key in bgmEls) {
        try { bgmEls[key].volume = vol; } catch (e) {}
      }
    },
    startBGM(theme) {
      initBGMElements();
      if (!G.audio.musicEnabled || !G.audio.audioUnlocked) return;
      stopBGM();
      bgmTheme = theme;
      const el = bgmEls[theme];
      if (el) {
        try {
          el.volume = (G.save.musicVol || 0.4) * (G.save.masterVol || 0.7);
          el.currentTime = 0;
          el.play().catch(function () {});
          currentBGM = el;
        } catch (e) {}
      }
    },
    stopBGM,
    // 必须直接在用户触摸/点击回调内调用，不能包在 setTimeout/Promise 里
    unlock() {
      if (G.audio.audioUnlocked) return;
      try {
        if (!ctx) {
          ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(function () {});
        }
        ensureNodes();
        initBGMElements();
        // 预加载并"激活"每个 BGM 音频元素（移动端必须在用户手势中首次 play）
        for (const key in bgmEls) {
          const a = bgmEls[key];
          try {
            a.volume = 0.001;
            var p = a.play();
            if (p && p.then) {
              p.then(function () {
                a.pause();
                a.currentTime = 0;
                a.volume = (G.save.musicVol || 0.4) * (G.save.masterVol || 0.7);
              }).catch(function () {});
            } else {
              a.pause();
              a.currentTime = 0;
              a.volume = (G.save.musicVol || 0.4) * (G.save.masterVol || 0.7);
            }
          } catch (e) {}
        }
        G.audio.audioUnlocked = true;
      } catch (e) {}
    }
  };

  })();