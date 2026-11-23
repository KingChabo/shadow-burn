import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { buzz, say, sfx } from '../lib/fx';
import { preloadPose } from '../features/pose/preload';

export function Countdown({ onDone, preloadCamera }: { onDone: () => void; preloadCamera?: boolean }) {
  const [n, setN] = useState(3);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => { if (preloadCamera) preloadPose(); }, [preloadCamera]);
  useEffect(() => {
    if (n === 0) { sfx('go'); buzz(200); say('Los'); const t = setTimeout(() => done.current(), 600); return () => clearTimeout(t); }
    sfx('tick'); buzz(60); say(String(n));
    const t = setTimeout(() => setN(n - 1), 1000);
    return () => clearTimeout(t);
  }, [n]);
  return (
    <div className="fixed inset-0 z-50 bg-bg grid place-items-center">
      <AnimatePresence mode="popLayout">
        <motion.div key={n} initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className={`font-sport text-[11rem] leading-none ${n === 0 ? 'text-neon' : 'text-ink'}`}>
          {n === 0 ? 'LOS!' : n}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
