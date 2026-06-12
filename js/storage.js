/* Saves progress in the browser so kids keep their unlocked levels & stars. */
const Storage = (function () {
  const KEY = "mtb_adventure_save_v1";

  const defaults = {
    unlocked: 1,        // highest level number that is playable
    stars: {},          // { levelId: 0..3 }
    muted: false
  };

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...defaults };
      return { ...defaults, ...JSON.parse(raw) };
    } catch (e) {
      return { ...defaults };
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  return {
    get unlocked() { return data.unlocked; },
    get muted() { return data.muted; },

    starsFor(levelId) { return data.stars[levelId] || 0; },

    isUnlocked(levelNum) { return levelNum <= data.unlocked; },

    setMuted(m) { data.muted = m; save(); },

    /* Record a finished level. Unlocks the next one and keeps the best star score. */
    completeLevel(levelNum, levelId, starsEarned) {
      const best = Math.max(data.stars[levelId] || 0, starsEarned);
      data.stars[levelId] = best;
      if (levelNum + 1 > data.unlocked) data.unlocked = levelNum + 1;
      save();
    },

    totalStars() {
      return Object.values(data.stars).reduce((a, b) => a + b, 0);
    }
  };
})();
