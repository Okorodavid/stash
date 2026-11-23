/* The homepage vault: a 3D bank-vault door (three.js). Browser only: load it with import() after first paint.
   It draws one frame per set()/show() call, so whatever drives it (a timer, scroll) decides the motion. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const OPEN_ANGLE = (-108 * Math.PI) / 180;
// The canvas is wider than the vault so the open door has room to swing out to the left.
const VIEW = { w: 2.3, h: 1.5, full: 2.8 };
const HINGE_X = -0.9;

const steel = (color: number, roughness: number) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness });
const M = {
  gun: steel(0x2a3033, 0.42),
  steel: steel(0x8b9598, 0.3),
  bright: steel(0xd5dcde, 0.16),
  brass: steel(0xb9925a, 0.3),
  shelf: steel(0x6f6250, 0.45),
  inner: new THREE.MeshStandardMaterial({ color: 0x5a4020, metalness: 0.7, roughness: 0.55, side: THREE.BackSide }),
};

/** A mesh whose cylinder axis points at the viewer (z) instead of up. */
function disc(r: number, depth: number, mat: THREE.Material, z = 0, seg = 96) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.z = z;
  return m;
}
const ring = (r: number, tube: number, mat: THREE.Material, z: number) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 20, 120), mat);
  m.position.z = z;
  return m;
};
/** n copies of make() spaced evenly round a circle of radius r. */
function around(n: number, r: number, make: (angle: number) => THREE.Object3D, offset = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2;
    const m = make(a);
    m.position.x = Math.cos(a) * r;
    m.position.y = Math.sin(a) * r;
    g.add(m);
  }
  return g;
}

/* ---------- Coin faces: minted metal with the symbol struck into it, drawn on a canvas so no logo files are needed. ---------- */
type Ctx = CanvasRenderingContext2D;
type Kind = "btc" | "eth" | "usdc" | "sol" | "usdt";
const INK = { gold: ["#d9bd7c", "#8f6f33", "#3d2c0e"], silver: ["#d7dbde", "#868d92", "#2b3135"] }; // light, dark, struck symbol
const MARKS: Record<Kind, (c: Ctx) => void> = {
  btc(c) {
    c.font = "italic 900 150px Arial, sans-serif";
    c.fillText("B", 128, 136);
    c.fillRect(108, 58, 12, 26); c.fillRect(134, 58, 12, 26); c.fillRect(100, 188, 12, 26); c.fillRect(126, 188, 12, 26);
  },
  eth(c) {
    const poly = (pts: number[][], a: number) => { c.globalAlpha = a; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.fill(); };
    poly([[128, 36], [74, 130], [128, 104]], 0.7); poly([[128, 36], [182, 130], [128, 104]], 1);
    poly([[74, 130], [128, 162], [128, 104]], 0.55); poly([[182, 130], [128, 162], [128, 104]], 0.85);
    poly([[74, 144], [128, 220], [128, 176]], 0.7); poly([[182, 144], [128, 220], [128, 176]], 1);
    c.globalAlpha = 1;
  },
  usdc(c) {
    c.font = "700 132px Arial, sans-serif";
    c.fillText("$", 128, 134);
    c.lineWidth = 13; c.lineCap = "round";
    c.beginPath(); c.arc(128, 128, 88, Math.PI * 0.72, Math.PI * 1.28); c.stroke();
    c.beginPath(); c.arc(128, 128, 88, -Math.PI * 0.28, Math.PI * 0.28); c.stroke();
  },
  sol(c) {
    const bar = (y: number, lean: number) => { c.beginPath(); c.moveTo(70 + lean, y); c.lineTo(196 + lean, y); c.lineTo(186 - lean, y + 26); c.lineTo(60 - lean, y + 26); c.fill(); };
    bar(70, 8); bar(115, -8); bar(160, 8);
  },
  usdt(c) {
    c.fillRect(70, 62, 116, 26); c.fillRect(114, 62, 28, 136);
    c.lineWidth = 9;
    c.beginPath(); c.ellipse(128, 122, 74, 15, 0, 0, Math.PI * 2); c.stroke();
  },
};
const METAL: Record<Kind, "gold" | "silver"> = { btc: "gold", eth: "silver", usdc: "silver", sol: "gold", usdt: "gold" };
function mint(c: Ctx, kind: Kind) {
  const [light, dark, struck] = INK[METAL[kind]];
  const g = c.createRadialGradient(96, 84, 10, 128, 128, 140);
  g.addColorStop(0, light); g.addColorStop(1, dark);
  c.fillStyle = g; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.fill();
  c.strokeStyle = struck; c.globalAlpha = 0.55; c.lineWidth = 5;
  c.beginPath(); c.arc(128, 128, 112, 0, Math.PI * 2); c.stroke();
  c.globalAlpha = 1;
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillStyle = c.strokeStyle = struck;
  MARKS[kind](c);
}
function texture(draw: (c: Ctx) => void, size = 256) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const EDGE = { gold: 0xa8843f, silver: 0x9aa1a6 };
const KINDS = Object.keys(MARKS) as Kind[];
const coinMats = Object.fromEntries(KINDS.map((k) => {
  const face = new THREE.MeshStandardMaterial({ map: texture((c) => mint(c, k)), metalness: 0.9, roughness: 0.34 });
  return [k, [steel(EDGE[METAL[k]], 0.3), face, face]];
})) as unknown as Record<Kind, THREE.Material[]>;
const coinGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.032, 48);
function coin(kind: Kind, standing: boolean) {
  const m = new THREE.Mesh(coinGeo, coinMats[kind]);
  if (standing) m.rotation.set(Math.PI / 2, Math.PI / 2, 0); // face the viewer, symbol upright
  return m;
}

