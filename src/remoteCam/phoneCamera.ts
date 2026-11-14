import type { DataConnection, MediaConnection, Peer as PeerT } from 'peerjs';

/**
 * The phone as the PC's camera for ALQAMI's AR and XR: the PC shows a QR code, the phone opens it and streams its
 * back camera plus its motion sensors to the PC over WebRTC (peer to peer; only the short connection handshake goes
 * through PeerJS's free public server, no video).
 *
 * On the PC nothing else needs to change: while a phone is connected, camera requests (getUserMedia) get the phone's
 * camera, and the phone's orientation and motion are replayed as the browser's own deviceorientation/devicemotion
 * events, so the AR world, scan mode, Teach and Jawahiri's AR view follow the phone as if it were the PC's own.
 */

export type HostStatus = { state: 'waiting'; url: string } | { state: 'connected'; label: string } | { state: 'error'; message: string };

const loadPeer = async () => (await import('peerjs')).Peer;
// The app's own address (the site's base path is relative, so resolve it against this page).
const appUrl = () => new URL(import.meta.env.BASE_URL || './', location.href).href.split('?')[0];
const newId = () => `alqami-cam-${Math.random().toString(36).slice(2, 8)}`;

type Orientation = { t: 'o'; a: number | null; b: number | null; g: number | null; abs: boolean };
type Motion = { t: 'm'; r: [number, number, number] | null; ag: [number, number, number] | null; i: number };

/** The PC side: waits for a phone, then lends its camera and sensors to the page. */
/** The PC's connection, for other parts of the app ("View on phone"); events tell them when a phone (dis)connects. */
export let activePhone: PhoneCameraHost | null = null;
const announce = () => window.dispatchEvent(new CustomEvent('alqami:phone', { detail: { connected: Boolean(activePhone?.connected) } }));

/** What the PC can ask the phone to show. */
export type PhoneCommand = { t: 'show'; model: string; title: string } | { t: 'hide' };

export class PhoneCameraHost {
  private peer: PeerT | null = null;
  private stream: MediaStream | null = null;
  private original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  private call: MediaConnection | null = null;
  private conn: DataConnection | null = null;
  private cmd: DataConnection | null = null;

  constructor(private onStatus: (s: HostStatus) => void) {}

  get connected() {
    return Boolean(this.stream);
  }

  async start() {
    const Peer = await loadPeer();
    const id = newId();
    const peer = new Peer(id);
    this.peer = peer;
    peer.on('open', () => this.onStatus({ state: 'waiting', url: `${appUrl()}?camera=${id}` }));
    peer.on('error', (e) => this.onStatus({ state: 'error', message: String(e.type || e.message || e) }));
    peer.on('call', (call) => {
      this.call?.close();
      this.call = call;
      call.answer();
      call.on('stream', (s) => {
        this.stream = s;
        this.install();
        activePhone = this;
        announce();
        const track = s.getVideoTracks()[0];
        const set = track?.getSettings();
        this.onStatus({ state: 'connected', label: set?.width ? `${set.width}×${set.height}` : 'camera' });
      });
      call.on('close', () => this.lost());
    });
    peer.on('connection', (conn) => {
      // Two channels from the phone: sensors (fast, may drop a reading) and commands (reliable).
      if (conn.label === 'cmd') {
        this.cmd?.close();
        this.cmd = conn;
        return;
      }
      this.conn?.close();
      this.conn = conn;
      conn.on('data', (d) => this.replay(d as Orientation | Motion));
      conn.on('close', () => this.lost());
    });
  }

  /** While connected, camera requests on this page get the phone's camera (the microphone stays the PC's). */
  private install() {
    const self = this;
    navigator.mediaDevices.getUserMedia = async function (constraints?: MediaStreamConstraints) {
      if (!self.stream || !constraints?.video) return self.original(constraints);
      const out = new MediaStream(self.stream.getVideoTracks().map((t) => t.clone()));
      if (constraints.audio) (await self.original({ audio: constraints.audio })).getAudioTracks().forEach((t) => out.addTrack(t));
      return out;
    };
  }

