/**
 * Bilingual (EN / 繁體中文) support. Two dictionaries:
 *
 * - UI: interface strings keyed by stable ids, with `{param}` placeholders —
 *   rendered via t(key, params).
 * - ZH_CONTENT: content names/sentences keyed by their canonical ENGLISH text
 *   (level names, stories, enemy/character/skill names...) — rendered
 *   via tr(english). The data files stay English-only; ids, save formats and
 *   the emoji lookups (enemyArt/characterArt key on English) are unaffected.
 *
 * The current language persists in localStorage and defaults to Chinese for
 * zh-* browsers. Pure module — safe to unit test in node (no storage there
 * simply means the default is used).
 */

export type Lang = 'en' | 'zh';

const STORAGE_KEY = 'match3-lang';

let current: Lang | null = null;

function detectDefault(): Lang {
  try {
    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')) {
      return 'zh';
    }
  } catch {
    // fall through to English
  }
  return 'en';
}

export function getLang(): Lang {
  if (current) return current;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') {
      current = stored;
      return current;
    }
  } catch {
    // storage unavailable — just detect
  }
  current = detectDefault();
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // won't persist across reloads; fine
  }
}

/** Flips the language and returns the new one. */
export function toggleLang(): Lang {
  const next: Lang = getLang() === 'en' ? 'zh' : 'en';
  setLang(next);
  return next;
}

// ---------------------------------------------------------------------------
// UI strings (keyed, with {param} placeholders)
// ---------------------------------------------------------------------------

interface Entry {
  en: string;
  zh: string;
}

