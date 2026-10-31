import { readFileSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = 'data/acquisition/geography/hosted',
  m = JSON.parse(readFileSync(root + '/manifest.json')),
  entries = [...m.detailChunks, ...m.index],
  lookup = new Map(m.files.map((f) => [f.name, f]));
let part = 0,
  offset = 0,
  name = 'index-0.bin',
  fd = openSync(root + '/' + name, 'w'),
  files = [];
function finish() {
  closeSync(fd);
  const b = readFileSync(root + '/' + name);
  files.push({ name, bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') });
}
for (const c of entries) {
  const file = lookup.get(c.file),
    bytes = readFileSync(root + '/' + c.file);
  if (offset + bytes.length > 45 * 1024 * 1024) {
    finish();
    name = 'index-' + ++part + '.bin';
    fd = openSync(root + '/' + name, 'w');
    offset = 0;
  }
  writeSync(fd, bytes);
  Object.assign(c, { file: name, offset, length: bytes.length, sha256: file.sha256 });
  offset += bytes.length;
}
finish();
m.files = files;
m.sources = m.sources.map(({ original, gitBlob, ...source }) => source);
writeFileSync(root + '/manifest.json', JSON.stringify(m));
console.log({ bundles: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) });