/* ---------- What the door shows at a feature stop (variant D): one glowing sign. ---------- */
export type Sign = "limit" | "wait" | "guard" | "goal" | "earn";
const SIGNS: Record<Sign, string> = {
  limit: "M4 15a8 8 0 1 1 16 0M12 15l4-5M3 19h18",
  wait: "M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9",
  guard: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4",
  goal: "M12 4a8 8 0 1 0 .01 0M12 8a4 4 0 1 0 .01 0M12 11.6a.4 .4 0 1 0 .01 0",
  earn: "M4 17l5-5 4 3 7-8M15 7h5v5",
};
const signTexture = (d: string) => texture((c) => {
  c.scale(512 / 24, 512 / 24);
  c.strokeStyle = "#5eead4"; c.lineWidth = 1.5; c.lineCap = c.lineJoin = "round";
  c.shadowColor = "#2dd4bf"; c.shadowBlur = 40;
  c.stroke(new Path2D(d));
}, 512);

function build() {
  const rig = new THREE.Group(); // everything that rolls

  // The drum: a stepped steel collar round the opening.
  const profile = [[0.74, -0.9], [1, -0.9], [1, -0.06], [0.96, 0], [0.86, 0], [0.84, -0.03], [0.815, -0.03], [0.815, -0.16], [0.74, -0.16], [0.74, -0.9]];
  const drum = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), 128), M.gun);
  drum.rotation.x = Math.PI / 2;
  rig.add(drum, ring(0.985, 0.022, M.steel, -0.03), ring(0.83, 0.012, M.bright, 0));
  rig.add(around(16, 0.91, () => disc(0.022, 0.03, M.steel, 0.008, 20), 0.2));

  // Inside: warm-lit walls, three shelves, coins.
  const room = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.76, 96, 1, true), M.inner);
  walls.rotation.x = Math.PI / 2; walls.position.z = -0.54;
  const back = disc(0.74, 0.02, new THREE.MeshStandardMaterial({ color: 0x4a3418, metalness: 0.6, roughness: 0.6 }), -0.92);
  const glow = new THREE.PointLight(0xffc266, 5.5, 3, 1.6);
  glow.position.set(0, 0.35, -0.3);
  room.add(walls, back, glow);
  const treasure = new THREE.Group();
  [-0.5, -0.14, 0.22].forEach((y, row) => {
    const half = Math.sqrt(0.74 * 0.74 - y * y) - 0.02;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.024, 0.66), M.shelf);
    shelf.position.set(0, y - 0.012, -0.55);
    treasure.add(shelf);
    const room4 = Math.sqrt(0.74 * 0.74 - (y + 0.26) ** 2) - 0.14; // coins must clear the curved wall at their top edge
    const n = Math.max(1, Math.floor((room4 * 2) / 0.27) + 1);
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -room4 + (i / (n - 1)) * room4 * 2;
      const kind = KINDS[(i + row * 2) % KINDS.length];
      const front = coin(kind, true);
      front.position.set(x, y + 0.125, -0.3 - (i % 2) * 0.05);
      front.rotation.x += -0.14; // lean back against the stack
      treasure.add(front);
      const tall = 3 + ((i * 7 + row * 3) % 5);
      for (let k = 0; k < tall; k++) {
        const flat = coin(KINDS[(i + row * 2 + 2) % KINDS.length], false);
        flat.position.set(x * 0.92, y + 0.016 + k * 0.034, -0.62);
        flat.rotation.y = k * 0.7;
        treasure.add(flat);
      }
    }
  });
  room.add(treasure);
  const veil = disc(0.74, 0.004, new THREE.MeshBasicMaterial({ color: 0x030807, transparent: true, opacity: 0.78 }), -0.2);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
  sign.position.z = -0.17;
  veil.visible = sign.visible = false;
  room.add(veil, sign);
  rig.add(room);

  // The door swings on a hinge at the left; its parts are placed relative to the door's centre.
  const swing = new THREE.Group();
  swing.position.set(HINGE_X, 0, 0.06);
  const door = new THREE.Group();
  door.position.set(-HINGE_X, 0, -0.06);
  swing.add(door);
  door.add(disc(0.81, 0.1, M.gun, 0.05), disc(0.73, 0.16, M.steel, -0.08));
  door.add(ring(0.72, 0.03, M.steel, 0.1), ring(0.5, 0.014, M.bright, 0.1), disc(0.36, 0.03, M.steel, 0.11));
  door.add(around(20, 0.62, () => disc(0.026, 0.04, M.bright, 0.11, 20)));
  // Hand wheel.
  const wheel = new THREE.Group();
  wheel.position.z = 0.24;
  wheel.add(ring(0.28, 0.026, M.bright, 0), disc(0.075, 0.1, M.brass, 0), disc(0.045, 0.3, M.steel, -0.1, 24));
  wheel.add(around(6, 0.14, (a) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 16), M.bright);
    s.rotation.z = a - Math.PI / 2;
    return s;
  }));
  const cap = disc(0.05, 0.11, new THREE.MeshStandardMaterial({ color: 0x0f766e, emissive: 0x2dd4bf, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3 }), 0.006, 32);
  wheel.add(cap);
  door.add(wheel);
  // Four latch bars slide out over the collar when it locks.
  const latches = [0, 1, 2, 3].map((i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.11, 0.05), M.bright);
    bar.rotation.z = a;
    bar.userData.a = a;
    door.add(bar);
    return bar;
  });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfbbf24, toneMapped: false }));
  lamp.position.set(0, 0.43, 0.125);
  door.add(lamp);
  // Inside face: the polished bolt work you see when it stands open.
  const works = new THREE.Group();
  works.position.z = -0.165;
  works.add(disc(0.7, 0.01, M.bright, 0), ring(0.66, 0.02, M.steel, -0.01), ring(0.3, 0.016, M.brass, -0.012), disc(0.11, 0.06, M.brass, -0.03));
  works.add(around(18, 0.38, (a) => {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.54, 12), M.steel);
    rod.rotation.z = a - Math.PI / 2;
    rod.position.z = -0.018;
    return rod;
  }));
  door.add(works);
  // Hinge post and the two arms that carry the door.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.62, 32), M.steel);
  swing.add(post);
  [0.2, -0.2].forEach((y) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.05), M.steel);
    arm.position.set(0.15, y, 0.02);
    swing.add(arm);
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.1), M.gun);
    lug.position.set(HINGE_X - 0.02, y, 0);
    rig.add(lug);
  });
  rig.add(swing);

  return { rig, swing, wheel, latches, lamp, treasure, veil, sign };
}

