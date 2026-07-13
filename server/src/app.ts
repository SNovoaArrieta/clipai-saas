import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';

import { apiRouter } from './routes/index.js';
import { AppError } from './shared/errors/app-error.js';

const notFoundHandler: RequestHandler = (request, response, next) => {
  void request;
  void response;
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};

const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  next,
) => {
  void request;
  void next;

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    },
  });
};

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
