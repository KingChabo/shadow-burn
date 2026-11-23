import { db, getKV, setKV } from './db';
import { buildMyCard, getPlayerId, saveFriend, type Profile } from './game';
import { encodeCard } from './leaderboard';
import { levelFromXp } from './level';
import { normalizeAvatar, type AvatarState } from './avatar';
import { demoPosts, mergePosts, packBlog, pickShare, SHARE_DAYS, SHARE_POSTS, unpackBlog, type BlogPost, type ShareDays } from './blog';
import type { ActivityId } from '../data/activities';
import type { Wallet } from './game';

/** Laufende Session (überlebt App-Wechsel und Neustart) */
export interface BlogRun {
  activityId: ActivityId;
  start: number;
  /** Summe der Pausen in ms */
  pausedMs: number;
  /** seit wann pausiert (ms), sonst null */
  pausedAt: number | null;
  /** Route aufzeichnen (freiwillig) */
  gps: boolean;
  /** Punkte [lat, lon, t] */
  pts: [number, number, number][];
}

export const getRun = () => getKV<BlogRun | null>('blogRun', null);
export const setRun = (r: BlogRun | null) => setKV('blogRun', r);

export function activeSeconds(r: BlogRun, now = Date.now()): number {
  const paused = r.pausedMs + (r.pausedAt ? now - r.pausedAt : 0);
  return Math.max(0, Math.floor((now - r.start - paused) / 1000));
}

export async function listPosts(): Promise<BlogPost[]> {
  return (await db.posts.orderBy('at').reverse().toArray());
}

export async function savePost(p: BlogPost): Promise<void> {
  await db.posts.put(p);
}

export async function deletePost(id: string): Promise<void> {
  await db.posts.delete(id);
}

/** Absender-Daten für eigene Beiträge */
export async function me(): Promise<{ id: string; name: string; level: number; av: AvatarState }> {
  const [id, profile, wallet, av] = await Promise.all([
    getPlayerId(), getKV<Profile | null>('profile', null), getKV<Wallet>('wallet', { points: 0, gems: 0, xp: 0 }), getKV<AvatarState | null>('avatar', null),
  ]);
  return { id, name: profile?.name ?? 'Ich', level: levelFromXp(wallet.xp).level, av: normalizeAvatar(av) };
}

/** Beispiel-Einträge einmalig anlegen (lassen sich in der Blog-Seite wieder entfernen) */
export async function ensureDemo(): Promise<boolean> {
  if (await getKV<boolean>('blogDemoSeeded', false)) return false;
  const m = await me();
  await db.posts.bulkPut(demoPosts({ ...m, av: { skin: m.av.skin, hair: m.av.hair, equipped: m.av.equipped } }));
  await setKV('blogDemoSeeded', true);
  return true;
}

export async function removeDemo(): Promise<void> {
  const ids = (await db.posts.toArray()).filter((p) => p.demo).map((p) => p.id);
  await db.posts.bulkDelete(ids);
}

export interface PackOptions {
  /** Zeitraum (Standard 7 Tage) */
  days?: ShareDays;
  /** höchstens so viele Beiträge (QR 20, Bluetooth 200) */
  max?: number;
  /** Fotos zusammen höchstens so viele Zeichen; danach gehen Beiträge ohne Foto raus (Bluetooth: unter der 4-MB-Grenze bleiben) */
  imageBudget?: number;
}

export interface Packed { payload: string; posts: number; images: number; /** so viele Beiträge lagen im Zeitraum */ total: number }

/**
 * Meinen Blog für den Austausch packen: Spielerkarte + eigene Beiträge im eingestellten Zeitraum.
 * `shrink` verkleinert die Fotos stark (im Browser per Canvas).
 */
export async function packMine(shrink: (img: string) => Promise<string | null>, withBlog = true, now = Date.now(), opt: PackOptions = {}): Promise<Packed> {
  const card = await buildMyCard();
  // Beispiel-Einträge bleiben auf dem eigenen Handy
  const pick = withBlog ? pickShare(await listPosts(), opt.days ?? SHARE_DAYS, opt.max ?? SHARE_POSTS, now) : { posts: [], total: 0 };
  let images = 0, imgChars = 0;
  const budget = opt.imageBudget ?? Infinity;
  const posts: BlogPost[] = [];
  for (const p of pick.posts) {
    // Pro Beitrag nur das erste Foto, klein: sonst dauert die Übertragung zu lange
    let first = p.images[0] && imgChars < budget ? await shrink(p.images[0]) : null;
    if (first && imgChars + first.length > budget) first = null;
    if (first) { images++; imgChars += first.length; }
    posts.push({ ...p, images: first ? [first] : [] });
  }
  return { payload: await packBlog(encodeCard(card), posts), posts: posts.length, images, total: pick.total };
}

/** Nur zählen (für den Hinweis in den Einstellungen): wie viele Beiträge liegen im Zeitraum */
export async function countShare(days: ShareDays, now = Date.now()): Promise<number> {
  return pickShare(await listPosts(), days, Infinity, now).total;
}

export interface ReceiveResult { name: string; added: number; updated: number; friend: 'new' | 'updated' | 'older' | 'self'; /** nur Spielerkarte, ohne Blog */ cardOnly?: boolean }

/** Empfangenen Blog speichern. Die Spielerkarte landet nebenbei in der Rangliste. */
export async function receiveBlog(payload: string): Promise<ReceiveResult> {
  const { card, posts } = await unpackBlog(payload);
  if (card.id === (await getPlayerId())) return { name: card.name, added: 0, updated: 0, friend: 'self' };
  const fr = await saveFriend(card);
  const existing = await db.posts.where('author').equals(card.id).toArray();
  const others = await db.posts.bulkGet(posts.map((p) => p.id));
  const r = mergePosts([...existing, ...others.filter((x): x is BlogPost => !!x)], posts);
  await db.posts.bulkPut(r.put);
  return { name: card.name, added: r.added, updated: r.updated, friend: fr.status };
}
