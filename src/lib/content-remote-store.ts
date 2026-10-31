import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { RemoteCommand, RemoteSession } from './content-remote';

type Entry = { id: string; command: RemoteCommand; createdAt: number };
type Room = {
  id: string;
  key: string;
  code: string | null;
  createdAt: number;
  updatedAt: number;
  sequence: number;
  commands: Entry[];
  targetOnlineAt: number | null;
};
type Store = { rooms: Map<string, Room>; attempts: Map<string, { count: number; since: number }> };
const root = globalThis as typeof globalThis & { __hisaabContentRemote?: Store };
const store =
  root.__hisaabContentRemote ??
  (root.__hisaabContentRemote = { rooms: new Map(), attempts: new Map() });
const ROOM_TTL = 45 * 60_000;
function sweep(now = Date.now()) {
  for (const [id, room] of store.rooms) if (now - room.updatedAt > ROOM_TTL) store.rooms.delete(id);
  for (const [ip, rate] of store.attempts) if (now - rate.since > 60_000) store.attempts.delete(ip);
}
function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function roomFor(id: string, key: string, touch = true) {
  sweep();
  const room = store.rooms.get(id);
  if (!room || !safeEqual(room.key, key)) return null;
  if (touch) room.updatedAt = Date.now();
  return room;
}
export function createRoom(): { code: string; session: RemoteSession } {
  sweep();
  const now = Date.now(),
    id = randomUUID(),
    key = randomBytes(32).toString('base64url'),
    code = randomBytes(5).toString('hex').toUpperCase();
  store.rooms.set(id, {
    id,
    key,
    code,
    createdAt: now,
    updatedAt: now,
    sequence: 0,
    commands: [],
    targetOnlineAt: now,
  });
  return { code, session: { id, key } };
}
export function joinRoom(code: string, ip: string): RemoteSession | null {
  sweep();
  const now = Date.now(),
    rate = store.attempts.get(ip) ?? { count: 0, since: now };
  if (now - rate.since > 60_000) {
    rate.count = 0;
    rate.since = now;
  }
  rate.count++;
  store.attempts.set(ip, rate);
  if (rate.count > 25) return null;
  const room = [...store.rooms.values()].find(
    (r) => r.code && safeEqual(r.code, code.toUpperCase()),
  );
  if (!room) return null;
  room.code = null;
  room.updatedAt = now;
  return { id: room.id, key: room.key };
}
export function addCommand(session: RemoteSession, command: RemoteCommand) {
  const room = roomFor(session.id, session.key);
  if (!room) return false;
  room.sequence++;
  room.commands.push({ id: String(room.sequence), command, createdAt: Date.now() });
  if (room.commands.length > 250) room.commands.splice(0, room.commands.length - 250);
  room.updatedAt = Date.now();
  return true;
}
export function pollRoom(session: RemoteSession, after: number) {
  const room = roomFor(session.id, session.key, false);
  if (!room) return null;
  room.targetOnlineAt = Date.now();
  return {
    commands: room.commands.filter((c: Entry) => Number(c.id) > after),
    sequence: room.sequence,
    controllerConnected: room.code === null,
    expiresAt: room.updatedAt + ROOM_TTL,
  };
}
export function closeRoom(session: RemoteSession) {
  const room = roomFor(session.id, session.key, false);
  if (!room) return false;
  store.rooms.delete(room.id);
  return true;
}
