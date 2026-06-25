// The Office (US) season -> episode-count map, used by the season/episode picker.
// Counts are generous (segment counts, counting two-parters separately) so every
// real episode is selectable. If a season feels short, bump it here.
window.OFFICE = {
  seasons: {
    1: 6,
    2: 22,
    3: 25,
    4: 19,
    5: 28,
    6: 26,
    7: 26,
    8: 24,
    9: 25
  },
  seasonList() {
    return Object.keys(this.seasons).map(Number).sort((a, b) => a - b);
  },
  episodesIn(season) {
    return this.seasons[season] || 0;
  }
};
