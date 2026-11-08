import { describe, it, expect } from 'vitest';
import { extractVideoMedia } from '../src/modules/x-video/extract';
import { label, sortVariants, validUrl, filename, selectVariant } from '../src/modules/x-video/shared';
const mp4 = (size: string, bitrate: number) => ({url:`https://video.twimg.com/${size}/a.mp4`, bitrate, content_type:'video/mp4'});
const hls = {url:'https://video.twimg.com/a.m3u8',content_type:'application/x-mpegURL'};
const tweet = (id: string, variants: unknown[][]) => ({rest_id:id, core:{user_results:{result:{legacy:{screen_name:'alice'}}}}, legacy:{extended_entities:{media:variants.map((v,i) => ({media_key:String(i), video_info:{variants:v}}))}}});
describe('X video', () => {
 it('extracts video and filters HLS', () => { const r = extractVideoMedia({data:{tweet:tweet('1',[[hls,mp4('1280x720',1000)]])}}); expect(r).toHaveLength(1); expect(r[0].screenName).toBe('alice'); expect(r[0].variants).toHaveLength(1); });
 it('extracts GIF, multiple media, quoted and retweeted tweets', () => { const json = {result:tweet('1',[[mp4('320x180',100)], [mp4('640x360',200)]]), quoted_status_result:{result:tweet('2',[[mp4('640x360',200)]])}, retweeted_status_result:{result:tweet('3',[[hls]])}}; const r=extractVideoMedia(json); expect(r.map(x=>x.tweetId)).toEqual(['1','1','2','3']); expect(r[3].variants).toEqual([]); });
 it('returns empty for no video', () => expect(extractVideoMedia({data:{legacy:{id_str:'1',entities:{media:[{type:'photo'}]}}}})).toEqual([]));
 it('records positions, video count and GIF type even with photos mixed in', () => {
  const result = extractVideoMedia({rest_id:'42', legacy:{extended_entities:{media:[{type:'photo'}, {type:'video', video_info:{variants:[mp4('1280x720',1000)]}}, {type:'animated_gif', video_info:{variants:[mp4('640x360',200)]}}]}}});
  expect(result.map(({mediaIndex, mediaCount, isGif}) => ({mediaIndex, mediaCount, isGif}))).toEqual([{mediaIndex:1, mediaCount:2, isGif:false}, {mediaIndex:2, mediaCount:2, isGif:true}]);
  expect(filename('user', '42', '720p', result[1].mediaIndex)).toBe('LifeTools/x-user-42-720p-3.mp4');
 });
 it('sorts and labels qualities', () => { const list=extractVideoMedia(tweet('1',[[mp4('640x360',200),mp4('1280x720',1000)] ]))[0].variants; expect(label(sortVariants(list)[0])).toBe('720p'); expect(selectVariant(list,'lowest')).toEqual(list[0]); expect(label({url:'https://video.twimg.com/a',contentType:'video/mp4',bitrate:500000})).toBe('500 kbps'); });
 it('validates hosts and sanitizes names', () => { expect(validUrl('https://video.twimg.com/a')).toBe(true); for (const url of ['http://video.twimg.com/a','https://example.com/a','https://video.twimg.com.evil.com/a']) expect(validUrl(url)).toBe(false); expect(filename('../alice','12/3','720p')).toBe('LifeTools/x-alice-123-720p.mp4'); });
 it('adds a one-based suffix only when an index is supplied', () => { expect(filename('user','123','720p')).toBe('LifeTools/x-user-123-720p.mp4'); expect(filename('user','123','720p',1)).toBe('LifeTools/x-user-123-720p-2.mp4'); });
});
