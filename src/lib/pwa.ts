/*
 * Browser side of the installable app: the service worker, push subscriptions and the install
 * prompt. Everything here runs in the browser only.
 */

const BASE = process.env.basePath || '';

export function serviceWorkerUrl() {
  // The dev server's build files keep their names between edits, so the worker mustn't cache them.
  return `${BASE}/sw.js${process.env.NODE_ENV === 'development' ? '?dev=1' : ''}`;
}

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Service workers need a secure context (https, or localhost).
  if (!window.isSecureContext) return;

  navigator.serviceWorker.register(serviceWorkerUrl(), { scope: `${BASE}/` }).catch(() => {});
}

export type PushSupport = 'supported' | 'insecure' | 'ios-needs-install' | 'unsupported';

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac with a touch screen.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function getPushSupport(): PushSupport {
  if (!window.isSecureContext) return 'insecure';
  // iOS only offers push to apps added to the Home Screen.
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported';
  }
  return 'supported';
}

export function urlBase64ToUint8Array(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function readyRegistration() {
  registerServiceWorker();
  // `ready` never settles if the worker fails to install; don't leave the button spinning.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('The notification service could not start. Reload and try again.')),
        15_000,
      ),
    ),
  ]);
}

export async function getPushSubscription() {
  if (getPushSupport() !== 'supported') return null;
  const registration = await navigator.serviceWorker.getRegistration(`${BASE}/`);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Asks for permission and subscribes. Resubscribes if the server's key has changed. */
export async function subscribeToPush(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser settings.'
        : 'Notifications were not allowed.',
    );
  }

  const registration = await readyRegistration();
  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  const existing = await registration.pushManager.getSubscription();

  if (existing) {
    const current = existing.options.applicationServerKey;
    const same =
      current &&
      new Uint8Array(current).length === applicationServerKey.length &&
      new Uint8Array(current).every((byte, i) => byte === applicationServerKey[i]);
    if (same) return existing;
    await existing.unsubscribe();
  }

  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
}

/* The install prompt (Chrome, Edge, Android). It fires once, early, so it's kept here. */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: BeforeInstallPromptEvent | null = null;
let listening = false;
const installListeners = new Set<() => void>();

export function listenForInstallPrompt() {
  if (listening) return;
  listening = true;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    installListeners.forEach(listener => listener());
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installListeners.forEach(listener => listener());
  });
}

export function subscribeInstallPrompt(listener: () => void) {
  installListeners.add(listener);
  return () => void installListeners.delete(listener);
}

export function canInstall() {
  return !!installPrompt;
}

export async function promptInstall() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  installListeners.forEach(listener => listener());
  return outcome === 'accepted';
}

/** "Chrome on Android", "Safari on iPhone"... for the device list. */
export function describeDevice(userAgent: string | null | undefined) {
  const ua = userAgent ?? '';
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /opr\/|opera/i.test(ua)
      ? 'Opera'
      : /samsungbrowser/i.test(ua)
        ? 'Samsung Internet'
        : /firefox|fxios/i.test(ua)
          ? 'Firefox'
          : /chrome|crios/i.test(ua)
            ? 'Chrome'
            : /safari/i.test(ua)
              ? 'Safari'
              : 'Browser';
  const os = /iphone/i.test(ua)
    ? 'iPhone'
    : /ipad/i.test(ua)
      ? 'iPad'
      : /android/i.test(ua)
        ? 'Android'
        : /windows/i.test(ua)
          ? 'Windows'
          : /mac os/i.test(ua)
            ? 'Mac'
            : /cros/i.test(ua)
              ? 'ChromeOS'
              : /linux/i.test(ua)
                ? 'Linux'
                : '';

  return os ? `${browser} on ${os}` : browser;
}
