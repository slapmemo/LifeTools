import { describe, expect, it } from 'vitest';
import { changesSince, featureBadges, whatsNewFrom, CHANGELOG, type ChangeEntry } from '../src/core/whats-new';
import { FEATURE_GUIDE, GUIDE_CATEGORIES } from '../src/onboarding/catalog';
import { modules } from '../src/modules';
import manifest from '../src/manifest.json';

const log: ChangeEntry[] = [
  { version: '0.7.0', items: [{ kind: 'new', features: ['a'], text: 'a geldi' }, { kind: 'improved', features: ['b'], text: 'b iyileşti' }] },
  { version: '0.6.1', items: [{ kind: 'fixed', text: 'düzeltme' }] },
  { version: '0.6.0', items: [{ kind: 'improved', features: ['a', 'c'], text: 'a ve c' }] }
];

describe('değişiklik günlüğü', () => {
  it('yalnızca from (hariç) ile to (dahil) arasındaki sürümleri verir', () => {
    expect(changesSince('0.6.0', '0.7.0', log).map(e => e.version)).toEqual(['0.7.0', '0.6.1']);
    expect(changesSince('0.5.0', '0.6.1', log).map(e => e.version)).toEqual(['0.6.1', '0.6.0']);
    expect(changesSince('0.7.0', '0.7.0', log)).toEqual([]);
  });
  it('rozet: yeni eklenen "Yeni", değişen "Güncellendi"; "Yeni" baskın', () => {
    const b = featureBadges('0.5.0', '0.7.0', log);
    expect(b.get('a')).toBe('Yeni');
    expect(b.get('b')).toBe('Güncellendi');
    expect(b.get('c')).toBe('Güncellendi');
    expect(featureBadges('0.6.0', '0.7.0', log).has('c')).toBe(false);
  });
});

describe('güncellemede rehberi açma kararı', () => {
  it('aynı sürümde açmaz', () => expect(whatsNewFrom('0.7.0', '0.7.0', log)).toBeNull());
  it('arada yenilik varsa son görülen sürümden beri gösterir', () => {
    expect(whatsNewFrom('0.6.0', '0.7.0', log)).toBe('0.6.0');
    expect(whatsNewFrom('0.5.10', '0.6.1', log)).toBe('0.5.10');
  });
  it('arada günlükte giriş yoksa açmaz (her küçük güncellemede araya girmez)', () => {
    expect(whatsNewFrom('0.7.0', '0.7.1', log)).toBeNull();
  });
  it('kayıt yoksa (eski sürümden gelen) yalnızca mevcut sürümün yeniliklerini gösterir', () => {
    expect(whatsNewFrom(null, '0.7.0', log)).toBe('0.6.1');
    expect(changesSince(whatsNewFrom(null, '0.7.0', log)!, '0.7.0', log).map(e => e.version)).toEqual(['0.7.0']);
  });
  it('geri dönüşte (daha eski sürüme) açmaz', () => expect(whatsNewFrom('0.7.0', '0.6.1', log)).toBeNull());
});

describe('gerçek veri', () => {
  it('her modülün rehber kaydı var ve bölümü geçerli', () => {
    for (const m of modules) {
      expect(FEATURE_GUIDE[m.id], m.id).toBeDefined();
      expect(GUIDE_CATEGORIES).toContain(FEATURE_GUIDE[m.id].category);
    }
    for (const id of Object.keys(FEATURE_GUIDE)) expect(modules.map(m => m.id)).toContain(id);
  });
  it('rehberdeki kısayol komutları manifest\'te var', () => {
    const commands = Object.keys((manifest as { commands: Record<string, unknown> }).commands);
    for (const [id, g] of Object.entries(FEATURE_GUIDE)) for (const c of g.commands ?? []) expect(commands, `${id}: ${c}`).toContain(c);
  });
  it('günlük sürümleri yeniden eskiye sıralı, manifest sürümü en üstte ve rozetli modüller gerçek', () => {
    const versions = CHANGELOG.map(e => e.version);
    expect(versions[0]).toBe((manifest as { version: string }).version);
    for (let i = 1; i < versions.length; i++) expect(changesSince(versions[i], versions[i - 1]).length).toBe(1);
    for (const e of CHANGELOG) for (const item of e.items) for (const id of item.features ?? []) expect(modules.map(m => m.id)).toContain(id);
  });
});
