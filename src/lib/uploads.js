'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const multer = require('multer');

const { config } = require('../config');

/**
 * Upload rules per slot. Both the declared mime type and the extension must be
 * allowed, and after the file lands on disk its magic bytes must match too, so a
 * renamed script cannot pass as an image.
 */
const KINDS = {
  photo: {
    dir: 'photo',
    maxBytes: config.limits.imageBytes,
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    label: 'profile photo',
  },
  background: {
    dir: 'background',
    maxBytes: config.limits.imageBytes,
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    label: 'background image',
  },
  cv: {
    dir: 'cv',
    maxBytes: config.limits.docBytes,
    mimes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    extensions: ['.pdf', '.docx'],
    label: 'CV document',
  },
  // Second format for the same CV. Recruiters and ATS tools often insist on one
  // or the other, so both can be published side by side.
  cvPdf: {
    dir: 'cvPdf',
    maxBytes: config.limits.docBytes,
    mimes: ['application/pdf'],
    extensions: ['.pdf'],
    label: 'CV in PDF',
  },
};

const SIGNATURES = {
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  '.webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF, WEBP tag checked separately
  '.pdf': [[0x25, 0x50, 0x44, 0x46]],
  '.docx': [[0x50, 0x4b, 0x03, 0x04]],
};

class UploadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

function kindOf(kind) {
  const rules = KINDS[kind];
  if (!rules) throw new UploadError('Unknown upload type', 404);
  return rules;
}

function safeExtension(originalName, rules) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  return rules.extensions.includes(ext) ? ext : null;
}

function buildUploader(kind) {
  const rules = kindOf(kind);

  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      const dir = path.join(config.paths.uploads, rules.dir);
      try {
        await fsp.mkdir(dir, { recursive: true });
        cb(null, dir);
      } catch (error) {
        cb(error);
      }
    },
    // Generated name: the client never controls the path or the file name on disk.
    filename: (_req, file, cb) => {
      const ext = safeExtension(file.originalname, rules);
      if (!ext) return cb(new UploadError(`Unsupported file type for ${rules.label}`));
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: rules.maxBytes, files: 1, fields: 4 },
    fileFilter: (_req, file, cb) => {
      const mimeOk = rules.mimes.includes(file.mimetype);
      const extOk = Boolean(safeExtension(file.originalname, rules));
      if (!mimeOk || !extOk) {
        return cb(new UploadError(`Only ${rules.extensions.join(', ')} files are allowed for the ${rules.label}`));
      }
      cb(null, true);
    },
  }).single('file');
}

async function verifyMagicBytes(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const expected = SIGNATURES[ext];
  if (!expected) return false;

  const handle = await fsp.open(filePath, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(16), 0, 16, 0);
    if (bytesRead < 4) return false;
    const head = buffer.subarray(0, bytesRead);
    const matches = expected.some((signature) =>
      signature.every((byte, index) => head[index] === byte),
    );
    if (!matches) return false;
    if (ext === '.webp' && head.subarray(8, 12).toString('ascii') !== 'WEBP') return false;
    return true;
  } finally {
    await handle.close();
  }
}

async function removeFile(publicPath) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) return;
  const relative = publicPath.replace(/^\/uploads\//, '');
  const target = path.resolve(config.paths.uploads, relative);
  // Path traversal guard: never delete outside the uploads directory.
  if (!target.startsWith(path.resolve(config.paths.uploads) + path.sep)) return;
  await fsp.rm(target, { force: true });
}

function publicPathFor(kind, filename) {
  return `/uploads/${kindOf(kind).dir}/${filename}`;
}

module.exports = { KINDS, UploadError, buildUploader, verifyMagicBytes, removeFile, publicPathFor, kindOf };
