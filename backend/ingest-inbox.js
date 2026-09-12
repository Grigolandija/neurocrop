import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// One writer per directory. MQTT acknowledgement is allowed only after put()
// has fsynced the file AND directory. Files are deleted only after DB commit.
export class IngestInbox {
  constructor(directory, { maxBytes = 1024 * 1024 * 1024 } = {}) {
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.flushing = null;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.entries = new Map(fs.readdirSync(directory)
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .map((name) => [name, fs.statSync(path.join(directory, name)).size]));
    this.bytes = [...this.entries.values()].reduce((total, size) => total + size, 0);
  }

  syncDirectory() {
    const fd = fs.openSync(this.directory, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }

  put(payload) {
    const bytes = Buffer.from(payload);
    const name = `${createHash('sha256').update(bytes).digest('hex')}.json`;
    if (this.entries.has(name)) { this.syncDirectory(); return; }
    if (this.bytes + bytes.length > this.maxBytes) throw new Error('Ingest inbox capacity exceeded; refusing acknowledgement');
    const temporary = path.join(this.directory, `${name}.tmp`);
    const fd = fs.openSync(temporary, 'w', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, path.join(this.directory, name));
    this.entries.set(name, bytes.length);
    this.bytes += bytes.length;
    this.syncDirectory();
  }

  flush(consume) {
    if (this.flushing) return this.flushing;
    this.flushing = this.drain(consume).finally(() => { this.flushing = null; });
    return this.flushing;
  }

  async drain(consume) {
    for (const [name, size] of [...this.entries].slice(0, 100)) {
      const file = path.join(this.directory, name);
      await consume(JSON.parse(fs.readFileSync(file, 'utf8')));
      fs.unlinkSync(file);
      this.entries.delete(name);
      this.bytes -= size;
      this.syncDirectory();
    }
  }
}

export function durableMessageHandler(inbox, { onStored = () => {}, onError = () => {} } = {}) {
  return (packet, callback) => {
    try {
      // Malformed JSON cannot be retried into validity. Reject before the inbox.
      JSON.parse(packet.payload.toString());
    } catch {
      onError(new Error('Rejected malformed uplink JSON'));
      callback();
      return;
    }
    try {
      inbox.put(packet.payload);
    } catch (error) {
      onError(error);
      callback(error); // MQTT.js sends no PUBACK on this path.
      return;
    }
    callback();
    onStored();
  };
}
