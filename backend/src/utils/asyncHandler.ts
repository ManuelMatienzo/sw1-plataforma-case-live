import { RequestHandler } from 'express';

export const asyncHandler = (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
