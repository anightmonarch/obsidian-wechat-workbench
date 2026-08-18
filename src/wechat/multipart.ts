import { Buffer } from 'node:buffer';

export interface MultipartPart {
  name: string;
  filename?: string;
  contentType?: string;
  data: string | Uint8Array;
}

function safeName(name: string): string {
  if (!/^[A-Za-z0-9_.-]+$/u.test(name)) throw new Error('Invalid multipart field name.');
  return name;
}

function safeFilename(filename: string): string {
  if ([...filename].some(character => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  })) throw new Error('Invalid multipart filename.');
  return filename.replaceAll('"', '%22');
}

function safeContentType(value: string): string {
  if (!/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u.test(value)) {
    throw new Error('Invalid multipart content type.');
  }
  return value;
}

export function encodeMultipart(parts: readonly Readonly<MultipartPart>[], boundary: string): Uint8Array {
  if (!/^[A-Za-z0-9'()+_,./:=?-]{1,70}$/u.test(boundary)) {
    throw new Error('Invalid multipart boundary.');
  }
  const chunks: Buffer[] = [];
  for (const part of parts) {
    let disposition = `Content-Disposition: form-data; name="${safeName(part.name)}"`;
    if (part.filename !== undefined) disposition += `; filename="${safeFilename(part.filename)}"`;
    const headers = [disposition];
    if (part.contentType !== undefined) headers.push(`Content-Type: ${safeContentType(part.contentType)}`);
    chunks.push(Buffer.from(`--${boundary}\r\n${headers.join('\r\n')}\r\n\r\n`, 'utf8'));
    chunks.push(typeof part.data === 'string' ? Buffer.from(part.data, 'utf8') : Buffer.from(part.data));
    chunks.push(Buffer.from('\r\n', 'ascii'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'ascii'));
  return new Uint8Array(Buffer.concat(chunks));
}
