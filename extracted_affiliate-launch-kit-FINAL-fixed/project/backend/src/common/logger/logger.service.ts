import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Structured logger service for production-ready logging.
 * Outputs JSON-formatted logs for easy parsing by log aggregation tools.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private readonly environment: string;

  constructor(private readonly config: ConfigService) {
    this.environment = this.config.get<string>('NODE_ENV') || 'development';
  }

  private formatMessage(level: string, message: string, context?: string, meta?: any) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      context: context || 'Application',
      environment: this.environment,
      ...(meta && { meta }),
    });
  }

  log(message: string, context?: string, meta?: any) {
    console.log(this.formatMessage('info', message, context, meta));
  }

  error(message: string, trace?: string, context?: string, meta?: any) {
    console.error(this.formatMessage('error', message, context, { ...meta, trace }));
  }

  warn(message: string, context?: string, meta?: any) {
    console.warn(this.formatMessage('warn', message, context, meta));
  }

  debug(message: string, context?: string, meta?: any) {
    if (this.environment === 'development') {
      console.debug(this.formatMessage('debug', message, context, meta));
    }
  }

  verbose(message: string, context?: string, meta?: any) {
    if (this.environment === 'development') {
      console.log(this.formatMessage('verbose', message, context, meta));
    }
  }
}
