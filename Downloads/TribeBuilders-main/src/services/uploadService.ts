/**
 * Simple uploadService implementation used by routes/uploads.ts.
 * This file provides the methods referenced by the routes so TypeScript can resolve the module.
 * Replace the stub implementations with real logic that interacts with your DB / storage as needed.
 */

type UploadedFile = {
  id: string;
  userId: string;
  originalName: string;
  storedName: string;
  size: number;
  mimeType: string;
  createdAt: string;
};

const mockDb: { files: UploadedFile[]; transcripts: Record<string, { id: string; userId: string; personaId?: string; length?: number }> } = {
  files: [],
  transcripts: {}
};

function generateId(prefix = '') {
  return prefix + Math.random().toString(36).substring(2, 10);
}

export default {
  async processQuestionnaireFile(userId: string, file: Express.Multer.File | any): Promise<{ personaId: string; responsesSaved: number }> {
    // Stub: parse file and save responses; return personaId and count of saved responses
    const personaId = generateId('persona_');
    const responsesSaved = 0; // replace with actual parsing result
    // Optionally save a file record
    mockDb.files.push({
      id: generateId('file_'),
      userId,
      originalName: file.originalname ?? file.filename ?? 'unknown',
      storedName: file.filename ?? file.originalname ?? 'unknown',
      size: file.size ?? 0,
      mimeType: file.mimetype ?? 'application/octet-stream',
      createdAt: new Date().toISOString()
    });
    return { personaId, responsesSaved };
  },

  async processTranscriptFile(userId: string, file: Express.Multer.File | any, source_url?: string, source_type?: string): Promise<{ transcriptId: string; personaId?: string; transcriptLength: number }> {
    // Stub: save transcript and return metadata
    const transcriptId = generateId('trans_');
    const personaId = undefined; // Replace with logic to attach to persona if applicable
    const transcriptLength = (file && file.size) ? Math.max(0, Math.floor(file.size / 100)) : 0;

    mockDb.transcripts[transcriptId] = {
      id: transcriptId,
      userId,
      ...(personaId !== undefined ? { personaId } : {}),
      length: transcriptLength
    };

    mockDb.files.push({
      id: generateId('file_'),
      userId,
      originalName: file.originalname ?? file.filename ?? 'unknown',
      storedName: file.filename ?? file.originalname ?? 'unknown',
      size: file.size ?? 0,
      mimeType: file.mimetype ?? 'text/plain',
      createdAt: new Date().toISOString()
    });

    return personaId !== undefined
      ? { transcriptId, personaId, transcriptLength }
      : { transcriptId, transcriptLength };
  },

  async getUploadedFiles(userId: string): Promise<UploadedFile[]> {
    return mockDb.files.filter(f => f.userId === userId);
  },

  async deleteTranscript(userId: string, id: string): Promise<void> {
    const t = mockDb.transcripts[id];
    if (!t || t.userId !== userId) {
      throw new Error('not found or access denied');
    }
    delete mockDb.transcripts[id];
    // also remove associated file records if you store linking info; this is a stub
  }
};