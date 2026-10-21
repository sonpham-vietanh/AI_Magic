import { join } from 'node:path';
import { readJsonStrict, writeJsonAtomic } from './safeJson';

export interface ClassNote {
  id: string;
  classId: string;
  note: string;
  createdAt: string;
  teacherName?: string;
}

type NotesData = Record<string, ClassNote[]>;

const NOTES_FILE = join(process.cwd(), '.data', 'class-notes.json');
const MAX_NOTES_PER_CLASS = 200;

let mutexTail: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutexTail.then(fn, fn);
  mutexTail = run.catch(() => undefined);
  return run;
}

async function readNotes(): Promise<NotesData> {
  const parsed = await readJsonStrict<unknown>(NOTES_FILE, () => ({}));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as NotesData;
}

async function writeNotes(data: NotesData): Promise<void> {
  await writeJsonAtomic(NOTES_FILE, data);
}

/** Newest first. */
export async function listClassNotes(classId: string): Promise<ClassNote[]> {
  const data = await readNotes();
  return Array.isArray(data[classId]) ? data[classId] : [];
}

export const addClassNote = (input: {
  classId: string;
  note: string;
  teacherName?: string;
}): Promise<ClassNote> =>
  withLock(async () => {
    const data = await readNotes();
    const entry: ClassNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      classId: input.classId,
      note: input.note,
      createdAt: new Date().toISOString(),
      ...(input.teacherName ? { teacherName: input.teacherName } : {}),
    };
    const list = Array.isArray(data[input.classId]) ? data[input.classId] : [];
    data[input.classId] = [entry, ...list].slice(0, MAX_NOTES_PER_CLASS);
    await writeNotes(data);
    return entry;
  });
