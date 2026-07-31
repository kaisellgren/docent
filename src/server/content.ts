import { z } from 'zod';

export const pageInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  markdown: z.string().max(200_000),
});

export const spaceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  icon: z.enum(['book-open', 'code-2', 'compass', 'database', 'megaphone', 'palette', 'shield-check', 'users']),
});

export const folderInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable(),
});

export const chatInputSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(4_000),
});

export const uploadMetadataSchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  tagNames: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
});

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const supportedUploadTypes = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
} as const;

export type SupportedUploadType = keyof typeof supportedUploadTypes;

export function friendlyFileType(mediaType: string): string {
  const labels: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.oasis.opendocument.text': 'ODT',
  };
  return labels[mediaType] ?? mediaType.split('/').pop()?.split('.').pop()?.toUpperCase() ?? 'File';
}
