export function frameSize(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !(width > 0 && height > 0)) throw new Error('Invalid frame size');
  const scale = Math.min(1, 480 / width);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// A 3-3-2 bit palette gives all frames the same 256 colours.
export function encodeGif(width: number, height: number, frames: Uint8ClampedArray[], delay = 8): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535 || !frames.length || frames.some(f => f.length !== width * height * 4)) throw new Error('Invalid GIF frames');
  const out: number[] = [];
  const bytes = (...values: number[]) => { out.push(...values); };
  const word = (v: number) => bytes(v & 255, (v >> 8) & 255);
  bytes(71, 73, 70, 56, 57, 97); word(width); word(height); bytes(0xf7, 0, 0);
  for (let i = 0; i < 256; i++) bytes(Math.round((i >> 5) * 255 / 7), Math.round(((i >> 2) & 7) * 255 / 7), Math.round((i & 3) * 255 / 3));
  bytes(0x21, 0xff, 11, ...Array.from('NETSCAPE2.0', c => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  for (const frame of frames) {
    bytes(0x21, 0xf9, 4, 0); word(Math.max(1, Math.min(65535, Math.round(delay)))); bytes(0, 0);
    bytes(0x2c); word(0); word(0); word(width); word(height); bytes(0, 8);
    // Reset before the dictionary reaches 512 entries, so every LZW code is 9 bits.
    const compressed: number[] = []; let bits = 0, count = 0;
    const code = (value: number) => { bits |= value << count; count += 9; while (count >= 8) { compressed.push(bits & 255); bits >>>= 8; count -= 8; } };
    code(256);
    for (let p = 0, n = 0; p < frame.length; p += 4, n++) {
      if (n && n % 200 === 0) code(256);
      code((frame[p] & 0xe0) | ((frame[p + 1] & 0xe0) >> 3) | (frame[p + 2] >> 6));
    }
    code(257); if (count) compressed.push(bits & 255);
    for (let p = 0; p < compressed.length; p += 255) { const chunk = compressed.slice(p, p + 255); bytes(chunk.length, ...chunk); }
    bytes(0);
  }
  bytes(0x3b); return new Uint8Array(out);
}
