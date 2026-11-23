import type { CSSProperties, ReactNode } from 'react';
import { backdropById, tagById, titleById, type CosLook } from '../lib/cosmetics';

const fxClass = (fx?: string) => (fx ? `cos-fx cos-${fx}` : '');

/** Name in der Plakette aus dem Gem-Shop, darunter optional der gekaufte Titel. */
export function NameTag({ name, cs, suffix, size = 'md', className = '', showTitle = true }: {
  name: string; cs?: CosLook; suffix?: ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string; showTitle?: boolean;
}) {
  const t = tagById(cs?.tag);
  const title = titleById(cs?.title).text;
  const plain = t.id === 'tag_plain';
  const pad = size === 'lg' ? 'px-3 py-1 text-xl' : size === 'sm' ? 'px-1.5 py-px text-[12px]' : 'px-2 py-0.5 text-[15px]';
  const style: CSSProperties = plain ? {} : {
    background: t.bg, color: t.text, border: `1px solid ${t.border}`,
    boxShadow: t.glow ? `0 0 10px ${t.glow}66` : undefined,
  };
  return (
    <span className={`inline-flex min-w-0 max-w-full flex-col ${className}`}>
      <span className={`inline-flex min-w-0 max-w-full items-center gap-1 self-start font-extrabold ${plain ? '' : `rounded-lg ${pad} ${fxClass(t.fx)}`}`} style={style}>
        <span className="relative z-[2] truncate">{name}</span>{suffix && <span className="relative z-[2] shrink-0">{suffix}</span>}
      </span>
      {showTitle && title && <span className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-[0.14em] text-neon">{title}</span>}
    </span>
  );
}

/** Hintergrund hinter dem Avatar (Profil, Spieler-Detail, Shop) */
export function AvatarBackdrop({ cs, className = '', children }: { cs?: CosLook; className?: string; children: ReactNode }) {
  const b = backdropById(cs?.backdrop);
  if (b.id === 'bd_none') return <div className={className}>{children}</div>;
  return (
    <div className={`${className} ${fxClass(b.fx)}`} style={{ background: b.bg }}>{children}</div>
  );
}
