type PermFn = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** iOS braucht eine explizite Erlaubnis (nur per Klick). Android/Desktop: sofort true. */
export async function requestMotionPermission(): Promise<boolean> {
  try {
    const DOE = (window as unknown as { DeviceOrientationEvent?: PermFn }).DeviceOrientationEvent;
    if (DOE?.requestPermission) return (await DOE.requestPermission()) === 'granted';
    const DME = (window as unknown as { DeviceMotionEvent?: PermFn }).DeviceMotionEvent;
    if (DME?.requestPermission) return (await DME.requestPermission()) === 'granted';
    return 'DeviceOrientationEvent' in window;
  } catch {
    return false;
  }
}
