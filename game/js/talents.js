(function () {
  const G = window.G;

  G.rollTalents = function (n) {
    return G.shuffle(G.TALENTS.slice()).slice(0, n);
  };
  G.applyTalent = function (player, t) { t.apply(player); };
})();
