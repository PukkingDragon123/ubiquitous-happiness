// The home's MAILBOX (v7): what a run sends home lands here first (META.mail, src/meta/meta.ts postMail): gear
// mailed with Marge from the post office buoy, material stacks, and the whole pack a victory carries home. Each parcel
// is RECEIVED (gear into the stash, materials onto the shelf: META.materials) or DISPOSED of: Marge takes it back to
// the post office and pays for it in PEARLS, the home's currency (META.materials.pearl, the Giant Pearl the
// workbench crafts and upgrades with), more for rarer and higher-level things.
//
//   mailValue(parcel)          pearls it is worth disposed
//   receiveMail(uid)           -> the parcel (now in the stash / materials) or null
//   disposeMail(uid)           -> pearls gained (0 when there was no such parcel)
//   receiveAll() / disposeAll()
//   pearls()                   the purse (META.materials.pearl)
import { META, saveMeta, type MailItem } from '../meta/meta';
import { ITEMS, getItem, type Rarity } from '../game/items';

/** the material the home counts as money */
export const CURRENCY = 'pearl';
/** pearls per piece of gear by rarity (x1.6 per level above 1) and per 3 material units by rarity */
const GEAR: Record<Rarity, number> = { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 13 };
const MAT: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 8 };

export const pearls = () => META.materials[CURRENCY] ?? 0;
export const isMaterial = (m: MailItem) => m.mat || ITEMS[m.id]?.kind === 'material';

export function mailValue(m: MailItem): number {
  if (!ITEMS[m.id]) return 1;
  if (m.id === CURRENCY) return m.n;
  const r = getItem(m.id).rarity;
  if (isMaterial(m)) return Math.max(1, Math.round((m.n * MAT[r]) / 3));
  return Math.max(1, Math.round(GEAR[r] * (1 + 0.6 * ((m.level ?? 1) - 1)))) * Math.max(1, m.n);
}
/** what every parcel in the box is worth */
export const mailTotal = () => META.mail.reduce((a, m) => a + mailValue(m), 0);

function take(uid: number): MailItem | null {
  const i = META.mail.findIndex((m) => m.uid === uid);
  if (i < 0) return null;
  return META.mail.splice(i, 1)[0];
}
/** into the stash (gear) or onto the materials shelf; unknown ids (renamed items) are simply dropped */
export function receiveMail(uid: number): MailItem | null {
  const m = take(uid);
  if (!m) return null;
  if (ITEMS[m.id]) {
    if (isMaterial(m)) META.materials[m.id] = (META.materials[m.id] ?? 0) + m.n;
    else for (let k = 0; k < Math.max(1, m.n); k++) META.stash.push({ uid: META.nextUid++, id: m.id, gx: -1, gy: -1, rot: 0, level: m.level ?? 1 });
  }
  saveMeta();
  return m;
}
/** Marge takes it back and pays in pearls; returns the pearls gained */
export function disposeMail(uid: number): number {
  const m = META.mail.find((q) => q.uid === uid);
  if (!m) return 0;
  const v = mailValue(m);
  take(uid);
  META.materials[CURRENCY] = pearls() + v;
  saveMeta();
  return v;
}
export function receiveAll(): MailItem[] { return [...META.mail].map((m) => receiveMail(m.uid)).filter((m): m is MailItem => !!m); }
export function disposeAll(): number { return [...META.mail].reduce((a, m) => a + disposeMail(m.uid), 0); }
