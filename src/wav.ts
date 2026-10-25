export interface NormalizeResult {
  data: Buffer;
  factor: number;
  peakBefore: number;
  peakAfter: number;
}

interface PcmData {
  start: number;
  samples: number;
}

/** Locate the 16-bit PCM sample data, throwing on anything else. */
function findPcm16(input: Buffer): PcmData {
  if (input.toString('ascii', 0, 4) !== 'RIFF' || input.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }
  let bits = 0;
  let dataStart = -1;
  let dataLen = 0;
  for (let pos = 12; pos + 8 <= input.length;) {
    const id = input.toString('ascii', pos, pos + 4);
    const size = input.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      const format = input.readUInt16LE(pos + 8);
      if (format !== 1) throw new Error('Only PCM WAV files are supported');
      bits = input.readUInt16LE(pos + 22);
    } else if (id === 'data') {
      dataStart = pos + 8;
      dataLen = Math.min(size, input.length - dataStart);
      break;
    }
    pos += 8 + size + (size % 2);
  }
  if (bits !== 16) throw new Error(`Only 16-bit samples are supported (got ${bits})`);
  if (dataStart < 0) throw new Error('WAV has no data chunk');
  return { start: dataStart, samples: Math.floor(dataLen / 2) };
}

/** Multiply every 16-bit sample by `gain`, clamping to the int16 range. */
export function scaleWav(input: Buffer, gain: number): Buffer {
  const { start, samples } = findPcm16(input);
  const out = Buffer.from(input);
  for (let i = 0; i < samples; i++) {
    const off = start + i * 2;
    const scaled = Math.round(out.readInt16LE(off) * gain);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, scaled)), off);
  }
  return out;
}

/** Normalize a 16-bit PCM WAV so its peak sits at `peak` (0-1) of full scale. */
export function normalizeWav(input: Buffer, peak = 0.95): NormalizeResult {
  const { start, samples } = findPcm16(input);
  let max = 0;
  for (let i = 0; i < samples; i++) {
    max = Math.max(max, Math.abs(input.readInt16LE(start + i * 2)));
  }
  if (max === 0) throw new Error('WAV is silent');

  const factor = (peak * 32768) / max;
  return { data: scaleWav(input, factor), factor, peakBefore: max / 32768, peakAfter: peak };
}
