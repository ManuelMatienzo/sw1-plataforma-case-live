import { ChildProcess, execFile, spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { AppError } from '../errors/AppError';
import { GeneratedFile, RunnerInfo, RunnerStatus } from '../models/spring.types';

const MAX_LOG_LINES = 1000;

export const findAvailablePort = async (startPort = 8080, host = '127.0.0.1'): Promise<number> => {
  for (let port = startPort; port <= 65535; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.unref();
      server.once('error', () => resolve(false));
      server.listen(port, host, () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new AppError('No se encontró un puerto disponible', 503, 'NO_AVAILABLE_PORT');
};

export interface RunnerSnapshot extends RunnerInfo {
  logs: string[];
}

interface RunnerRecord {
  info: RunnerInfo;
  logs: string[];
  process: ChildProcess | null;
  emitter: EventEmitter;
  intentionallyStopped: boolean;
}

export class SpringRunnerService {
  private readonly runners = new Map<string, RunnerRecord>();

  constructor(private readonly runnersRoot = path.resolve(process.cwd(), 'temp', 'runners')) {
    process.once('SIGINT', () => {
      this.stopAllSync();
      process.exit(130);
    });
    process.once('exit', () => this.stopAllSync());
  }

  async start(sesionId: string, files: GeneratedFile[]): Promise<RunnerSnapshot> {
    this.assertSessionId(sesionId);
    const current = this.runners.get(sesionId);
    if (current && ['COMPILING', 'STARTING', 'RUNNING'].includes(current.info.status)) {
      throw new AppError('El backend generado ya se está ejecutando', 409, 'RUNNER_ALREADY_ACTIVE');
    }
    const port = await findAvailablePort(8080);
    const projectDir = this.safeProjectDir(sesionId);
    await fs.rm(projectDir, { recursive: true, force: true });
    await fs.mkdir(projectDir, { recursive: true });
    await this.writeProject(projectDir, files, port);

    const record: RunnerRecord = {
      info: {
        sesionId,
        status: 'COMPILING',
        port,
        baseUrl: `http://localhost:${port}/api/v1`,
        pid: null,
        startedAt: null,
        error: null,
      },
      logs: [],
      process: null,
      emitter: current?.emitter ?? new EventEmitter(),
      intentionallyStopped: false,
    };
    this.runners.set(sesionId, record);
    this.append(record, `[CASE IA] Puerto ${port} reservado. Compilando el proyecto generado…`);
    this.emitStatus(record);

    const command = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
    const child = spawn(command, ['spring-boot:run'], {
      cwd: projectDir,
      shell: process.platform === 'win32',
      env: { ...process.env, MAVEN_OPTS: `${process.env.MAVEN_OPTS ?? ''} -Dfile.encoding=UTF-8`.trim() },
    });
    record.process = child;
    record.info.pid = child.pid ?? null;
    this.emitStatus(record);

    child.stdout?.on('data', (chunk: Buffer | string) => this.consume(record, String(chunk)));
    child.stderr?.on('data', (chunk: Buffer | string) => this.consume(record, String(chunk), true));
    child.once('error', (error) => {
      record.info.status = 'ERROR';
      record.info.error = error.message;
      this.append(record, `[ERROR] ${error.message}`);
      this.emitStatus(record);
    });
    child.once('exit', (code, signal) => {
      record.process = null;
      record.info.pid = null;
      if (record.intentionallyStopped) {
        record.info.status = 'STOPPED';
        this.append(record, '[CASE IA] Servidor detenido correctamente.');
      } else if (code === 0) {
        record.info.status = 'STOPPED';
        this.append(record, '[CASE IA] El proceso finalizó.');
      } else {
        record.info.status = 'ERROR';
        record.info.error = `Maven finalizó con código ${code ?? 'desconocido'}${signal ? ` (${signal})` : ''}.`;
        this.append(record, `[ERROR] ${record.info.error}`);
      }
      this.emitStatus(record);
    });
    return this.snapshot(record);
  }

  async stop(sesionId: string): Promise<RunnerSnapshot> {
    this.assertSessionId(sesionId);
    const record = this.runners.get(sesionId);
    if (!record) return this.idleSnapshot(sesionId);
    record.intentionallyStopped = true;
    const pid = record.process?.pid;
    if (pid) await this.killTree(pid);
    record.info.status = 'STOPPED';
    record.info.pid = null;
    record.process = null;
    this.emitStatus(record);
    return this.snapshot(record);
  }

  getStatus(sesionId: string): RunnerSnapshot {
    this.assertSessionId(sesionId);
    const record = this.runners.get(sesionId);
    return record ? this.snapshot(record) : this.idleSnapshot(sesionId);
  }

  subscribe(sesionId: string, listener: (event: { type: 'log' | 'status'; data: string | RunnerInfo }) => void): () => void {
    this.assertSessionId(sesionId);
    let record = this.runners.get(sesionId);
    if (!record) {
      record = {
        info: this.idleSnapshot(sesionId), logs: [], process: null,
        emitter: new EventEmitter(), intentionallyStopped: false,
      };
      this.runners.set(sesionId, record);
    }
    record.emitter.on('event', listener);
    return () => record?.emitter.off('event', listener);
  }

  private async writeProject(projectDir: string, files: GeneratedFile[], port: number): Promise<void> {
    for (const generated of files) {
      const target = path.resolve(projectDir, generated.path);
      if (target !== projectDir && !target.startsWith(`${projectDir}${path.sep}`)) {
        throw new AppError('El proyecto contiene una ruta de archivo insegura', 400, 'UNSAFE_GENERATED_PATH');
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      const content = generated.path.endsWith('application.properties')
        ? generated.content.replace(/^server\.port=.*$/m, `server.port=${port}`)
        : generated.content;
      await fs.writeFile(target, content, 'utf8');
    }
  }

  private consume(record: RunnerRecord, chunk: string, isError = false): void {
    for (const rawLine of chunk.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (!line) continue;
      this.append(record, isError ? `[stderr] ${line}` : line);
      if (/Starting .*Application/i.test(line) && record.info.status === 'COMPILING') {
        record.info.status = 'STARTING';
        this.emitStatus(record);
      }
      if (/Started .* in .* seconds/i.test(line)) {
        record.info.status = 'RUNNING';
        record.info.startedAt = new Date().toISOString();
        record.info.error = null;
        this.emitStatus(record);
      }
    }
  }

  private append(record: RunnerRecord, line: string): void {
    record.logs.push(line);
    if (record.logs.length > MAX_LOG_LINES) record.logs.splice(0, record.logs.length - MAX_LOG_LINES);
    record.emitter.emit('event', { type: 'log', data: line });
  }

  private emitStatus(record: RunnerRecord): void {
    record.emitter.emit('event', { type: 'status', data: { ...record.info } });
  }

  private snapshot(record: RunnerRecord): RunnerSnapshot {
    return { ...record.info, logs: [...record.logs] };
  }

  private idleSnapshot(sesionId: string): RunnerSnapshot {
    return { sesionId, status: 'IDLE', port: null, baseUrl: null, pid: null, startedAt: null, error: null, logs: [] };
  }

  private safeProjectDir(sesionId: string): string {
    const root = path.resolve(this.runnersRoot);
    const target = path.resolve(root, sesionId);
    if (!target.startsWith(`${root}${path.sep}`)) throw new AppError('Identificador de sesión inseguro', 400, 'INVALID_ID');
    return target;
  }

  private assertSessionId(sesionId: string): void {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sesionId)) throw new AppError('Identificador de sesión inválido', 400, 'INVALID_ID');
  }

  private killTree(pid: number): Promise<void> {
    if (process.platform !== 'win32') {
      try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* already stopped */ } }
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      execFile('taskkill', ['/pid', String(pid), '/f', '/t'], () => resolve());
    });
  }

  private stopAllSync(): void {
    for (const record of this.runners.values()) {
      const pid = record.process?.pid;
      if (!pid) continue;
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/f', '/t'], { windowsHide: true });
      else {
        try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* already stopped */ } }
      }
    }
  }
}