export const UI = {
  // Shared
  backToMenu: { en: 'Back to Menu', zh: '返回主選單' },
  backToMap: { en: 'Back to Map', zh: '返回地圖' },
  nextLevel: { en: 'Next Level ▶', zh: '下一關 ▶' },
  score: { en: 'Score: {n}', zh: '分數：{n}' },

  // Level-select map
  mapSubtitle: {
    en: 'Clear all four fronts — then face the Ancient Dragon',
    zh: '攻克四條戰線——再迎戰遠古巨龍',
  },
  finalGate: { en: 'Clear all four branches to unlock', zh: '全破四條支線後解鎖' },
  navGacha: { en: 'Gacha', zh: '英雄召喚' },
  navCollection: { en: 'Collection / Team', zh: '圖鑑／隊伍' },

  // Branch short tags for the battle header (branchTag + position, e.g. "🔥 2/3")
  'branchTag.prologue': { en: 'Prologue', zh: '序章' },
  'branchTag.fire': { en: '🔥', zh: '🔥' },
  'branchTag.water': { en: '🌊', zh: '🌊' },
  'branchTag.wood': { en: '🌿', zh: '🌿' },
  'branchTag.sky': { en: '🦅', zh: '🦅' },
  'branchTag.final': { en: '🐉', zh: '🐉' },

  // Battle
  beginBattle: { en: 'Begin Battle', zh: '開始戰鬥' },
  leaderLine: { en: 'Leader: {name} — {desc}', zh: '隊長技：{name}——{desc}' },
  combo: { en: '{n} Combo!', zh: '{n} 連擊！' },
  bigMatch: { en: 'Big Match!', zh: '大量消除！' },
  atkIn: { en: 'ATK in {n}', zh: '{n} 回合後攻擊' },
  bigAtkIn: { en: '⚡ BIG ATK in {n}', zh: '⚡ {n} 回合後蓄力大招' },
  shieldStatus: { en: '🛡 -{p}% dmg ({t})', zh: '🛡 減傷 {p}%（{t} 回合）' },
  lockStatus: { en: '🔒 locks {n} gems on attack', zh: '🔒 攻擊時鎖定 {n} 顆符石' },
  enraged: { en: '😡 ENRAGED', zh: '😡 狂暴化' },
  selfHealStatus: { en: '💚 +{a}/{t}t', zh: '💚 每 {t} 回合回復 {a}' },
  turnCounter: { en: '⏱ Turn {c}/{l}', zh: '⏱ 回合 {c}/{l}' },
  poisonStatus: { en: '☠ {d} ({t} turns)', zh: '☠ 中毒 {d}（剩 {t} 回合）' },
  playerShieldStatus: { en: '🛡 -{p}% dmg ({t})', zh: '🛡 減傷 {p}%（{t} 回合）' },
  attackBuffStatus: { en: '⚔ ATKx{m} ({t})', zh: '⚔ 攻擊力x{m}（{t} 回合）' },
  skillCd: { en: 'CD {n}', zh: '冷卻 {n}' },
  skillReady: { en: 'Ready!', zh: '可發動！' },
  chargeInterrupted: { en: 'Charge interrupted!', zh: '蓄力被打斷！' },
  poisonedFloat: { en: '☠ Poisoned!', zh: '☠ 中毒了！' },
  shieldUpFloat: { en: '🛡 Shield Up!', zh: '🛡 護盾展開！' },
  buffUpFloat: { en: '⚔ Attack Up!', zh: '⚔ 攻擊力提升！' },
  stunnedFloat: { en: '⏳ Stunned!', zh: '⏳ 被拖延了！' },
  cleansedFloat: { en: '✨ Cleansed!', zh: '✨ 淨化！' },
  wave: { en: 'Wave {x} / {y} — {name}', zh: '第 {x}/{y} 波——{name}' },

  // Battle results
  levelClear: { en: 'Level Clear!', zh: '關卡通關！' },
  reward: { en: 'Reward: +{n} 💎', zh: '獎勵：+{n} 💎' },
  gameClearLine: {
    en: 'The Ancient Dragon has fallen. The realm is saved!',
    zh: '遠古巨龍已然殞落，王國得救了！',
  },
  branchClearLine: {
    en: '{branch} cleared! Choose your next front on the map.',
    zh: '{branch} 全破！回到地圖選擇下一條戰線吧。',
  },
  outOfTurns: { en: 'Out of Turns', zh: '回合耗盡' },
  gameOver: { en: 'Game Over', zh: '戰敗' },

  // Gacha
  gachaTitle: { en: 'Gacha Summon', zh: '英雄召喚' },
  gachaOdds: { en: 'Common 60% · Rare 30% · SSR 10%', zh: '普通 60%．稀有 30%．SSR 10%' },
  pull1: { en: 'Pull x1  ({n} 💎)', zh: '單抽（{n} 💎）' },
  pull5: { en: 'Pull x5  ({n} 💎)', zh: '五連抽（{n} 💎）' },
  notEnough: { en: 'Not enough 💎 — need {n}.', zh: '💎 不足——需要 {n} 顆。' },
  newRibbon: { en: 'NEW!', zh: 'NEW!' },
  lvUpRibbon: { en: 'Lv UP → {n}', zh: '等級提升 → {n}' },
  statLine: { en: 'ATK {a} · HP {h}', zh: '攻擊 {a}．生命 {h}' },

  // Collection
  collectionTitle: { en: 'Collection & Team', zh: '圖鑑與隊伍' },
  collectionHint: {
    en: 'Tap a card to add/remove — team {n}/{m}. Leader = slot 1.',
    zh: '點擊卡片加入／移除——隊伍 {n}/{m}。1 號位為隊長。',
  },
  teamFull: {
    en: 'Team is full (max {m}) — tap a member to remove first.',
    zh: '隊伍已滿（上限 {m}）——請先點擊隊員移除。',
  },
  collectionLegend: {
    en: 'Card frame = rarity  ·  gold glow = in team',
    zh: '卡框顏色＝稀有度．金色光暈＝隊伍中',
  },
  lvLabel: { en: 'Lv.{n}', zh: '等級 {n}' },
  cardStats: { en: 'ATK {a}   HP {h}', zh: '攻擊 {a}   生命 {h}' },
} satisfies Record<string, Entry>;

export type UiKey = keyof typeof UI;

