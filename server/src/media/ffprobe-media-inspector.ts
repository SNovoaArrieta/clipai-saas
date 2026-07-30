import {
  MediaInspectionError,
  type AcceptedMediaInspection,
  type InspectMediaInput,
  type MediaContainer,
  type MediaInspectionResult,
  type MediaInspector,
  type MediaRejectionReason,
  type SupportedMediaContentType,
} from './media-inspector.js';
import {
  NodeMediaProcessRunner,
  type MediaProcessRunner,
} from './media-process-runner.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;

const formatByContentType: Readonly<
  Record<
    SupportedMediaContentType,
    {
      readonly container: MediaContainer;
      readonly requiredFormat: string;
      readonly requiredStream: 'audio' | 'video';
    }
  >
> = {
  'video/mp4': {
    container: 'mp4',
    requiredFormat: 'mp4',
    requiredStream: 'video',
  },
  'video/quicktime': {
    container: 'mov',
    requiredFormat: 'mov',
    requiredStream: 'video',
  },
  'audio/mpeg': {
    container: 'mp3',
    requiredFormat: 'mp3',
    requiredStream: 'audio',
  },
  'audio/wav': {
    container: 'wav',
    requiredFormat: 'wav',
    requiredStream: 'audio',
  },
};

interface FfprobeOutput {
  readonly format?: {
    readonly duration?: unknown;
    readonly format_name?: unknown;
    readonly tags?: { readonly major_brand?: unknown };
  };
  readonly streams?: readonly unknown[];
}

export interface FfprobeMediaInspectorOptions {
  readonly ffprobePath: string;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly processRunner?: MediaProcessRunner;
}

function reject(reason: MediaRejectionReason): MediaInspectionResult {
  return { outcome: 'rejected', reason };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseOutput(stdout: string): FfprobeOutput | null {
  try {
    const value: unknown = JSON.parse(stdout);
    return record(value) === null ? null : (value as FfprobeOutput);
  } catch {
    return null;
  }
}

function parseDurationMs(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const seconds = typeof value === 'number' ? value : Number(value);
  const milliseconds = Math.round(seconds * 1_000);
  return Number.isSafeInteger(milliseconds) && milliseconds > 0
    ? milliseconds
    : null;
}

function formatNames(output: FfprobeOutput): Set<string> | null {
  const name = output.format?.format_name;
  return typeof name === 'string'
    ? new Set(
        name
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      )
    : null;
}

function majorBrand(output: FfprobeOutput): string | null {
  const value = output.format?.tags?.major_brand;
  return typeof value === 'string' ? value : null;
}

function classifyExpected(
  output: FfprobeOutput,
  type: SupportedMediaContentType,
): MediaContainer | null {
  const names = formatNames(output);
  if (names === null) {
    return null;
  }
  if (type === 'video/quicktime') {
    return names.has('mov') && majorBrand(output) === 'qt  ' ? 'mov' : null;
  }
  if (type === 'video/mp4') {
    return names.has('mp4') && majorBrand(output) !== 'qt  ' ? 'mp4' : null;
  }
  const expected = formatByContentType[type];
  return names.has(expected.requiredFormat) ? expected.container : null;
}

function anySupportedContainer(output: FfprobeOutput): MediaContainer | null {
  const names = formatNames(output);
  if (names === null) {
    return null;
  }
  if (names.has('mp3')) {
    return 'mp3';
  }
  if (names.has('wav')) {
    return 'wav';
  }
  if (names.has('mov')) {
    return majorBrand(output) === 'qt  ' ? 'mov' : 'mp4';
  }
  return null;
}

function accepted(
  input: InspectMediaInput,
  output: FfprobeOutput,
): AcceptedMediaInspection | MediaInspectionResult {
  const container = classifyExpected(output, input.expectedContentType);
  if (container === null) {
    return reject(
      anySupportedContainer(output) === null
        ? 'unsupported_container'
        : 'content_type_mismatch',
    );
  }

  const streams = (Array.isArray(output.streams) ? output.streams : [])
    .map(record)
    .filter((stream): stream is Record<string, unknown> => stream !== null);
  const hasAudio = streams.some(
    (stream) =>
      stream.codec_type === 'audio' &&
      typeof stream.codec_name === 'string' &&
      stream.codec_name.length > 0,
  );
  const hasVideo = streams.some(
    (stream) =>
      stream.codec_type === 'video' &&
      typeof stream.codec_name === 'string' &&
      stream.codec_name.length > 0,
  );
  const required =
    formatByContentType[input.expectedContentType].requiredStream;
  if (
    (required === 'audio' && !hasAudio) ||
    (required === 'video' && !hasVideo)
  ) {
    return reject('missing_media_stream');
  }

  const durationMs = parseDurationMs(output.format?.duration);
  if (durationMs === null) {
    return reject('invalid_duration');
  }
  return {
    outcome: 'accepted',
    container,
    contentType: input.expectedContentType,
    durationMs,
    hasAudio,
    hasVideo,
  };
}

export class FfprobeMediaInspector implements MediaInspector {
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly processRunner: MediaProcessRunner;

  public constructor(private readonly options: FfprobeMediaInspectorOptions) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    if (
      options.ffprobePath.length === 0 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      !Number.isSafeInteger(maxOutputBytes) ||
      maxOutputBytes < 1
    ) {
      throw new Error('Invalid ffprobe media inspector configuration.');
    }
    this.timeoutMs = timeoutMs;
    this.maxOutputBytes = maxOutputBytes;
    this.processRunner = options.processRunner ?? new NodeMediaProcessRunner();
  }

  public async inspect(
    input: InspectMediaInput,
  ): Promise<MediaInspectionResult> {
    let result;
    try {
      result = await this.processRunner.run({
        executablePath: this.options.ffprobePath,
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
          input.filePath,
        ],
        timeoutMs: this.timeoutMs,
        maxOutputBytes: this.maxOutputBytes,
      });
    } catch {
      throw new MediaInspectionError('unavailable');
    }
    if (result.outputLimitExceeded) {
      throw new MediaInspectionError('output_limit');
    }
    if (result.timedOut) {
      throw new MediaInspectionError('timeout');
    }
    if (result.exitCode === null) {
      throw new MediaInspectionError('unavailable');
    }
    if (result.exitCode !== 0) {
      return reject('invalid_media');
    }
    const output = parseOutput(result.stdout);
    if (output === null) {
      throw new MediaInspectionError('unavailable');
    }
    return accepted(input, output);
  }
}
