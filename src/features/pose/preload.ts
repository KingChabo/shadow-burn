/** Lädt TF.js + MoveNet erst bei Bedarf (eigener Chunk, App startet schneller). */
export function preloadPose(): void {
  void import('./movenet').then((m) => m.preload());
}
