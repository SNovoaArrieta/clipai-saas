import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FfprobeMediaInspector } from '../../src/media/ffprobe-media-inspector.js';
import { createPcmWavFixture } from './wav-fixture.js';

const ffprobePath = process.env.FFPROBE_PATH;
if (ffprobePath === undefined || ffprobePath.length === 0) {
  throw new Error(
    'FFPROBE_PATH is required for the pinned ffprobe contract test.',
  );
}

let fixtureDirectory: string;
let fixturePath: string;

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), 'clipai-media-contract-'));
  fixturePath = join(fixtureDirectory, 'one-second-silence.wav');
  await writeFile(fixturePath, createPcmWavFixture());
});

afterAll(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
});

describe('pinned ffprobe artifact', () => {
  it('inspects a deterministic local PCM WAV without network access', async () => {
    const subject = new FfprobeMediaInspector({ ffprobePath });
    await expect(
      subject.inspect({
        filePath: fixturePath,
        expectedContentType: 'audio/wav',
      }),
    ).resolves.toEqual({
      outcome: 'accepted',
      container: 'wav',
      contentType: 'audio/wav',
      durationMs: 1000,
      hasAudio: true,
      hasVideo: false,
    });
  });
});
