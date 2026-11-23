import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../lib/store';
import { Btn, GemIcon, Header } from '../components/ui';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { AvatarBackdrop, NameTag } from '../components/Cosmetics';
import {
  bodyStage, HAIRS, ITEM, ITEMS, RARITY, SKINS, SLOT_NAMES, SLOTS, STAGE_LEVELS, STAGE_NAMES, type Rarity, type Slot,
} from '../lib/avatar';
import {
  BACKDROPS, cosItem, daysToAfford, GEM_PACE, TAGS, TITLES, type CosKind, type CosLook,
} from '../lib/cosmetics';
import { LOCK_PRICE_GEMS, MAX_LOCKS } from '../lib/streak';
import { buzz, sfx } from '../lib/fx';

export type ShopTab = 'kleidung' | 'aussehen' | 'tag' | 'backdrop' | 'title' | 'schutz';
const TABS: { id: ShopTab; label: string }[] = [
  { id: 'kleidung', label: 'Kleidung' },
  { id: 'tag', label: 'Namens-Tag' },
  { id: 'backdrop', label: 'Hintergrund' },
  { id: 'title', label: 'Titel' },
  { id: 'aussehen', label: 'Aussehen' },
  { id: 'schutz', label: 'Streak-Schutz' },
];

/** Gem-Shop: Kleidung, Namens-Tags, Hintergründe, Titel, Aussehen und Streak-Schutz. */
export function ShopOverlay({ open, onClose, initialTab = 'kleidung', title = 'Gem-Shop' }: {
  open: boolean; onClose: () => void; initialTab?: ShopTab; title?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 mx-auto flex max-w-lg flex-col bg-bg">
          <ShopBody onClose={onClose} initialTab={initialTab} title={title} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Was gerade angetippt (noch nicht gekauft) ist */
type Pick = { kind: 'item'; id: string } | { kind: CosKind; id: string } | null;

function ShopBody({ onClose, initialTab, title }: { onClose: () => void; initialTab: ShopTab; title: string }) {
  const g = useGame();
  const [tab, setTab] = useState<ShopTab>(initialTab);
  const [slot, setSlot] = useState<Slot>('top');
  const [pick, setPick] = useState<Pick>(null);
  const [msg, setMsg] = useState('');
  const av = g.avatar;
  const cos = g.cos;
  const stage = bodyStage(g.level);
  const nextStageLv = STAGE_LEVELS[stage + 1];
  const name = g.profile?.name ?? 'Ich';

  // Vorschau: angetipptes Teil anprobieren
  const preview = pick?.kind === 'item' ? { [ITEM[pick.id].slot]: pick.id } : undefined;
  const previewCos: CosLook = pick && pick.kind !== 'item' ? { ...cos, [pick.kind]: pick.id } : cos;
  const pickInfo = pick ? (pick.kind === 'item' ? ITEM[pick.id] : cosItem(pick.kind, pick.id)!) : null;

  const collection = useMemo(() => {
    const total = ITEMS.length + TAGS.length + BACKDROPS.length + TITLES.length;
    const owned = av.owned.length + cos.owned.length;
    return { owned, total };
  }, [av.owned.length, cos.owned.length]);

  const switchTab = (t: ShopTab) => { setTab(t); setPick(null); setMsg(''); };

  const tapItem = async (id: string | null) => {
    setMsg('');
    if (id === null) { setPick(null); await g.equip(slot, null); return; }
    if (av.owned.includes(id)) { setPick(null); await g.equip(slot, id); return; }
    setPick(pick?.id === id ? null : { kind: 'item', id });
  };
  const tapCos = async (kind: CosKind, id: string) => {
    setMsg('');
    if (cos.owned.includes(id)) { setPick(null); await g.equipCos(kind, id); return; }
    setPick(pick?.id === id ? null : { kind, id });
  };
  const buy = async () => {
    if (!pick) return;
    const err = pick.kind === 'item' ? await g.buyItem(pick.id) : await g.buyCos(pick.kind, pick.id);
    if (err) { setMsg(err); sfx('invalid'); return; }
    sfx('gem'); buzz([30, 40, 30]);
    setMsg(`${pickInfo?.name} gekauft und aktiviert.`);
    setPick(null);
  };
  const buyLock = async () => {
    if (await g.buyLock()) { sfx('gem'); buzz(40); setMsg('Streak-Schutz gekauft.'); }
  };

  const locked = !!(pickInfo?.minLevel && g.level < pickInfo.minLevel);
  const short = pickInfo ? Math.max(0, pickInfo.price - g.wallet.gems) : 0;

  return (
    <>
      <Header title={title} onBack={onClose} right={
        <span className="num flex items-center gap-1 rounded-full bg-panel px-3 py-1.5 text-sm"><GemIcon className="h-4 w-4" />{g.wallet.gems.toLocaleString('de-DE')}</span>
      } />
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
        {tab !== 'schutz' && (
          <AvatarBackdrop cs={previewCos} className="relative mb-3 flex flex-col items-center overflow-hidden rounded-3xl bg-gradient-to-b from-panel to-bg pb-3 pt-4">
            <Avatar look={av} level={g.level} preview={preview} className="h-64 w-32" animate />
            <div className="mt-2 max-w-[80%]"><NameTag name={name} cs={previewCos} className="items-center" /></div>
            <div className="absolute left-3 top-3 rounded-full bg-bg/70 px-2.5 py-1 text-xs text-mute">
              Körper: <b className="text-ink">{STAGE_NAMES[stage]}</b>
              {nextStageLv && <> · stärker ab Level {nextStageLv}</>}
            </div>
            <div className="absolute right-3 top-3 rounded-full bg-bg/70 px-2.5 py-1 text-xs text-mute">
              <b className="text-ink">{collection.owned}</b>/{collection.total} gesammelt
            </div>
          </AvatarBackdrop>
        )}

        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto no-scrollbar px-4">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => switchTab(t.id)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-ink text-bg' : 'bg-panel text-mute'}`}>{t.label}</button>
          ))}
        </div>

        {tab === 'kleidung' && (
          <>
            <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
              {SLOTS.map((s) => (
                <button key={s} onClick={() => { setSlot(s); setPick(null); }}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${slot === s ? 'border-transparent bg-hot' : 'border-line text-mute'}`}>{SLOT_NAMES[s]}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Tile label="Nichts" sub={!av.equipped[slot] ? 'An' : 'Ausziehen'} active={!av.equipped[slot] && !pick} onClick={() => void tapItem(null)}>
                <Icon name="x" className="h-6 w-6 text-mute" />
              </Tile>
              {ITEMS.filter((i) => i.slot === slot).sort((a, b) => a.price - b.price).map((i) => (
                <Tile key={i.id} label={i.name} rarity={i.rarity} active={pick ? pick.id === i.id : av.equipped[slot] === i.id}
                  onClick={() => void tapItem(i.id)}
                  sub={<Status owned={av.owned.includes(i.id)} on={av.equipped[slot] === i.id} price={i.price} minLevel={i.minLevel} level={g.level} />}>
                  <span className="block h-9 w-9 rounded-xl ring-2 ring-white/10" style={{ background: `linear-gradient(135deg, ${i.color} 0 60%, ${i.accent} 60% 100%)` }} />
                </Tile>
              ))}
            </div>
          </>
        )}

        {tab === 'tag' && (
          <div className="grid grid-cols-2 gap-2">
            {TAGS.map((t) => (
              <Tile key={t.id} label={t.name} rarity={t.rarity} active={pick ? pick.id === t.id : (cos.tag ?? 'tag_plain') === t.id}
                onClick={() => void tapCos('tag', t.id)}
                sub={<Status owned={cos.owned.includes(t.id)} on={(cos.tag ?? 'tag_plain') === t.id} price={t.price} minLevel={t.minLevel} level={g.level} />}>
                <NameTag name={name} cs={{ tag: t.id }} size="sm" showTitle={false} />
              </Tile>
            ))}
          </div>
        )}

        {tab === 'backdrop' && (
          <div className="grid grid-cols-3 gap-2">
            {BACKDROPS.map((b) => (
              <Tile key={b.id} label={b.name} rarity={b.rarity} active={pick ? pick.id === b.id : (cos.backdrop ?? 'bd_none') === b.id}
                onClick={() => void tapCos('backdrop', b.id)}
                sub={<Status owned={cos.owned.includes(b.id)} on={(cos.backdrop ?? 'bd_none') === b.id} price={b.price} minLevel={b.minLevel} level={g.level} />}>
                <AvatarBackdrop cs={{ backdrop: b.id }} className="h-10 w-14 rounded-lg border border-line"><span /></AvatarBackdrop>
              </Tile>
            ))}
          </div>
        )}

        {tab === 'title' && (
          <div className="grid grid-cols-2 gap-2">
            {TITLES.map((t) => (
              <Tile key={t.id} label={t.name} rarity={t.rarity} active={pick ? pick.id === t.id : (cos.title ?? 'ti_none') === t.id}
                onClick={() => void tapCos('title', t.id)}
                sub={<Status owned={cos.owned.includes(t.id)} on={(cos.title ?? 'ti_none') === t.id} price={t.price} minLevel={t.minLevel} level={g.level} />}>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-neon">{t.text || '—'}</span>
              </Tile>
            ))}
          </div>
        )}

        {tab === 'aussehen' && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 font-display">Hautfarbe</p>
              <div className="flex flex-wrap gap-2">
                {SKINS.map((c, k) => (
                  <button key={c} onClick={() => void g.setLook({ skin: k })} aria-label={`Hautfarbe ${k + 1}`}
                    className={`h-11 w-11 rounded-full ring-2 ${av.skin === k ? 'ring-neon' : 'ring-transparent'}`} style={{ background: c }} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 font-display">Haare</p>
              <div className="grid grid-cols-3 gap-2">
                {HAIRS.map((h, k) => (
                  <button key={h.name} onClick={() => void g.setLook({ hair: k })}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm ${av.hair === k ? 'border-neon bg-neon/10' : 'border-line'}`}>
                    <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: h.style === 'bald' ? 'transparent' : h.color, border: h.style === 'bald' ? '1px dashed #9a958c' : 'none' }} />
                    {h.name}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-mute">Aussehen ändern ist kostenlos.</p>
          </div>
        )}

        {tab === 'schutz' && (
          <div className="space-y-4">
            <div className="flex justify-center gap-3 py-4">
              {Array.from({ length: MAX_LOCKS }).map((_, i) => (
                <div key={i} className={`grid h-20 w-20 place-items-center rounded-2xl ${i < g.streak.locks ? 'bg-volt/20 text-volt' : 'border-2 border-dashed border-line text-mute/50'}`}>
                  <Icon name="snow" className="h-9 w-9" />
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-mute">Rettet deine Streak bei einem verpassten Tag. Max. {MAX_LOCKS}.</p>
            <Btn kind="gem" className="w-full" disabled={g.streak.locks >= MAX_LOCKS || g.wallet.gems < LOCK_PRICE_GEMS} onClick={() => void buyLock()}>
              <span className="flex items-center justify-center gap-2">
                {g.streak.locks >= MAX_LOCKS ? 'Du hast schon alle' : <>Kaufen für {LOCK_PRICE_GEMS} <GemIcon className="h-4 w-4" /></>}
              </span>
            </Btn>
            {g.streak.locks < MAX_LOCKS && g.wallet.gems < LOCK_PRICE_GEMS && <p className="text-center text-xs text-mute">Noch {LOCK_PRICE_GEMS - g.wallet.gems} Gems.</p>}
          </div>
        )}

        {tab !== 'schutz' && tab !== 'aussehen' && (
          <p className="mt-4 text-center text-xs text-mute">
            Gems gibt es fürs Training, Tagesaufträge, Rekorde und Streak-Meilensteine. Wer täglich trainiert, sammelt etwa {GEM_PACE} am Tag.
          </p>
        )}

        {pickInfo && (
          <div className="sticky bottom-0 mt-4 rounded-3xl bg-panel p-3 shadow-float">
            <p className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span>Anprobe: <b>{pickInfo.name}</b></span>
              <RarityPill r={pickInfo.rarity} />
            </p>
            <Btn kind="gem" className="w-full !py-3" disabled={locked || short > 0} onClick={() => void buy()}>
              <span className="flex items-center justify-center gap-2">
                {locked ? <>Ab Level {pickInfo.minLevel}</> : <>Kaufen für {pickInfo.price.toLocaleString('de-DE')} <GemIcon className="h-4 w-4" /></>}
              </span>
            </Btn>
            {!locked && short > 0 && (
              <p className="mt-2 text-center text-xs text-mute">Noch {short.toLocaleString('de-DE')} Gems, das sind etwa {daysToAfford(pickInfo.price, g.wallet.gems)} Trainingstage.</p>
            )}
            {locked && <p className="mt-2 text-center text-xs text-mute">Du bist Level {g.level}. Trainiere weiter, dann wird es freigeschaltet.</p>}
          </div>
        )}

        {msg && <p className="mt-3 text-center text-sm text-neon">{msg}</p>}
      </div>
    </>
  );
}

function Status({ owned, on, price, minLevel, level }: { owned: boolean; on: boolean; price: number; minLevel?: number; level: number }) {
  if (on) return <>Aktiv</>;
  if (owned) return <>Anlegen</>;
  if (minLevel && level < minLevel) return <span className="flex items-center justify-center gap-1"><LockIcon /> Level {minLevel}</span>;
  return <span className="flex items-center justify-center gap-1">{price.toLocaleString('de-DE')} <GemIcon className="h-3 w-3" /></span>;
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
}

function RarityPill({ r }: { r: Rarity }) {
  return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: RARITY[r].color, background: `${RARITY[r].color}22` }}>{RARITY[r].name}</span>;
}

function Tile({ label, sub, active, onClick, rarity, children }: { label: string; sub: ReactNode; active: boolean; onClick: () => void; rarity?: Rarity; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`relative flex min-w-0 flex-col items-center gap-1.5 overflow-hidden rounded-2xl border p-3 text-center ${active ? 'border-neon bg-neon/10' : 'border-line bg-panel'}`}>
      {rarity && rarity !== 'common' && <span className="absolute inset-x-0 top-0 h-1" style={{ background: RARITY[rarity].color }} />}
      <span className="grid h-10 max-w-full place-items-center">{children}</span>
      <span className="line-clamp-2 max-w-full text-xs font-medium leading-tight [overflow-wrap:anywhere]" lang="de" style={{ hyphens: 'auto' }}>{label}</span>
      <span className="text-[11px] text-mute">{sub}</span>
    </button>
  );
}
