import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Normalizes every error into the blueprint's global error envelope:
 *   { "error": { "code": string, "message": string } }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception?.status) {
      status = exception.status;
      code = exception.code || exception.name || 'ERROR';
      message =
        typeof exception.message === 'string'
          ? exception.message
          : exception.response?.message || exception.message || 'Error';
      if (typeof exception.response === 'object' && exception.response?.message) {
        message = Array.isArray(exception.response.message)
          ? exception.response.message.join('; ')
          : exception.response.message;
        code = exception.response.code || exception.response.error || code;
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse() as any;
      message = typeof resp === 'string' ? resp : resp?.message || message;
      code = (typeof resp === 'object' && resp?.code) || 'ERROR';
    } else {
      this.logger.error(`Unhandled error on ${request.method} ${request.url}`, exception?.stack || exception);
    }

    response.status(status).json({
      error: { code, message },
    });
  }
}