  /** The phone's sensors, as this page's own sensor events. */
  private replay(d: Orientation | Motion) {
    try {
      if (d.t === 'o') {
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: d.a, beta: d.b, gamma: d.g, absolute: d.abs }));
      } else if (d.t === 'm') {
        window.dispatchEvent(
          new DeviceMotionEvent('devicemotion', {
            interval: d.i,
            rotationRate: d.r ? { alpha: d.r[0], beta: d.r[1], gamma: d.r[2] } : undefined,
            accelerationIncludingGravity: d.ag ? { x: d.ag[0], y: d.ag[1], z: d.ag[2] } : undefined,
          })
        );
      }
    } catch {
      // A browser without these event constructors: the camera still works.
    }
  }

  /** Show a 3D object on the phone (it opens over the camera page, with AR in the visitor's room). */
  show(model: string, title: string) {
    if (!this.cmd?.open) return false;
    this.cmd.send({ t: 'show', model: new URL(model, location.href).href, title } satisfies PhoneCommand);
    return true;
  }

  private lost() {
    this.stream = null;
    if (activePhone === this) activePhone = null;
    announce();
    navigator.mediaDevices.getUserMedia = this.original;
    if (this.peer && !this.peer.destroyed) this.onStatus({ state: 'waiting', url: `${appUrl()}?camera=${this.peer.id}` });
  }

  stop() {
    navigator.mediaDevices.getUserMedia = this.original;
    this.stream = null;
    if (activePhone === this) activePhone = null;
    announce();
    this.cmd?.close();
    this.call?.close();
    this.conn?.close();
    this.peer?.destroy();
    this.peer = null;
  }
}

/** The phone side: sends its back camera and its motion to the PC with this ID. Call from a tap (iPhone asks). */
export async function sendPhoneCamera(
  hostId: string,
  video: HTMLVideoElement,
  onStatus: (s: string) => void,
  onCommand: (c: PhoneCommand) => void = () => undefined
): Promise<() => void> {
  const { requestMotionPermission } = await import('../components/xr/spatial/motionPermission');
  const motionOk = await requestMotionPermission().catch(() => false);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play().catch(() => undefined);

  const Peer = await loadPeer();
  const peer = new Peer();
  let lock: { release(): Promise<void> } | null = null;
  try {
    lock = await (navigator as any).wakeLock?.request('screen');
  } catch {
    // the screen may dim; the stream keeps going while the page is open
  }

  const cleanups: Array<() => void> = [];
  peer.on('error', (e) => onStatus(`خطأ · Error: ${e.type || e.message}`));
  peer.on('open', () => {
    onStatus('يتصل… · Connecting…');
    const call = peer.call(hostId, stream);
    const conn = peer.connect(hostId, { reliable: false, serialization: 'json' });
    const cmd = peer.connect(hostId, { reliable: true, serialization: 'json', label: 'cmd' });
    cmd.on('data', (d) => onCommand(d as PhoneCommand));
    call.on('close', () => onStatus('انقطع الاتصال · Disconnected'));
    conn.on('open', () => {
      onStatus(motionOk ? 'متصل — الكاميرا والحركة تُرسلان · Connected: camera and motion' : 'متصل — الكاميرا فقط · Connected: camera only');
      let lastMotion = 0;
      const onO = (e: DeviceOrientationEvent) => conn.open && conn.send({ t: 'o', a: e.alpha, b: e.beta, g: e.gamma, abs: e.absolute } satisfies Orientation);
      const onM = (e: DeviceMotionEvent) => {
        const now = performance.now();
        if (!conn.open || now - lastMotion < 33) return;
        lastMotion = now;
        const r = e.rotationRate;
        const g = e.accelerationIncludingGravity;
        conn.send({
          t: 'm',
          i: e.interval,
          r: r ? [r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0] : null,
          ag: g ? [g.x ?? 0, g.y ?? 0, g.z ?? 0] : null,
        } satisfies Motion);
      };
      window.addEventListener('deviceorientation', onO);
      window.addEventListener('devicemotion', onM);
      cleanups.push(() => window.removeEventListener('deviceorientation', onO), () => window.removeEventListener('devicemotion', onM));
    });
  });

  return () => {
    cleanups.forEach((c) => c());
    stream.getTracks().forEach((t) => t.stop());
    void lock?.release();
    peer.destroy();
  };
}