/** Renders a UI string in the current language, filling {param} placeholders. */
export function t(key: UiKey, params?: Record<string, string | number>): string {
  const entry: Entry | undefined = UI[key];
  let text = entry ? entry[getLang()] : String(key);
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// Content names/sentences, keyed by canonical English text
// ---------------------------------------------------------------------------

export const ZH_CONTENT: Record<string, string> = {
  // --- Level names ---
  'Sleepy Slime Path': '昏睡史萊姆小徑',
  "Warband's Warning": '戰團的警訊',
  'Goblin Outpost': '哥布林前哨站',
  'Goblin War Camp': '哥布林戰爭營地',
  'Goblin Chief': '哥布林酋長',
  'Tideway Naga': '潮道娜迦',
  'Coral Sentinel': '珊瑚哨衛',
  'Leviathan Queen': '利維坦女王',
  'Slime Meadow': '史萊姆草原',
  "Slime Queen's Nest": '史萊姆女王之巢',
  'Slime King': '史萊姆王',
  'Talon Pass': '利爪隘口',
  'Aerie Ambush': '巢穴伏擊',
  "Dragon's Foothills": '巨龍山麓',
  "Dragon's Lair Entrance": '龍巢入口',
  'Ancient Dragon': '遠古巨龍',

  // --- Level stories ---
  'A lone slime dozes on the road out of town — the gentlest possible start to a very bad month.':
    '一隻史萊姆在城外的路上打著盹——這是這個糟糕月份裡最溫柔的開場。',
  'A slime scout watches you from the treeline, biding its time — strike before its countdown reaches zero.':
    '史萊姆斥候在林線後窺伺著你，伺機而動——在牠的倒數歸零前出手吧。',
  'Goblin war-drums echo from the burning hills to the west — one of three warbands rising at once.':
    '哥布林的戰鼓聲自西方燃燒的丘陵傳來——三支同時崛起的戰團之一。',
  'The goblin camp is larger than expected — and a geomancer channels the earth itself against you.':
    '哥布林營地比想像中更龐大——一名地卜師正驅使大地之力對付你。',
  'The Goblin Chief himself steps forward, wielding a blade forged from stolen village iron.':
    '哥布林酋長親自上陣，揮舞著用村莊掠來的鐵鑄成的戰刀。',
  'Meanwhile, along the flooded coast, a naga scout laces the tidewater with venom — outlast the poison.':
    '與此同時，在被淹沒的海岸線上，娜迦斥候在潮水中下了毒——撐過毒素吧。',
  'A warden of living coral bars the reef path, turning gems to stone with every crashing wave.':
    '活珊瑚的守衛擋住了礁岩之路，每一次浪擊都會將符石化為頑石。',
  'The queen of the drowned tide surfaces at last — she cannot burst you down, but her venom and healing will outlast the careless.':
    '沉淪之潮的女王終於現身——她無法一擊擊潰你，但她的毒與自癒會耗死每個大意的人。',
  'Strange tremors shake the meadow at the edge of town. Slimes are massing in numbers no one has seen before.':
    '城鎮邊緣的草原傳來異樣的震動，史萊姆正以前所未見的規模集結。',
  'Deeper in the forest, the slimes have built a nest around something... or someone.':
    '在森林深處，史萊姆圍著某樣東西……或某個人，築起了巢穴。',
  'A towering Slime King rises from the nest, absorbing every lesser slime in its path.':
    '高聳的史萊姆王自巢中升起，吞噬沿途所有的小史萊姆。',
  'High above the other three fronts, harpies have claimed the mountain pass — their screeching cries send climbers reeling.':
    '在其他三條戰線之上，鷹身女妖群佔據了山口——牠們的尖嘯讓攀登者步履踉蹌。',
  'A storm-caller and her skirmisher escort turn the pass into a killing field, hope curdling into feathers.':
    '風暴喚術者與她的遊擊護衛，將山口變成一片修羅場，希望化為滿地羽毛。',
  'The Griffon Matriarch descends from her aerie — the mountain pass belongs to her, and she means to keep it.':
    '獅鷲女王自巢穴俯衝而下——這座山口是她的領地，她絕不容侵犯。',
  'Goblins, naga, slimes, harpies — four warbands, one truth: all of them were gathering tribute for something waking beneath the mountain.':
    '哥布林、娜迦、史萊姆、鷹身女妖——四支戰團，一個真相：牠們都在為山底下甦醒中的存在蒐集貢品。',
  'Whelps circle the cave entrance, guarding the path to their sleeping parent.':
    '幼龍盤旋在洞口，守護著通往沉睡母龍的道路。',
  'The Ancient Dragon awakens. This is the fight your team was assembled for.':
    '遠古巨龍甦醒了。這正是你的隊伍為之集結的一戰。',

  // --- Branch titles ---
  Prologue: '序章',
  '🔥 The Goblin Uprising': '🔥 哥布林之亂',
  '🌊 The Drowned Tide': '🌊 沉淪之潮',
  '🌿 The Slime Outbreak': '🌿 史萊姆之災',
  '🦅 The Skyward Talons': '🦅 天空利爪',
  "🐉 The Dragon's Return": '🐉 巨龍歸來',

  // --- Enemy names (story levels) ---
  Slime: '史萊姆',
  'Slime Scout': '史萊姆斥候',
  Goblin: '哥布林',
  'Goblin Pyro': '哥布林縱火者',
  'Goblin Geomancer': '哥布林地卜師',
  'Naga Scout': '娜迦斥候',
  'Coral Warden': '珊瑚守衛',
  'Slime Queen': '史萊姆女王',
  'Venom Wyvern': '劇毒飛龍',
  'Dragon Whelp': '幼龍',
  'Big Slime': '大史萊姆',
  'Cave Bat': '洞穴蝙蝠',
  'Goblin Shaman': '哥布林薩滿',
  Hobgoblin: '大哥布林',
  Wyvern: '飛龍',
  'Drake Rider': '馭龍騎手',
  'Slime Overlord': '史萊姆霸主',
  'Goblin Warlord': '哥布林戰爭領主',
  'Elder Dragon': '上古巨龍',
  'Harpy Screecher': '尖嘯鷹身女妖',
  'Harpy Skirmisher': '鷹身遊擊者',
  'Harpy Stormcaller': '風暴鷹身女妖',
  'Griffon Matriarch': '獅鷲女王',

  // --- Character names ---
  Firebrand: '烈焰劍士',
  'Aqua Knight': '碧水騎士',
  'Woodland Archer': '林地射手',
  Solaris: '索拉里斯',
  Nightshade: '夜影',
  'Ember Pup': '餘燼小犬',
  'Tide Sprite': '潮汐精靈',
  'Sprout Scout': '新芽斥候',
  'Chrono Imp': '時之小鬼',
  'Phoenix Empress': '鳳凰女皇',
  'Abyssal Queen': '深淵女王',
  'Astral Sorceress': '星界魔女',

  // --- Skill names ---
  Fireball: '火球術',
  'Healing Tide': '治癒之潮',
  'Bramble Guard': '荊棘護盾',
  'Solar Blessing': '太陽祝福',
  'Night Veil': '夜幕',
  Spark: '火花',
  'Tidal Shift': '潮汐轉換',
  'Cleansing Growth': '淨化萌芽',
  'Temporal Boost': '時間加速',
  'Inferno Nova': '煉獄新星',
  'Void Reaping': '虛空收割',
  'Astral Rewrite': '星界改寫',

  // --- Leader skills (name + description) ---
  'Blazing Command': '烈焰號令',
  'Sovereign Flame': '主宰之炎',
  'Umbral Pact': '幽冥契約',
  'Radiant Ascendancy': '聖光凌駕',
  'Fire attribute damage x1.5': '火屬性傷害 1.5 倍',
  'Fire attribute damage x2': '火屬性傷害 2 倍',
  'x2 damage at 5+ combo': '5 連擊以上傷害 2 倍',
  'Light attribute damage x1.5': '光屬性傷害 1.5 倍',

  // --- Elements & rarity ---
  Fire: '火',
  Water: '水',
  Wood: '木',
  Light: '光',
  Dark: '暗',
  Fi: '火',
  Wa: '水',
  Wd: '木',
  Li: '光',
  Da: '暗',
  Common: '普通',
  Rare: '稀有',
  SSR: 'SSR',
};

/**
 * Translates a content string (level/enemy/character/skill name, story
 * sentence...) for display. Returns the input untouched in English mode or
 * when no translation exists — so internal identity (emoji lookups, saves)
 * always keys on the English original.
 */
export function tr(text: string): string {
  if (getLang() !== 'zh') return text;
  return ZH_CONTENT[text] ?? text;
}
