import { beforeEach, describe, expect, it } from 'vitest';
import { UI, ZH_CONTENT, getLang, setLang, t, toggleLang, tr } from './i18n';
import type { UiKey } from './i18n';
import { BRANCHES, LEVELS } from './levels';
import { CHARACTER_POOL } from './characterPool';
import { ELEMENT_NAMES } from './constants';
import { elementAbbr } from './team';

beforeEach(() => {
  setLang('en');
});

describe('language state', () => {
  it('defaults to English in a node environment (no localStorage/navigator) without throwing', () => {
    expect(['en', 'zh']).toContain(getLang());
  });

  it('setLang/toggleLang flip the language', () => {
    expect(getLang()).toBe('en');
    expect(toggleLang()).toBe('zh');
    expect(getLang()).toBe('zh');
    setLang('en');
    expect(getLang()).toBe('en');
  });
});

describe('t() — UI strings', () => {
  it('every UI key has a non-empty en and zh value', () => {
    for (const [key, entry] of Object.entries(UI)) {
      expect(entry.en.length, `${key}.en`).toBeGreaterThan(0);
      expect(entry.zh.length, `${key}.zh`).toBeGreaterThan(0);
    }
  });

  it('interpolates {param} placeholders in both languages', () => {
    expect(t('score', { n: 450 })).toBe('Score: 450');
    expect(t('wave', { x: 1, y: 2, name: 'Slime' })).toBe('Wave 1 / 2 — Slime');
    setLang('zh');
    expect(t('score', { n: 450 })).toBe('分數：450');
    expect(t('atkIn', { n: 3 })).toBe('3 回合後攻擊');
  });

  it('falls back to the key itself for unknown keys', () => {
    expect(t('no-such-key' as UiKey)).toBe('no-such-key');
  });

  it('no zh UI value still contains an unfilled placeholder mismatch', () => {
    // Every {param} that appears in en must also appear in zh (and vice
    // versa), otherwise one language renders a raw "{n}".
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, entry] of Object.entries(UI)) {
      expect(params(entry.zh), key).toEqual(params(entry.en));
    }
  });
});

describe('tr() — content strings', () => {
  it('passes everything through untouched in English mode', () => {
    expect(tr('Slime King')).toBe('Slime King');
    expect(tr('unknown text')).toBe('unknown text');
  });

  it('translates known content in Chinese mode and passes unknown text through', () => {
    setLang('zh');
    expect(tr('Slime King')).toBe('史萊姆王');
    expect(tr('Firebrand')).toBe('烈焰劍士');
    expect(tr('totally unknown')).toBe('totally unknown');
  });

});

describe('translation coverage — every user-facing content string has a zh entry', () => {
  const required: { label: string; values: string[] }[] = [
    { label: 'level names', values: LEVELS.map((l) => l.name) },
    { label: 'level stories', values: LEVELS.map((l) => l.story) },
    { label: 'branch titles', values: BRANCHES.map((b) => b.title) },
    { label: 'story enemy names', values: LEVELS.flatMap((l) => l.enemies.map((e) => e.name)) },
    { label: 'character names', values: CHARACTER_POOL.map((c) => c.name) },
    { label: 'skill names', values: CHARACTER_POOL.map((c) => c.skillName) },
    {
      label: 'leader skills',
      values: CHARACTER_POOL.flatMap((c) =>
        c.leaderSkill ? [c.leaderSkill.name, c.leaderSkill.description] : [],
      ),
    },
    { label: 'element names', values: [...ELEMENT_NAMES] },
    { label: 'element abbreviations', values: [0, 1, 2, 3, 4].map((i) => elementAbbr(i)) },
    { label: 'rarities', values: ['Common', 'Rare', 'SSR'] },
  ];

  for (const group of required) {
    it(group.label, () => {
      for (const value of group.values) {
        expect(ZH_CONTENT[value], `missing zh translation for "${value}"`).toBeDefined();
      }
    });
  }

  it('every branch id has a branchTag UI key', () => {
    for (const branch of BRANCHES) {
      const key = `branchTag.${branch.id}` as UiKey;
      expect(UI[key], key).toBeDefined();
    }
  });
});
