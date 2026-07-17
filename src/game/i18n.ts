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
    en: 'Clear all four fronts — then face {boss}',
    zh: '攻克四條戰線——再迎戰{boss}',
  },
  finalGate: { en: 'Clear all four branches to unlock', zh: '全破四條支線後解鎖' },
  navChapters: { en: '← Chapters', zh: '← 章節' },
  navGacha: { en: 'Gacha', zh: '英雄召喚' },
  navCollection: { en: 'Collection / Team', zh: '圖鑑／隊伍' },

  // Chapter-select screen
  chapterSelectSubtitle: { en: 'Choose your chapter', zh: '選擇章節' },
  chapterLocked: { en: 'Chapter {n} — Locked', zh: '第 {n} 章——未解鎖' },
  chapterEnter: { en: 'Enter ▶', zh: '進入 ▶' },
  chapterLockedHint: { en: 'Clear the previous chapter to unlock', zh: '通過前一章才能解鎖' },

  // Branch short tags for the battle header (branchTag + position, e.g. "🔥 2/3")
  'branchTag.prologue': { en: 'Prologue', zh: '序章' },
  'branchTag.fire': { en: '🔥', zh: '🔥' },
  'branchTag.water': { en: '🌊', zh: '🌊' },
  'branchTag.wood': { en: '🌿', zh: '🌿' },
  'branchTag.sky': { en: '🦅', zh: '🦅' },
  'branchTag.final': { en: '🐉', zh: '🐉' },
  'branchTag.ch2-prologue': { en: 'Prologue', zh: '序章' },
  'branchTag.ch2-fire': { en: '🔥', zh: '🔥' },
  'branchTag.ch2-water': { en: '🌊', zh: '🌊' },
  'branchTag.ch2-wood': { en: '🌿', zh: '🌿' },
  'branchTag.ch2-dark': { en: '💀', zh: '💀' },
  'branchTag.ch2-final': { en: '🕊️', zh: '🕊️' },
  'branchTag.ch3-prologue': { en: 'Prologue', zh: '序章' },
  'branchTag.ch3-fire': { en: '🔥', zh: '🔥' },
  'branchTag.ch3-water': { en: '🌊', zh: '🌊' },
  'branchTag.ch3-wood': { en: '🌿', zh: '🌿' },
  'branchTag.ch3-light': { en: '✨', zh: '✨' },
  'branchTag.ch3-final': { en: '🌑', zh: '🌑' },

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
  resetTeam: { en: 'Reset Team', zh: '重置隊伍' },
  collectionHint: {
    en: 'Tap a card for details — team {n}/{m}. Leader = slot 1.',
    zh: '點擊卡片查看詳情——隊伍 {n}/{m}。1 號位為隊長。',
  },
  teamFull: {
    en: 'Team is full (max {m}) — remove a member first.',
    zh: '隊伍已滿（上限 {m}）——請先移除一名隊員。',
  },
  collectionLegend: {
    en: 'Card frame = rarity  ·  gold glow = in team  ·  tap a slot to remove that member',
    zh: '卡框顏色＝稀有度．金色光暈＝隊伍中．點擊隊伍欄可移除該隊員',
  },
  lvLabel: { en: 'Lv.{n}', zh: '等級 {n}' },
  cardStats: { en: 'ATK {a}   HP {h}', zh: '攻擊 {a}   生命 {h}' },

  // Card detail popup
  activeSkillLabel: { en: 'Active Skill', zh: '主動技能' },
  leaderSkillLabel: { en: 'Leader Skill', zh: '隊長技能' },
  skillCooldownLabel: { en: 'Cooldown: {n} turns', zh: '冷卻時間：{n} 回合' },
  addToTeam: { en: 'Add to Team', zh: '加入隊伍' },
  removeFromTeam: { en: 'Remove from Team', zh: '移出隊伍' },
  closeDetail: { en: 'Close', zh: '關閉' },
  elementHeart: { en: 'Heart', zh: '愛心' },
  skillDescDamage: { en: 'Deals {power} damage to the enemy.', zh: '對敵人造成 {power} 點傷害。' },
  skillDescHeal: { en: 'Restores {power} HP.', zh: '恢復 {power} 點生命值。' },
  skillDescConvert: {
    en: 'Converts {from} gems on the board to {to} gems.',
    zh: '將盤面上的{from}珠轉換為{to}珠。',
  },
  skillDescExtendTime: {
    en: "Adds {sec}s to this turn's move timer.",
    zh: '本回合操作時間 +{sec} 秒。',
  },
  skillDescShieldSelf: {
    en: 'Reduces incoming damage by {pct}% for the next {turns} enemy attacks.',
    zh: '接下來 {turns} 次敵方攻擊減傷 {pct}%。',
  },
  skillDescTeamBuff: {
    en: "Multiplies the team's match damage by x{mult} for {turns} turns.",
    zh: '接下來 {turns} 回合，隊伍傷害提升為 x{mult}。',
  },
  skillDescStunEnemy: {
    en: "Delays the enemy's next attack by {turns} turns.",
    zh: '延遲敵人下次攻擊 {turns} 回合。',
  },
  skillDescCleanse: { en: 'Cures poison.', zh: '解除中毒狀態。' },
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

  // --- Chapter titles ---
  'Chapter 1 · The Dragon Stirs': '第一章・巨龍甦醒',
  'Chapter 2 · The Shattered Frontier': '第二章・破碎邊境',
  "Chapter 3 · Realm's End": '第三章・終焉降臨',

  // --- Chapter 2: level names ---
  Aftershock: '餘震',
  "Refugees' Warning": '難民的警訊',
  'Ashfolk Raiders': '灰燼氏族襲擊者',
  'Cinder Forge': '餘燼熔爐',
  'Salamander Warlord': '蠑螈戰爭領主',
  'Frostfen Serpent': '霜沼巨蟒',
  'Glacial Warden': '冰川守衛',
  'Frost Leviathan': '寒霜利維坦',
  'Blightling Swarm': '疫斑蟲群',
  'Fungal Broodmother': '菌絲孵育母',
  'Blightwood Colossus': '疫木巨像',
  'Crypt Wight': '墓穴屍鬼',
  'Bone Conjurer': '白骨咒師',
  'Lich Chancellor': '巫妖大臣',
  "Seraph's Descent": '熾天使的降臨',
  "Seraph's Gate": '熾天使之門',
  'The Sundered Seraph': '破碎的熾天使',

  // --- Chapter 2: level stories ---
  "The Ancient Dragon's fall cracked the mountain to its roots, opening roads no one ever dared to walk.":
    '遠古巨龍的殞落震裂了山脈的根基，開出了無人敢走的舊路。',
  'Survivors flee the cracked roads, warning of something vast stirring in the dark beneath.':
    '倖存者逃離裂開的道路，警告著黑暗深處有巨大的存在正在甦醒。',
  "Ashfolk raiders pour out of the cinder wastes, drawn by the mountain's new wounds.":
    '灰燼氏族的襲擊者自餘燼荒原湧出，被山脈的新傷口吸引而來。',
  'A forge-warden stokes the cinder flats white-hot, daring you to cross.':
    '熔爐守衛將餘燼平原燒得熾白，挑釁你踏足其中。',
  'The Salamander Warlord commands the cinder wastes — his charge could level a hillside.':
    '蠑螈戰爭領主統領著餘燼荒原——他的衝鋒足以夷平一座山丘。',
  'A serpent of black ice slithers beneath the frostmere, its bite numbing more than flesh.':
    '一條黑冰巨蟒潛行於霜沼之下，牠的咬噬麻痺的不只是血肉。',
  'The glacial warden freezes everything it touches — including the gems beneath your fingers.':
    '冰川守衛凍結一切牠觸及的事物——包括你指尖下的符石。',
  "The Frost Leviathan surfaces from the deep — its hide shrugs off blows, and its bite never stops aching.":
    '寒霜利維坦自深淵浮現——牠的鱗皮不畏打擊，牠的咬噬永不停止作痛。',
  "A swarm of blightlings creeps out from the rot at the forest's heart.":
    '一群疫斑蟲自森林核心的腐朽中爬出。',
  'The Fungal Broodmother spores the air thick, turning hope itself to rot.':
    '菌絲孵育母讓孢子瀰漫空氣，將希望本身化為腐朽。',
  "A colossus of fused rot and root rises from the broodmother's nest, ancient and furious.":
    '一尊融合了腐朽與根鬚的巨像自孵育母的巢穴升起，古老而狂怒。',
  'A wight claws its way out of the hollow crypt beneath the shattered peak.':
    '一名屍鬼自破碎山峰下的空洞墓穴中爬出。',
  "A bone conjurer chants over the crypt's deepest vault, and the dead answer.":
    '白骨咒師在墓穴最深的墓室吟唱，死者應聲而起。',
  'The Lich Chancellor has ruled the hollow crypt for a thousand years — and means to rule it a thousand more.':
    '巫妖大臣統治這座空洞墓穴已有千年——他打算再統治一千年。',
  'Four warbands, one truth: all of them were tribute-bearers for a seraph shattered and fallen from grace.':
    '四支戰團，一個真相：牠們都是為一位墮落破碎的熾天使獻上貢品的使者。',
  "Wraiths of broken light guard the gate, the seraph's grief made manifest.":
    '破碎之光的幽靈守護著大門，那是熾天使悲慟的具現。',
  'The Sundered Seraph awakens in full — not evil, only broken, and broken things lash out hardest.':
    '破碎的熾天使完全甦醒——牠並非邪惡，只是破碎，而破碎之物的反擊最為猛烈。',

  // --- Chapter 2: branch titles ---
  '🔥 Cinder Wastes': '🔥 餘燼荒原',
  '🌊 Frostmere Deep': '🌊 霜沼深淵',
  '🌿 Blightwood': '🌿 疫木林',
  '💀 Hollow Crypt': '💀 空洞墓穴',
  '🕊️ The Sundered Seraph': '🕊️ 破碎的熾天使',

  // --- Chapter 2: enemy names ---
  'Tremor Whelp': '震顫幼龍',
  'Tremor Stalker': '震顫潛行者',
  'Ashfolk Skirmisher': '灰燼氏族遊擊兵',
  'Forge Warden': '熔爐守衛',
  Blightling: '疫斑蟲',
  'Fallen Seraph Herald': '墮落熾天使的傳令',
  'Seraph Wraith': '熾天使幽靈',

  // --- Chapter 3: level names ---
  "Seraph's Ashes": '熾天使之灰',
  'Whispers Below': '深處的低語',
  'Demonic Stoker': '魔煽爐者',
  'Wrathforge Sentinel': '怒焰哨衛',
  'Archdemon of Wrath': '怒焰大魔王',
  'Trench Stalker': '深塹潛行者',
  'Abyssal Warden': '深淵守衛',
  'Kraken Sovereign': '海妖至尊',
  'Thornspire Sentinel': '荊棘塔哨衛',
  'Root Warden': '根鬚守衛',
  'The Thornspire Colossus': '荊棘塔巨像',
  'Bastion Watcher': '堡壘守望者',
  'Choir of Ash': '灰燼詩班',
  'Archon of the Bastion': '堡壘執政官',
  'The Devourer Stirs': '吞噬者甦醒',
  'Gates of Oblivion': '虛無之門',
  'The Devourer Below': '深處的吞噬者',

  // --- Chapter 3: level stories ---
  'Ash from the sundered seraph drifts down into caverns no map remembers, and something below breathes it in.':
    '破碎熾天使的餘灰飄落進無人記載的洞穴，深處有某物將其吸入。',
  'Voices rise from the deepest dark, whispering a name the world was never meant to speak.':
    '聲音自最深的黑暗中升起，低語著一個世界從未該被說出的名字。',
  "Demons stoke a forge older than the mountain itself, feeding it with the realm's dying light.":
    '惡魔們煽動著一座比山脈本身更古老的熔爐，以這片大地垂死的光芒餵養它。',
  "A sentinel of living flame guards the forge's heart, and it does not tire.":
    '一名活焰哨衛守護著熔爐的核心，牠永不疲倦。',
  'The Archdemon of Wrath has stoked this forge since before the first dragon slept.':
    '怒焰大魔王自第一頭巨龍沉睡之前，便煽動著這座熔爐。',
  'Something vast and patient stalks the abyssal trench, venom trailing in its wake.':
    '某個龐大而耐心的存在潛行於深淵塹溝，毒液隨其而過。',
  'The abyssal warden crushes stone into glass with every pulse of pressure it throws.':
    '深淵守衛每一次釋放的壓力波都能將岩石壓碎成玻璃。',
  'The Kraken Sovereign rules the trench absolute — nothing that sinks this far ever rises again.':
    '海妖至尊絕對統治著深塹——沒有任何沉得這麼深的事物能再度浮起。',
  "A sentinel of living thorn guards the spire's roots, older than the forest around it.":
    '一名活荊棘哨衛守護著塔的根基，比周遭的森林更為古老。',
  "The root warden turns even hope to timber, weaving it into the spire's endless growth.":
    '根鬚守衛將希望也化為木材，編織進高塔無盡的生長之中。',
  'The Thornspire Colossus IS the spire — every thorn on the mountain is a piece of it.':
    '荊棘塔巨像本身就是那座高塔——山上的每一根荊棘都是牠的一部分。',
  'A watcher of the seraphic bastion still stands guard, loyal to a seraph long since fallen.':
    '熾天堡壘的守望者仍堅守崗位，忠於一位早已殞落的熾天使。',
  'A choir that once sang hymns of light now sings only of ash.':
    '曾經歌詠光明聖歌的詩班，如今只吟唱灰燼之歌。',
  'The Archon of the Bastion has judged every soul that reached this height — and found them all wanting.':
    '堡壘執政官審判過每一個抵達此地的靈魂——無一不被判定為不配。',
  'Demons, deep horrors, living thorn, fallen light — four guardians, one purpose: keep the Devourer asleep. They have failed.':
    '惡魔、深淵恐怖、活荊棘、墮落之光——四位守護者，同一個使命：讓吞噬者繼續沉睡。牠們失敗了。',
  'The gates of oblivion stand open at last, and the dark beyond has a hunger with no bottom.':
    '虛無之門終於敞開，門後的黑暗有著無底的飢餓。',
  'The Devourer Below wakes at last — the hunger beneath every tribute, every war, every fallen seraph. This is the last fight.':
    '深處的吞噬者終於甦醒——那是每一份貢品、每一場戰爭、每一位墮落熾天使背後的飢餓。這是最後一戰。',

  // --- Chapter 3: branch titles ---
  '🔥 Forge of Wrath': '🔥 怒焰熔爐',
  '🌊 Abyssal Trench': '🌊 深淵塹溝',
  '🌿 Thornspire': '🌿 荊棘塔',
  '✨ Seraphic Bastion': '✨ 熾天堡壘',
  '🌑 The Devourer Below': '🌑 深處的吞噬者',

  // --- Chapter 3: enemy names ---
  'Ash-Touched Revenant': '染灰的亡魂',
  'Whispering Husk': '低語的軀殼',
  'Choir Cantor': '詩班詠者',
  'Devourer Spawn': '吞噬者之裔',
  'Oblivion Gatekeeper': '虛無守門人',

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
  'Kindling Spirit': '火種之魂',
  'Ripple Ward': '漣漪守護',
  'Budding Vigor': '萌芽活力',
  'Ticking Mischief': '滴答惡作劇',
  'Tidal Command': '潮汐號令',
  'Verdant Vanguard': '翠綠先鋒',
  'Solar Authority': '太陽權柄',
  'Umbral Vanguard': '幽冥先鋒',
  'Fire attribute damage x1.5': '火屬性傷害 1.5 倍',
  'Fire attribute damage x2': '火屬性傷害 2 倍',
  'x2 damage at 5+ combo': '5 連擊以上傷害 2 倍',
  'Light attribute damage x1.5': '光屬性傷害 1.5 倍',
  'Fire attribute damage x1.2': '火屬性傷害 1.2 倍',
  'Water attribute damage x1.2': '水屬性傷害 1.2 倍',
  'Wood attribute damage x1.2': '木屬性傷害 1.2 倍',
  'x1.3 damage at 3+ combo': '3 連擊以上傷害 1.3 倍',
  'Water attribute damage x1.4': '水屬性傷害 1.4 倍',
  'Wood attribute damage x1.4': '木屬性傷害 1.4 倍',
  'Light attribute damage x1.4': '光屬性傷害 1.4 倍',
  'x1.6 damage at 4+ combo': '4 連擊以上傷害 1.6 倍',

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
