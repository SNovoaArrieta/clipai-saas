import { describe, expect, it } from 'vitest';

import { FfprobeMediaInspector } from '../../src/media/ffprobe-media-inspector.js';
import {
  MediaInspectionError,
  type SupportedMediaContentType,
} from '../../src/media/media-inspector.js';
import type {
  MediaProcessResult,
  MediaProcessRunner,
  RunMediaProcessInput,
} from '../../src/media/media-process-runner.js';

const ok = (value: unknown): MediaProcessResult => ({
  exitCode: 0,
  stdout: JSON.stringify(value),
  timedOut: false,
  outputLimitExceeded: false,
});

class FakeRunner implements MediaProcessRunner {
  public input: RunMediaProcessInput | undefined;

  public constructor(private readonly result: MediaProcessResult | Error) {}

  public run(input: RunMediaProcessInput): Promise<MediaProcessResult> {
    this.input = input;
    return this.result instanceof Error
      ? Promise.reject(this.result)
      : Promise.resolve(this.result);
  }
}

function probe(
  formatName: string,
  duration: unknown,
  streams: unknown[],
  majorBrand?: string,
) {
  return {
    format: {
      format_name: formatName,
      duration,
      ...(majorBrand === undefined
        ? {}
        : { tags: { major_brand: majorBrand } }),
    },
    streams,
  };
}

function inspector(result: MediaProcessResult | Error) {
  const runner = new FakeRunner(result);
  return {
    runner,
    subject: new FfprobeMediaInspector({
      ffprobePath: '/tools/ffprobe',
      timeoutMs: 1234,
      maxOutputBytes: 5678,
      processRunner: runner,
    }),
  };
}

const cases: readonly [
  SupportedMediaContentType,
  string,
  string | undefined,
  unknown[],
  string,
][] = [
  [
    'video/mp4',
    'mov,mp4,m4a,3gp,3g2,mj2',
    'isom',
    [{ codec_type: 'video', codec_name: 'h264' }],
    'mp4',
  ],
  [
    'video/quicktime',
    'mov,mp4,m4a,3gp,3g2,mj2',
    'qt  ',
    [{ codec_type: 'video', codec_name: 'prores' }],
    'mov',
  ],
  [
    'audio/mpeg',
    'mp3',
    undefined,
    [{ codec_type: 'audio', codec_name: 'mp3' }],
    'mp3',
  ],
  [
    'audio/wav',
    'wav',
    undefined,
    [{ codec_type: 'audio', codec_name: 'pcm_s16le' }],
    'wav',
  ],
];

describe('FfprobeMediaInspector', () => {
  it.each(cases)(
    'accepts a conservative %s classification',
    async (contentType, name, brand, streams, container) => {
      const { subject } = inspector(ok(probe(name, '1.250', streams, brand)));
      await expect(
        subject.inspect({
          filePath: '/private/input',
          expectedContentType: contentType,
        }),
      ).resolves.toEqual({
        outcome: 'accepted',
        container,
        contentType,
        durationMs: 1250,
        hasAudio: contentType.startsWith('audio/'),
        hasVideo: contentType.startsWith('video/'),
      });
    },
  );

  it('uses fixed bounded local-only ffprobe arguments', async () => {
    const { runner, subject } = inspector(
      ok(probe('wav', '1', [{ codec_type: 'audio', codec_name: 'pcm_s16le' }])),
    );
    await subject.inspect({
      filePath: '/private/input with spaces.wav',
      expectedContentType: 'audio/wav',
    });
    expect(runner.input).toEqual({
      executablePath: '/tools/ffprobe',
      arguments: [
        '-v',
        'error',
        '-protocol_whitelist',
        'file',
        '-probesize',
        '33554432',
        '-analyzeduration',
        '10000000',
        '-show_entries',
        'format=format_name,duration:format_tags=major_brand:stream=codec_type,codec_name',
        '-of',
        'json',
        '-i',
        '/private/input with spaces.wav',
      ],
      timeoutMs: 1234,
      maxOutputBytes: 5678,
    });
  });

  it('rejects a supported container that conflicts with the declaration', async () => {
    const { subject } = inspector(
      ok(probe('mp3', '1', [{ codec_type: 'audio', codec_name: 'mp3' }])),
    );
    await expect(
      subject.inspect({ filePath: '/x', expectedContentType: 'audio/wav' }),
    ).resolves.toEqual({
      outcome: 'rejected',
      reason: 'content_type_mismatch',
    });
  });

  it('rejects unsupported containers, missing streams, invalid duration and invalid bytes', async () => {
    const inputs: readonly [MediaProcessResult, string][] = [
      [
        ok(
          probe('matroska', '1', [{ codec_type: 'video', codec_name: 'vp9' }]),
        ),
        'unsupported_container',
      ],
      [ok(probe('wav', '1', [])), 'missing_media_stream'],
      [
        ok(
          probe('wav', 'NaN', [
            { codec_type: 'audio', codec_name: 'pcm_s16le' },
          ]),
        ),
        'invalid_duration',
      ],
      [
        {
          exitCode: 1,
          stdout: '',
          timedOut: false,
          outputLimitExceeded: false,
        },
        'invalid_media',
      ],
    ];

    for (const [result, reason] of inputs) {
      const { subject } = inspector(result);
      await expect(
        subject.inspect({ filePath: '/x', expectedContentType: 'audio/wav' }),
      ).resolves.toEqual({ outcome: 'rejected', reason });
    }
  });

  it.each([
    [
      {
        exitCode: 0,
        stdout: '{',
        timedOut: false,
        outputLimitExceeded: false,
      },
      'unavailable',
    ],
    [
      {
        exitCode: null,
        stdout: '',
        timedOut: false,
        outputLimitExceeded: false,
      },
      'unavailable',
    ],
    [
      {
        exitCode: null,
        stdout: '',
        timedOut: true,
        outputLimitExceeded: false,
      },
      'timeout',
    ],
    [
      {
        exitCode: null,
        stdout: '',
        timedOut: false,
        outputLimitExceeded: true,
      },
      'output_limit',
    ],
    [new Error('spawn failed'), 'unavailable'],
  ] as const)(
    'classifies operational failures without leaking details',
    async (processResult, failure) => {
      const { subject } = inspector(processResult);
      const error = await subject
        .inspect({
          filePath: '/secret/path',
          expectedContentType: 'audio/wav',
        })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(MediaInspectionError);
      expect(error).toMatchObject({
        failure,
        message: 'Media inspection failed.',
      });
      expect(String(error)).not.toContain('/secret/path');
    },
  );

  it('rejects unsafe inspector configuration', () => {
    expect(() => new FfprobeMediaInspector({ ffprobePath: '' })).toThrow(
      'Invalid ffprobe media inspector configuration.',
    );
    expect(
      () =>
        new FfprobeMediaInspector({
          ffprobePath: 'ffprobe',
          timeoutMs: 0,
        }),
    ).toThrow();
    expect(
      () =>
        new FfprobeMediaInspector({
          ffprobePath: 'ffprobe',
          maxOutputBytes: 0,
        }),
    ).toThrow();
  });
});
