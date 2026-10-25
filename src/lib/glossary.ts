// Plain-language explainers (F11). Keep each to a sentence or two.

export const GLOSSARY = {
  streaming: {
    term: "Streaming",
    text: "Picking up a free agent just for the days his team plays, then swapping him out for someone else. More games played means more points.",
  },
  gamesPlayed: {
    term: "Games played",
    text: "How many games your players actually play this week. A player with 4 games usually scores more than a better player with 2.",
  },
  punting: {
    term: "Giving up a stat (punting)",
    text: "Not chasing a stat you're going to lose anyway, like turnovers with a team of big men. In a points league it means not worrying about it, because every stat adds to one total.",
  },
  close: {
    term: "Close",
    text: "You and your opponent are near each other in this stat, so a pickup could swing it.",
  },
  winning: {
    term: "Winning",
    text: "You're comfortably ahead in this stat for the week.",
  },
  concede: {
    term: "Give up",
    text: "You're far behind in this stat. Don't make moves just to fix it; focus on stats that are close.",
  },
  openSlot: {
    term: "Open slot",
    text: "A spot in your starting lineup with nobody who has a game that day. Those are free points you're leaving on the table, so it's a good day to stream.",
  },
  benched: {
    term: "Too many players",
    text: "More of your players have games than you have lineup spots, so someone with a game sits on your bench and his points don't count.",
  },
  fourFourFour: {
    term: "4-4-4",
    text: "Four games in each of the three fantasy playoff weeks. Players with schedules like 4-4-4 or 4-4-3 are gold in the playoffs.",
  },
  twoGameWeek: {
    term: "2-game week",
    text: "A week where a player's NBA team only plays twice. In the playoffs that can cost you, so it's worth trading for someone with more games.",
  },
  projected: {
    term: "Projected points",
    text: "Our best guess at how many fantasy points a player will score: his per-game stats (Basketball Monster this season, mixed with ESPN's projection early on) times his games, using your league's scoring.",
  },
  sources: {
    term: "BBM vs ESPN",
    text: "We mix each player's stats this season (from Basketball Monster) with ESPN's projection. A few games can be a fluke, so after 2 games we trust BBM 20%, and after 10 games we trust it 100%. ⚖️ marks a player the two disagree on, so think twice before a big move.",
  },
  ppg: {
    term: "Points per game",
    text: "Fantasy points a player is expected to score each time he plays, using your league's scoring.",
  },
  restOfSeason: {
    term: "Rest of season",
    text: "Every game from today through the last fantasy playoff week.",
  },
  waivers: {
    term: "Waivers",
    text: "A recently dropped player sits on waivers for a short time before anyone can add him. Teams put in claims, and the claim clears later.",
  },
  tradeDeadline: {
    term: "Trade deadline",
    text: "The last day your league allows trades. After it, the site switches to playoff mode.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
