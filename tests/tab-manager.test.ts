import { describe, expect, it } from 'vitest';
import { buildViewModel, COLORS, selectRange } from '../src/modules/tab-manager/logic';

describe('sekme yöneticisi', () => {
  it('pencereleri, grupları ve grupsuz sekmeleri sıraya koyar ve kendi sayfasını dışlar', () => {
    const tabs = [{id:1,windowId:1,index:2,groupId:-1},{id:2,windowId:1,index:1,groupId:4},{id:3,windowId:2,index:0,groupId:-1},{id:4,windowId:1,index:0,groupId:5},{id:5,windowId:2,index:1,groupId:-1,url:'extension://tabs.html'}];
    const result = buildViewModel(tabs,[{id:4,windowId:1},{id:5,windowId:1}],'extension://tabs.html',2);
    expect(result.map(w => w.id)).toEqual([2,1]);
    expect(result[1].groups.map(g => g.group.id)).toEqual([5,4]);
    expect(result[1].ungrouped.map(t => t.id)).toEqual([1]);
    expect(result[0].tabs.map(t => t.id)).toEqual([3]);
  });
  it('aralık seçer ve kaldırır', () => {
    expect([...selectRange([1,2,3,4],1,3,new Set([4]),true)]).toEqual([4,1,2,3]);
    expect([...selectRange([1,2,3],3,2,new Set([1,2,3]),false)]).toEqual([1]);
  });
  it('dokuz Chrome renginin Türkçe adını sunar', () => {
    expect(COLORS.map(c => c.label)).toEqual(['Gri','Mavi','Kırmızı','Sarı','Yeşil','Pembe','Mor','Camgöbeği','Turuncu']);
  });
});
