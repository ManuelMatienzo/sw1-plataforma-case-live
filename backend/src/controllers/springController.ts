import { Request, Response } from 'express';
import { SpringProjectOptions } from '../models/spring.types';
import { UMLDiagramAST } from '../models/uml.types';
import { SpringGeneratorService } from '../services/springGeneratorService';
import { SpringPipelineService } from '../services/springPipelineService';
import { SpringRunnerService } from '../services/springRunnerService';

const safeFilename = (value: string): string => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'proyecto_case';
const sessionId = (req: Request): string => String(req.params.sesionId);

const serializable = (project: Awaited<ReturnType<SpringGeneratorService['generate']>>) => ({
  files: project.files,
  postmanCollection: project.postmanCollection,
  summary: project.summary,
});

export interface SpringController {
  generarDirecto(req: Request, res: Response): Promise<void>;
  generarSesion(req: Request, res: Response): Promise<void>;
  descargarZip(req: Request, res: Response): Promise<void>;
  descargarPostman(req: Request, res: Response): Promise<void>;
  iniciarRunner(req: Request, res: Response): Promise<void>;
  detenerRunner(req: Request, res: Response): Promise<void>;
  estadoRunner(req: Request, res: Response): Promise<void>;
  streamLogs(req: Request, res: Response): Promise<void>;
}

export const createSpringController = (
  pipeline: SpringPipelineService,
  runner: SpringRunnerService,
  generator = new SpringGeneratorService(),
): SpringController => ({
  async generarDirecto(req, res) {
    const { diagrama, options, dataModel } = req.body as { diagrama: UMLDiagramAST; options?: Partial<SpringProjectOptions>; dataModel?: any };
    const project = await generator.generate(diagrama, options, dataModel);
    res.status(200).json({ data: serializable(project) });
  },

  async generarSesion(req, res) {
    const project = await pipeline.generate(sessionId(req), req.auth!.id, req.body?.options, req.body?.dataModel);
    res.status(200).json({ data: { ...serializable(project.result), generatedAt: project.generatedAt } });
  },

  async descargarZip(req, res) {
    const project = await pipeline.getOrGenerate(sessionId(req), req.auth!.id);
    const filename = `${safeFilename(project.projectName)}_backend.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(project.result.zipBuffer);
  },

  async descargarPostman(req, res) {
    const project = await pipeline.getOrGenerate(sessionId(req), req.auth!.id);
    const filename = `${safeFilename(project.projectName)}_postman.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(JSON.stringify(project.result.postmanCollection, null, 2));
  },

  async iniciarRunner(req, res) {
    const id = sessionId(req);
    const project = await pipeline.getOrGenerate(id, req.auth!.id);
    const state = await runner.start(id, project.result.files);
    res.status(202).json({ data: state });
  },

  async detenerRunner(req, res) {
    const id = sessionId(req);
    await pipeline.authorizeHost(id, req.auth!.id);
    const state = await runner.stop(id);
    res.status(200).json({ data: state });
  },

  async estadoRunner(req, res) {
    const id = sessionId(req);
    await pipeline.authorizeHost(id, req.auth!.id);
    res.status(200).json({ data: runner.getStatus(id) });
  },

  async streamLogs(req, res) {
    const id = sessionId(req);
    await pipeline.authorizeHost(id, req.auth!.id);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const initial = runner.getStatus(id);
    res.write(`event: status\ndata: ${JSON.stringify(initial)}\n\n`);
    for (const line of initial.logs) res.write(`event: log\ndata: ${JSON.stringify({ line })}\n\n`);
    const unsubscribe = runner.subscribe(id, (event) => {
      const payload = event.type === 'log' ? { line: event.data } : event.data;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(payload)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    req.once('close', () => { clearInterval(heartbeat); unsubscribe(); });
  },
});