export function create(el: HTMLElement) {
  // The canvas overhangs its box (90% left, 25% top and bottom) to match VIEW; a soft shadow sits under the drum.
  el.innerHTML = `<div style="position:absolute;inset:0;will-change:transform">
    <div style="position:absolute;left:6%;right:6%;bottom:-9%;height:9%;border-radius:50%;background:rgb(0 0 0/.65);filter:blur(14px)"></div>
    <canvas aria-hidden="true" style="position:absolute;left:-90%;top:-25%;width:230%;height:150%"></canvas>
  </div>`;
  const move = el.firstElementChild as HTMLElement, canvas = el.querySelector("canvas")!;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xbdeee8, 2.2);
  key.position.set(2.5, 3, 5);
  const rim = new THREE.DirectionalLight(0x2dd4bf, 1.4);
  rim.position.set(-4, -1, 2);
  scene.add(key, rim);

  const v = build();
  scene.add(v.rig);
  const camera = new THREE.PerspectiveCamera(30, VIEW.full / VIEW.h, 0.1, 30);
  camera.position.set(0.55, 0.3, 5.6);
  camera.lookAt(0, 0, 0);

  const signs: Partial<Record<Sign, THREE.Texture>> = {};
  const draw = () => renderer.render(scene, camera);
  function fit() {
    const s = el.offsetWidth;
    if (!s) return;
    renderer.setSize(VIEW.w * s, VIEW.h * s, false);
    camera.setViewOffset(VIEW.full * s, VIEW.h * s, 0, 0, VIEW.w * s, VIEW.h * s);
    draw();
  }
  const watch = new ResizeObserver(fit);
  watch.observe(el);
  fit();

  let shown: Sign | "coins" = "coins";
  return {
    el,
    /** door: 0 open .. 1 shut. lock: 0..1 latches out. spin: wheel degrees. x: px travelled (the roll follows from it).
        shift: px moved sideways without rolling, to make room for the open door. */
    set({ door = 1, lock = 0, spin = 0, x = 0, shift = 0 }: { door?: number; lock?: number; spin?: number; x?: number; shift?: number }) {
      v.swing.rotation.y = OPEN_ANGLE * (1 - door);
      v.wheel.rotation.z = (-spin * Math.PI) / 180;
      v.latches.forEach((bar) => {
        const r = 0.6 + 0.2 * lock;
        bar.position.set(Math.cos(bar.userData.a) * r, Math.sin(bar.userData.a) * r, 0.125);
      });
      const locked = lock > 0.98;
      v.lamp.material.color.set(locked ? 0x2dd4bf : 0xfbbf24);
      move.style.transform = `translate3d(${(x + shift).toFixed(1)}px,0,0)`;
      // A wheel that travels x turns x / r radians; anything else looks like sliding.
      v.rig.rotation.z = -x / (el.offsetWidth / 2);
      draw();
    },
    /** What sits inside: "coins", or one of the feature signs. */
    show(name: Sign | "coins") {
      if (name === shown) return;
      shown = name;
      const d = name === "coins" ? undefined : SIGNS[name];
      v.veil.visible = v.sign.visible = !!d;
      if (d) {
        v.sign.material.map = signs[name as Sign] ??= signTexture(d);
        v.sign.material.needsUpdate = true;
      }
      draw();
    },
    /** Frees the GPU context; the page can then mount a fresh vault (dev double-mounts). */
    dispose() {
      watch.disconnect();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      el.replaceChildren();
    },
  };
}

/** The whole story on one dial: 0 open, 0.5 shut, 0.7 locked, 1 rolled `travel` px away. */
export function story(p: number, travel: number) {
  const roll = clamp((p - 0.72) / 0.28);
  return {
    door: ease(clamp(p / 0.5)),
    spin: 540 * ease(clamp((p - 0.42) / 0.28)),
    lock: clamp((p - 0.56) / 0.12),
    x: roll * roll * travel,
  };
}
