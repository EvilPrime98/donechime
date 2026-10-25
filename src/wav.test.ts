import { describe, expect, it } from 'vitest';
import { normalizeWav, scaleWav } from './wav.js';

function wav(samples: number[], { format = 1, bits = 16 } = {}): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(v, i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(format, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(8000, 24);
  head.writeUInt32LE(16000, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(bits, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const samplesOf = (b: Buffer) =>
  Array.from({ length: (b.length - 44) / 2 }, (_, i) => b.readInt16LE(44 + i * 2));

describe('scaleWav', () => {
  it('scales samples and keeps the header', () => {
    const input = wav([1000, -2000, 0]);
    expect(samplesOf(scaleWav(input, 1))).toEqual([1000, -2000, 0]);
    expect(samplesOf(scaleWav(input, 0.5))).toEqual([500, -1000, 0]);
    expect(samplesOf(scaleWav(input, 0))).toEqual([0, 0, 0]);
    expect(scaleWav(input, 0.5).subarray(0, 44)).toEqual(input.subarray(0, 44));
  });

  it('clamps to the int16 range', () => {
    expect(samplesOf(scaleWav(wav([30000, -30000]), 2))).toEqual([32767, -32768]);
  });

  it('rejects unsupported input', () => {
    expect(() => scaleWav(Buffer.alloc(44), 1)).toThrow('Not a RIFF/WAVE file');
    expect(() => scaleWav(wav([1], { format: 3 }), 1)).toThrow('Only PCM');
    expect(() => scaleWav(wav([1], { bits: 24 }), 1)).toThrow('16-bit');
  });

  it('accepts a silent file', () => {
    expect(() => scaleWav(wav([0, 0]), 0.5)).not.toThrow();
  });
});

describe('normalizeWav', () => {
  it('brings the peak to the target', () => {
    const r = normalizeWav(wav([1000, -2000]), 0.5);
    expect(samplesOf(r.data)).toEqual([8192, -16384]);
  });

  it('rejects silent input', () => {
    expect(() => normalizeWav(wav([0, 0]))).toThrow('silent');
  });
});
