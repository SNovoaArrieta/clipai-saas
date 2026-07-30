import { spawn } from 'node:child_process';

export interface RunMediaProcessInput {
  readonly executablePath: string;
  readonly arguments: readonly string[];
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export interface MediaProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly timedOut: boolean;
  readonly outputLimitExceeded: boolean;
}

export interface MediaProcessRunner {
  run(input: RunMediaProcessInput): Promise<MediaProcessResult>;
}

export class NodeMediaProcessRunner implements MediaProcessRunner {
  public run(input: RunMediaProcessInput): Promise<MediaProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(input.executablePath, [...input.arguments], {
        env: processEnvironment(),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      let timedOut = false;
      let outputLimitExceeded = false;
      let settled = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, input.timeoutMs);
      timeout.unref();

      const consume = (chunk: Buffer, retain: boolean) => {
        bytes += chunk.length;
        if (bytes > input.maxOutputBytes) {
          outputLimitExceeded = true;
          child.kill('SIGKILL');
          return;
        }
        if (retain) {
          chunks.push(chunk);
        }
      };

      child.stdout.on('data', (chunk: Buffer) => consume(chunk, true));
      child.stderr.on('data', (chunk: Buffer) => consume(chunk, false));
      child.once('error', (error) => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      child.once('close', (exitCode) => {
        clearTimeout(timeout);
        if (settled) {
          return;
        }
        settled = true;
        resolve({
          exitCode,
          stdout: Buffer.concat(chunks).toString('utf8'),
          timedOut,
          outputLimitExceeded,
        });
      });
    });
  }
}

function processEnvironment(): NodeJS.ProcessEnv {
  const windowsSystemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  return {
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    ...(windowsSystemRoot === undefined
      ? {}
      : { SystemRoot: windowsSystemRoot }),
  };
}
