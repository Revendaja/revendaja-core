import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../shared/errors/AppError';
import { MAX_AUDIO_BYTES } from './ai.limits';
import { aiService } from './ai.service';
import type { ActionParams, ChatBody, ConversationParams } from './ai.schema';

export async function chat(request: FastifyRequest<{ Body: ChatBody }>, reply: FastifyReply) {
  const result = await aiService.chat(request.userId as string, request.body);
  return reply.send(result);
}

export async function listConversations(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await aiService.listConversations(request.userId as string));
}

export async function getConversationMessages(
  request: FastifyRequest<{ Params: ConversationParams }>,
  reply: FastifyReply,
) {
  const result = await aiService.getConversationMessages(
    request.userId as string,
    request.params.id,
  );
  return reply.send(result);
}

export async function confirmAction(
  request: FastifyRequest<{ Params: ActionParams }>,
  reply: FastifyReply,
) {
  return reply.send(await aiService.confirmAction(request.userId as string, request.params.id));
}

export async function cancelAction(
  request: FastifyRequest<{ Params: ActionParams }>,
  reply: FastifyReply,
) {
  return reply.send(await aiService.cancelAction(request.userId as string, request.params.id));
}

export async function getUsage(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await aiService.getUsage(request.userId as string));
}

// Formatos que a transcrição aceita. O app grava em .m4a.
const AUDIO_EXTENSIONS = new Set(['m4a', 'mp4', 'mp3', 'wav', 'webm', 'mpga', 'mpeg']);

export async function transcribe(request: FastifyRequest, reply: FastifyReply) {
  if (!request.isMultipart()) {
    throw new AppError('Envie o áudio como multipart/form-data.', 400, 'INVALID_UPLOAD');
  }

  const file = await request.file({ limits: { fileSize: MAX_AUDIO_BYTES } });
  if (!file) {
    throw new AppError('Nenhum áudio enviado.', 400, 'MISSING_AUDIO');
  }
  const extension = file.filename.split('.').pop()?.toLowerCase() ?? '';
  if (!AUDIO_EXTENSIONS.has(extension)) {
    throw new AppError('Formato de áudio não suportado.', 400, 'UNSUPPORTED_AUDIO_TYPE');
  }

  const buffer = await file.toBuffer();
  if (file.file.truncated) {
    throw new AppError(
      `Áudio muito grande (máx. ${Math.floor(MAX_AUDIO_BYTES / (1024 * 1024))} MB).`,
      400,
      'AUDIO_TOO_LARGE',
    );
  }
  if (buffer.length === 0) {
    throw new AppError('O áudio está vazio.', 400, 'EMPTY_AUDIO');
  }

  const result = await aiService.transcribe(request.userId as string, {
    buffer,
    filename: file.filename,
    mimeType: file.mimetype,
  });
  return reply.send(result);
}
