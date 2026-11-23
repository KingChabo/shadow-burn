import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, Header } from '../components/ui';
import { Icon } from '../components/Icon';
import { APP_NAME } from '../lib/brand';

type Pkg = { name: string; version: string; license: string; notice?: string; text?: number };
type Licenses = { packages: Pkg[]; texts: string[] };

/** Open-Source-Lizenzen aller mitgelieferten Bibliotheken, Schriften und Inhalte (offline in der App). */
export function LegalOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 mx-auto flex max-w-lg flex-col bg-bg">
          <Header title="Lizenzen" onBack={onClose} />
          <div className="flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),24px)]">
            <LicenseList />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LicenseList() {

  const [data, setData] = useState<Licenses | null>(null);
  const [openName, setOpenName] = useState<string | null>(null);
  // Die Texte sind ca. 45 KB groß, darum erst laden, wenn jemand die Liste öffnet
  useEffect(() => { void import('../data/licenses.json').then((m) => setData(m.default as Licenses)); }, []);
  if (!data) return <p className="text-sm text-mute">Lädt …</p>;
  return (
    <div className="space-y-2">
      <p className="pb-1 text-sm text-mute">{APP_NAME} benutzt diese freien Bibliotheken, Schriften und Inhalte. Vielen Dank an alle, die sie geschrieben haben. Tippe auf einen Eintrag für den Lizenztext.</p>
      {data.packages.map((p) => {
        const isOpen = openName === p.name;
        const hasMore = p.text !== undefined || !!p.notice;
        return (
          <Card key={p.name} className="!p-0 overflow-hidden">
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpenName(isOpen ? null : p.name)} aria-expanded={isOpen} disabled={!hasMore}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="text-xs text-mute">{[p.version && `Version ${p.version}`, p.license].filter(Boolean).join(' · ')}</span>
              </span>
              {hasMore && <Icon name="down" className={`h-5 w-5 shrink-0 text-mute transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
            </button>
            {isOpen && (
              <div className="space-y-2 border-t border-line px-4 py-3">
                {p.notice && <p className="whitespace-pre-wrap text-xs text-ink/85">{p.notice}</p>}
                {p.text !== undefined && <pre className="select-text whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-mute">{data.texts[p.text]}</pre>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
