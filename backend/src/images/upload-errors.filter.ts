import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, PayloadTooLargeException } from '@nestjs/common';
import type { Response } from 'express';
import { MAX_UPLOAD_BYTES } from './image-processing';

/**
 * Erorile de la multer (biblioteca de încărcare) vin în engleză („File too large”, „Unexpected field”).
 * Pe ruta de încărcare le traducem; restul erorilor trec neschimbate.
 */
@Catch(PayloadTooLargeException, BadRequestException)
export class UploadErrorsFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse() as { message?: unknown; fields?: unknown };
    const raw = typeof body === 'object' ? String(body.message ?? '') : String(body);
    let message: string | null = null;
    if (exception instanceof PayloadTooLargeException) message = `Imaginea poate avea cel mult ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
    else if (/Unexpected field|Too many files|Too many parts|Multipart/i.test(raw)) message = 'Trimite o singură imagine, în câmpul „file”.';
    if (!message) return res.status(status).json(body); // ex. 400 de la procesarea imaginii, deja în română
    res.status(status).json({ statusCode: status, error: status === 413 ? 'Payload Too Large' : 'Bad Request', message, fields: { cover: message } });
  }
}
