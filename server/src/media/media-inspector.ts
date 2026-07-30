export type SupportedMediaContentType =
  | 'video/mp4'
  | 'video/quicktime'
  | 'audio/mpeg'
  | 'audio/wav';

export interface InspectMediaInput {
  readonly filePath: string;
  readonly expectedContentType: SupportedMediaContentType;
}

export type MediaContainer = 'mp4' | 'mov' | 'mp3' | 'wav';
export type MediaRejectionReason =
  | 'unsupported_container'
  | 'content_type_mismatch'
  | 'missing_media_stream'
  | 'invalid_duration'
  | 'invalid_media';

export interface AcceptedMediaInspection {
  readonly outcome: 'accepted';
  readonly container: MediaContainer;
  readonly contentType: SupportedMediaContentType;
  readonly durationMs: number;
  readonly hasAudio: boolean;
  readonly hasVideo: boolean;
}

export interface RejectedMediaInspection {
  readonly outcome: 'rejected';
  readonly reason: MediaRejectionReason;
}

export type MediaInspectionResult =
  | AcceptedMediaInspection
  | RejectedMediaInspection;

export interface MediaInspector {
  inspect(input: InspectMediaInput): Promise<MediaInspectionResult>;
}

export type MediaInspectionFailure = 'unavailable' | 'timeout' | 'output_limit';

export class MediaInspectionError extends Error {
  public constructor(public readonly failure: MediaInspectionFailure) {
    super('Media inspection failed.');
    this.name = 'MediaInspectionError';
  }
}
