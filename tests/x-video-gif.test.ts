import { describe, expect, it } from 'vitest';
import { encodeGif, frameSize } from '../src/modules/x-video/gif-encoder';

describe('GIF encoder', () => {
  it('writes a 256 colour GIF with two decodable LZW frames', () => {
    const gif = encodeGif(2, 1, [new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]), new Uint8ClampedArray([0, 0, 255, 255, 255, 255, 255, 255])]);
    expect(Array.from(gif.slice(0, 6))).toEqual([71, 73, 70, 56, 57, 97]);
    expect(gif[10] & 7).toBe(7); expect(gif.at(-1)).toBe(0x3b);
    let pos = 13 + 256 * 3; const decoded: number[][] = [];
    while (gif[pos] !== 0x3b) {
      if (gif[pos++] === 0x21) { pos++; while (gif[pos]) pos += gif[pos] + 1; pos++; continue; }
      pos += 8; const packed = gif[pos++]; expect(packed).toBe(0); expect(gif[pos++]).toBe(8);
      const data: number[] = []; while (gif[pos]) { const n = gif[pos++]; data.push(...gif.slice(pos, pos + n)); pos += n; } pos++;
      let bits = 0, count = 0; const codes: number[] = [];
      for (const byte of data) { bits |= byte << count; count += 8; while (count >= 9) { codes.push(bits & 511); bits >>>= 9; count -= 9; } }
      expect(codes[0]).toBe(256); expect(codes[3]).toBe(257); decoded.push(codes.slice(1, 3));
    }
    expect(decoded).toEqual([[224, 28], [3, 255]]);
  });
  it('limits the longest side to 480 while preserving aspect ratio', () => {
    expect(frameSize(1920, 1080)).toEqual({ width: 480, height: 270 });
    expect(frameSize(200, 400)).toEqual({ width: 200, height: 400 });
    expect(frameSize(720, 1280)).toEqual({ width: 270, height: 480 });
    expect(() => frameSize(0, 1)).toThrow();
  });
  it('round-trips through a standard variable-width LZW decoder and compresses', () => {
    const w = 120, h = 90;
    const frame = new Uint8ClampedArray(w * h * 4);
    let seed = 7;
    for (let i = 0; i < w * h; i++) {
      // Yarısı düz renk (iyi sıkışır), yarısı gürültü (sözlük dolup sıfırlanır).
      seed = (seed * 1103515245 + 12345) >>> 0;
      const noisy = i % w > w / 2;
      frame.set([noisy ? seed & 255 : 200, noisy ? (seed >> 8) & 255 : 40, noisy ? (seed >> 16) & 255 : 90, 255], i * 4);
    }
    const expected = Array.from({ length: w * h }, (_, i) => (frame[i * 4] & 0xe0) | ((frame[i * 4 + 1] & 0xe0) >> 3) | (frame[i * 4 + 2] >> 6));
    const gif = encodeGif(w, h, [frame, frame]);
    expect(gif.length).toBeLessThan(w * h * 2);
    let pos = 13 + 256 * 3; const decoded: number[][] = [];
    while (gif[pos] !== 0x3b) {
      if (gif[pos++] === 0x21) { pos++; while (gif[pos]) pos += gif[pos] + 1; pos++; continue; }
      pos += 9; const min = gif[pos++];
      const data: number[] = []; while (gif[pos]) { const n = gif[pos++]; data.push(...gif.slice(pos, pos + n)); pos += n; } pos++;
      decoded.push(lzwDecode(data, min));
    }
    expect(decoded).toHaveLength(2);
    expect(decoded[0]).toEqual(expected);
    expect(decoded[1]).toEqual(expected);
  });
});

function lzwDecode(data: number[], min: number): number[] {
  const clear = 1 << min, eoi = clear + 1;
  let size = min + 1, dict: number[][] = [], prev: number[] | null = null;
  const reset = () => { dict = Array.from({ length: eoi + 1 }, (_, i) => [i]); size = min + 1; prev = null; };
  reset();
  const out: number[] = []; let bits = 0, count = 0, i = 0;
  for (;;) {
    while (count < size) { if (i >= data.length) throw new Error('truncated'); bits |= data[i++] << count; count += 8; }
    const code = bits & ((1 << size) - 1); bits >>>= size; count -= size;
    if (code === clear) { reset(); continue; }
    if (code === eoi) return out;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (code === dict.length && prev) entry = [...prev, prev[0]];
    else throw new Error(`bad code ${code}`);
    out.push(...entry);
    if (prev && dict.length < 4096) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === (1 << size) && size < 12) size++;
  }
}
