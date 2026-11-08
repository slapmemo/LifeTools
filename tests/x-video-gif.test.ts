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
  it('limits width while preserving aspect ratio', () => {
    expect(frameSize(1920, 1080)).toEqual({ width: 480, height: 270 });
    expect(frameSize(200, 400)).toEqual({ width: 200, height: 400 });
    expect(() => frameSize(0, 1)).toThrow();
  });
});
