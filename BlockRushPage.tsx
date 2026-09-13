'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type Platform = {
  mesh: THREE.Mesh;
  bounds: THREE.Box3;
  checkpoint?: number;
  hazard?: boolean;
  moving?: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    speed: number;
  };
};

type Coin = {
  mesh: THREE.Mesh;
  taken: boolean;
};

type Keys = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
};

type SoftwarePlatform = {
  name: string;
  size: THREE.Vector3;
  position: THREE.Vector3;
  bounds: THREE.Box3;
  color: string;
  checkpoint?: number;
  hazard?: boolean;
  moving?: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    speed: number;
  };
};

type SoftwareCoin = {
  position: THREE.Vector3;
  taken: boolean;
};

const playerStart = new THREE.Vector3(0, 5, 0);
const finishZ = 292;
const totalCoins = 21;
const playerHalfSize = new THREE.Vector3(2, 0, 1);
const playerHeight = 6.2;
const coinHalfSize = new THREE.Vector3(1.25, 1.25, 1.25);
const checkpointColors = [0x2f80ed, 0x27ae60, 0xf2c94c, 0xf2994a, 0xeb5757, 0x9b51e0, 0x2d9cdb, 0xf7f7ff];

function intersects(a: THREE.Box3, b: THREE.Box3) {
  return a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y && a.max.z >= b.min.z && a.min.z <= b.max.z;
}

function colorToHex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function makeBounds(position: THREE.Vector3, size: THREE.Vector3) {
  const half = size.clone().multiplyScalar(0.5);
  return new THREE.Box3(position.clone().sub(half), position.clone().add(half));
}

function makeSoftwareCourse() {
  const platforms: SoftwarePlatform[] = [];
  const coins: SoftwareCoin[] = [];

  const addBox = (name: string, sizeTuple: [number, number, number], positionTuple: [number, number, number], color: number, options: Omit<Partial<SoftwarePlatform>, 'bounds' | 'color' | 'name' | 'position' | 'size'> = {}) => {
    const size = new THREE.Vector3(sizeTuple[0], sizeTuple[1], sizeTuple[2]);
    const position = new THREE.Vector3(positionTuple[0], positionTuple[1], positionTuple[2]);
    platforms.push({
      name,
      size,
      position,
      bounds: makeBounds(position, size),
      color: colorToHex(color),
      ...options,
    });
  };

  for (let i = 0; i < 8; i += 1) {
    const z = i * 42;
    addBox(`checkpoint-${i + 1}`, [18, 2, 18], [0, 0, z], checkpointColors[i], { checkpoint: i + 1 });

    if (i < 7) {
      addBox(`bridge-${i + 1}`, [7, 1.4, 18], [0, 0.1, z + 19], 0xffffff);
      addBox(`left-hop-${i + 1}`, [7, 1.5, 7], [-9, 1.2, z + 29], checkpointColors[i]);
      addBox(`right-hop-${i + 1}`, [7, 1.5, 7], [9, 2.5, z + 35], checkpointColors[i]);

      if (i % 2 === 0) {
        addBox(`lava-${i + 1}`, [31, 0.8, 4], [0, 1.15, z + 25], 0xff3158, { hazard: true });
      } else {
        addBox(`moving-${i + 1}`, [9, 1.4, 7], [-12, 2, z + 24], 0x76d7ff, {
          moving: {
            from: new THREE.Vector3(-12, 2, z + 24),
            to: new THREE.Vector3(12, 2, z + 24),
            speed: 0.75 + i * 0.05,
          },
        });
      }

      for (let c = 0; c < 3; c += 1) {
        coins.push({ position: new THREE.Vector3((c - 1) * 7, 5.2, z + 11 + c * 8), taken: false });
      }
    }
  }

  return { platforms, coins };
}

function SoftwareObby({ onStatus }: { onStatus: (message: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keys = useRef<Keys>({ forward: false, back: false, left: false, right: false, jump: false, sprint: false });
  const player = useRef(playerStart.clone());
  const velocity = useRef(new THREE.Vector3());
  const checkpoint = useRef(1);
  const checkpointPosition = useRef(playerStart.clone());
  const finished = useRef(false);
  const course = useRef(makeSoftwareCourse());
  const [stage, setStage] = useState(1);
  const [coinCount, setCoinCount] = useState(0);
  const [hasWon, setHasWon] = useState(false);

  const resetPlayer = useCallback(() => {
    player.current.copy(checkpointPosition.current);
    velocity.current.set(0, 0, 0);
    onStatus(`Back to checkpoint ${checkpoint.current}.`);
  }, [onStatus]);

  const restartGame = useCallback(() => {
    course.current = makeSoftwareCourse();
    player.current.copy(playerStart);
    velocity.current.set(0, 0, 0);
    checkpoint.current = 1;
    checkpointPosition.current.copy(playerStart);
    finished.current = false;
    setStage(1);
    setCoinCount(0);
    setHasWon(false);
    onStatus('Software 3D mode is running smoothly.');
  }, [onStatus]);

  const winGame = useCallback((message: string) => {
    if (finished.current) return;
    finished.current = true;
    setHasWon(true);
    onStatus(message);
  }, [onStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;

    onStatus('Software 3D mode is running smoothly.');

    const playerBox = new THREE.Box3();
    const platformSize = new THREE.Vector3();
    const coinBox = new THREE.Box3();
    const finishBox = makeBounds(new THREE.Vector3(0, 7, finishZ), new THREE.Vector3(22, 16, 3));
    const desired = new THREE.Vector3();
    const clock = new THREE.Clock();

    let width = 0;
    let height = 0;
    let frame = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = width;
      canvas.height = height;
    };

    const setPlayerBox = () => {
      const position = player.current;
      playerBox.min.set(position.x - playerHalfSize.x, position.y, position.z - playerHalfSize.z);
      playerBox.max.set(position.x + playerHalfSize.x, position.y + playerHeight, position.z + playerHalfSize.z);
    };

    const setKey = (code: string, down: boolean) => {
      if (code === 'KeyW' || code === 'ArrowUp') keys.current.forward = down;
      if (code === 'KeyS' || code === 'ArrowDown') keys.current.back = down;
      if (code === 'KeyA' || code === 'ArrowLeft') keys.current.left = down;
      if (code === 'KeyD' || code === 'ArrowRight') keys.current.right = down;
      if (code === 'Space') keys.current.jump = down;
      if (code === 'ShiftLeft' || code === 'ShiftRight') keys.current.sprint = down;
    };

    const keydown = (event: KeyboardEvent) => {
      setKey(event.code, true);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    };
    const keyup = (event: KeyboardEvent) => setKey(event.code, false);

    const drawBlock = (platform: SoftwarePlatform) => {
      const cameraZ = player.current.z - 14;
      const scale = Math.max(8, Math.min(15, width / 84));
      const zScale = scale * 0.8;
      const yScale = scale * 0.82;
      const screenX = width / 2 + platform.position.x * scale;
      const screenY = height * 0.64 - (platform.position.z - cameraZ) * zScale - platform.position.y * yScale;
      const blockWidth = platform.size.x * scale;
      const blockDepth = platform.size.z * zScale;
      const blockHeight = Math.max(8, platform.size.y * yScale);
      const tilt = blockDepth * 0.22;
      if (screenY < -80 || screenY > height + 120) return;

      context.fillStyle = 'rgba(22, 32, 44, 0.18)';
      context.fillRect(screenX - blockWidth / 2 + 8, screenY + tilt + blockHeight, blockWidth, Math.max(5, blockDepth * 0.22));
      context.fillStyle = platform.hazard ? '#b81d3d' : '#566174';
      context.fillRect(screenX - blockWidth / 2, screenY + tilt, blockWidth, blockHeight);
      context.fillStyle = platform.color;
      context.beginPath();
      context.moveTo(screenX - blockWidth / 2, screenY + tilt);
      context.lineTo(screenX - blockWidth / 2 + tilt, screenY);
      context.lineTo(screenX + blockWidth / 2 + tilt, screenY);
      context.lineTo(screenX + blockWidth / 2, screenY + tilt);
      context.closePath();
      context.fill();
      context.strokeStyle = 'rgba(22, 32, 44, 0.42)';
      context.lineWidth = 2;
      context.stroke();
    };

    const draw = (elapsed: number) => {
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#9bdcff');
      gradient.addColorStop(0.58, '#d9f3ff');
      gradient.addColorStop(1, '#6bd66d');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      const visiblePlatforms = course.current.platforms
        .filter((platform) => platform.position.z > player.current.z - 46 && platform.position.z < player.current.z + 160)
        .sort((a, b) => b.position.z - a.position.z);
      for (const platform of visiblePlatforms) drawBlock(platform);

      const scale = Math.max(8, Math.min(15, width / 84));
      const zScale = scale * 0.8;
      const yScale = scale * 0.82;
      const cameraZ = player.current.z - 14;

      for (const coin of course.current.coins) {
        if (coin.taken || coin.position.z < player.current.z - 35 || coin.position.z > player.current.z + 145) continue;
        const screenX = width / 2 + coin.position.x * scale;
        const screenY = height * 0.64 - (coin.position.z - cameraZ) * zScale - coin.position.y * yScale + Math.sin(elapsed * 5 + coin.position.z) * 4;
        context.fillStyle = '#ffd64a';
        context.beginPath();
        context.ellipse(screenX, screenY, 9, 13, elapsed * 3, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#8a6400';
        context.stroke();
      }

      const avatarX = width / 2 + player.current.x * scale;
      const avatarY = height * 0.64 - 14 * zScale - player.current.y * yScale;
      context.fillStyle = 'rgba(22, 32, 44, 0.18)';
      context.beginPath();
      context.ellipse(avatarX, avatarY + 52, 24, 8, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#222736';
      context.fillRect(avatarX - 13, avatarY + 24, 10, 24);
      context.fillRect(avatarX + 3, avatarY + 24, 10, 24);
      context.fillStyle = '#2f80ed';
      context.fillRect(avatarX - 16, avatarY - 12, 32, 38);
      context.fillRect(avatarX - 28, avatarY - 8, 10, 34);
      context.fillRect(avatarX + 18, avatarY - 8, 10, 34);
      context.fillStyle = '#ffd3aa';
      context.fillRect(avatarX - 12, avatarY - 36, 24, 24);
    };

    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (document.hidden) {
        clock.getDelta();
        return;
      }

      const dt = Math.min(clock.getDelta(), 0.033);
      const elapsed = clock.elapsedTime;

      for (const platform of course.current.platforms) {
        if (!platform.moving) continue;
        const t = (Math.sin(elapsed * platform.moving.speed * Math.PI) + 1) / 2;
        platform.position.lerpVectors(platform.moving.from, platform.moving.to, t);
        platform.bounds.setFromCenterAndSize(platform.position, platform.bounds.getSize(platformSize));
      }

      desired.set(Number(keys.current.left) - Number(keys.current.right), 0, Number(keys.current.forward) - Number(keys.current.back));
      const speed = keys.current.sprint ? 34 : 23;
      if (desired.lengthSq() > 0) {
        desired.normalize();
        velocity.current.x = THREE.MathUtils.lerp(velocity.current.x, desired.x * speed, 0.18);
        velocity.current.z = THREE.MathUtils.lerp(velocity.current.z, desired.z * speed, 0.18);
      } else {
        velocity.current.x *= 0.82;
        velocity.current.z *= 0.82;
      }

      velocity.current.y -= 72 * dt;
      player.current.addScaledVector(velocity.current, dt);
      setPlayerBox();

      let grounded = false;
      for (const platform of course.current.platforms) {
        if (!intersects(playerBox, platform.bounds)) continue;
        if (platform.hazard) {
          resetPlayer();
          break;
        }

        if (velocity.current.y <= 0 && playerBox.min.y >= platform.bounds.max.y - 1.2) {
          player.current.y += platform.bounds.max.y - playerBox.min.y;
          velocity.current.y = 0;
          grounded = true;

          if (platform.checkpoint && platform.checkpoint > checkpoint.current) {
            checkpoint.current = platform.checkpoint;
            checkpointPosition.current.set(platform.position.x, platform.bounds.max.y + 5, platform.position.z);
            setStage(platform.checkpoint);
            onStatus(`Checkpoint ${platform.checkpoint} reached.`);
          }
        }
      }

      if (grounded && keys.current.jump) velocity.current.y = 34;
      if (player.current.y < -22) resetPlayer();

      setPlayerBox();
      for (const coin of course.current.coins) {
        if (coin.taken) continue;
        coinBox.setFromCenterAndSize(coin.position, coinHalfSize);
        if (intersects(playerBox, coinBox)) {
          coin.taken = true;
          setCoinCount((current) => {
            const next = current + 1;
            if (next >= totalCoins) winGame('You got every coin. You win!');
            else onStatus(`Coin collected. ${totalCoins - next} left.`);
            return next;
          });
        }
      }

      if (!finished.current && intersects(playerBox, finishBox)) winGame('You reached the finish portal. You win!');
      draw(elapsed);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, [onStatus, resetPlayer, winGame]);

  return (
    <div className="software-stage">
      <canvas ref={canvasRef} aria-label="Playable software-rendered 3D obstacle course" />
      <div className="software-badge">Canvas 3D</div>
      <div className="software-hud">
        <div>
          <span>Stage</span>
          <strong>{stage}/8</strong>
        </div>
        <div>
          <span>Coins</span>
          <strong>{coinCount}/{totalCoins}</strong>
        </div>
        <button type="button" onClick={resetPlayer}>Reset</button>
      </div>
      {hasWon && (
        <div className="win-screen" role="status" aria-live="polite">
          <div className="confetti" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <p>You win!</p>
          <h1>Every coin is yours</h1>
          <button type="button" onClick={restartGame}>Play again</button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [gameKey, setGameKey] = useState(0);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const keys = useRef<Keys>({ forward: false, back: false, left: false, right: false, jump: false, sprint: false });
  const velocity = useRef(new THREE.Vector3());
  const player = useRef<THREE.Group | null>(null);
  const platforms = useRef<Platform[]>([]);
  const coins = useRef<Coin[]>([]);
  const checkpoint = useRef(1);
  const checkpointPosition = useRef(playerStart.clone());
  const finished = useRef(false);
  const collectedCoins = useRef(0);
  const [stage, setStage] = useState(1);
  const [coinCount, setCoinCount] = useState(0);
  const [hasWon, setHasWon] = useState(false);
  const [canUseWebGL, setCanUseWebGL] = useState(true);
  const [status, setStatus] = useState('Get to the glowing finish portal.');

  const resetPlayer = useCallback(() => {
    if (!player.current) return;
    player.current.position.copy(checkpointPosition.current);
    velocity.current.set(0, 0, 0);
    setStatus(`Back to checkpoint ${checkpoint.current}.`);
  }, []);

  const winGame = useCallback((message: string) => {
    if (finished.current) return;
    finished.current = true;
    setHasWon(true);
    setStatus(message);
  }, []);

  const restartGame = useCallback(() => {
    keys.current = { forward: false, back: false, left: false, right: false, jump: false, sprint: false };
    velocity.current.set(0, 0, 0);
    checkpoint.current = 1;
    checkpointPosition.current.copy(playerStart);
    finished.current = false;
    collectedCoins.current = 0;
    setStage(1);
    setCoinCount(0);
    setHasWon(false);
    setStatus('Get to the glowing finish portal.');
    setGameKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    platforms.current = [];
    coins.current = [];
    player.current = null;
    finished.current = false;
    collectedCoins.current = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9bdcff);
    scene.fog = new THREE.Fog(0x9bdcff, 100, 380);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, depth: true, stencil: false, powerPreference: 'high-performance' });
    } catch {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, depth: true, stencil: false });
      } catch {
        queueMicrotask(() => {
          setCanUseWebGL(false);
          setStatus('3D graphics are unavailable in this browser right now.');
        });
        return;
      }
    }
    queueMicrotask(() => setCanUseWebGL(true));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.shadowMap.enabled = false;
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 520);
    const clock = new THREE.Clock();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x546d48, 2.2));

    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(-60, 90, 40);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(720, 720),
      new THREE.MeshLambertMaterial({ color: 0x6bd66d }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3;
    scene.add(ground);

    const boxGeometryCache = new Map<string, THREE.BoxGeometry>();
    const materialCache = new Map<number, THREE.MeshLambertMaterial>();
    const getBoxGeometry = (size: [number, number, number]) => {
      const key = size.join(',');
      const cached = boxGeometryCache.get(key);
      if (cached) return cached;
      const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
      boxGeometryCache.set(key, geometry);
      return geometry;
    };
    const getMaterial = (color: number, emissive = 0x000000) => {
      const key = color * 0x1000000 + emissive;
      const cached = materialCache.get(key);
      if (cached) return cached;
      const material = new THREE.MeshLambertMaterial({ color, emissive });
      materialCache.set(key, material);
      return material;
    };

    const makeBox = (name: string, size: [number, number, number], position: [number, number, number], color: number, options: Partial<Platform> = {}) => {
      const mesh = new THREE.Mesh(
        getBoxGeometry(size),
        getMaterial(color),
      );
      mesh.name = name;
      mesh.position.set(position[0], position[1], position[2]);
      scene.add(mesh);
      const half = new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2);
      const bounds = new THREE.Box3(
        new THREE.Vector3(position[0] - half.x, position[1] - half.y, position[2] - half.z),
        new THREE.Vector3(position[0] + half.x, position[1] + half.y, position[2] + half.z),
      );
      const platform = { mesh, bounds, ...options };
      platforms.current.push(platform);
      return platform;
    };

    const checkpointColors = [0x2f80ed, 0x27ae60, 0xf2c94c, 0xf2994a, 0xeb5757, 0x9b51e0, 0x2d9cdb, 0xf7f7ff];

    for (let i = 0; i < 8; i += 1) {
      const z = i * 42;
      makeBox(`checkpoint-${i + 1}`, [18, 2, 18], [0, 0, z], checkpointColors[i], { checkpoint: i + 1 });

      if (i < 7) {
        makeBox(`bridge-${i + 1}`, [7, 1.4, 18], [0, 0.1, z + 19], 0xffffff);
        makeBox(`left-hop-${i + 1}`, [7, 1.5, 7], [-9, 1.2, z + 29], checkpointColors[i]);
        makeBox(`right-hop-${i + 1}`, [7, 1.5, 7], [9, 2.5, z + 35], checkpointColors[i]);

        if (i % 2 === 0) {
          makeBox(`lava-${i + 1}`, [31, 0.8, 4], [0, 1.15, z + 25], 0xff3158, { hazard: true });
        } else {
          makeBox(`moving-${i + 1}`, [9, 1.4, 7], [-12, 2, z + 24], 0x76d7ff, {
            moving: {
              from: new THREE.Vector3(-12, 2, z + 24),
              to: new THREE.Vector3(12, 2, z + 24),
              speed: 0.75 + i * 0.05,
            },
          });
        }

        for (let c = 0; c < 3; c += 1) {
          const coin = new THREE.Mesh(
            new THREE.CylinderGeometry(1.1, 1.1, 0.32, 16),
            getMaterial(0xffd64a, 0x5c4300),
          );
          coin.rotation.z = Math.PI / 2;
          coin.position.set((c - 1) * 7, 5.2, z + 11 + c * 8);
          scene.add(coin);
          coins.current.push({ mesh: coin, taken: false });
        }
      }
    }

    const finish = new THREE.Mesh(
      getBoxGeometry([22, 16, 3]),
      getMaterial(0x44ffb4, 0x118854),
    );
    finish.position.set(0, 7, finishZ);
    scene.add(finish);

    const avatar = new THREE.Group();
    const bodyMaterial = getMaterial(0x2f80ed);
    const headMaterial = getMaterial(0xffd3aa);
    const legMaterial = getMaterial(0x222736);
    const parts = [
      [getBoxGeometry([2.3, 3, 1.2]), bodyMaterial, [0, 2.8, 0]],
      [getBoxGeometry([1.7, 1.7, 1.7]), headMaterial, [0, 5.15, 0]],
      [getBoxGeometry([0.8, 2, 0.8]), legMaterial, [-0.55, 0.9, 0]],
      [getBoxGeometry([0.8, 2, 0.8]), legMaterial, [0.55, 0.9, 0]],
      [getBoxGeometry([0.75, 2.7, 0.75]), bodyMaterial, [-1.65, 2.85, 0]],
      [getBoxGeometry([0.75, 2.7, 0.75]), bodyMaterial, [1.65, 2.85, 0]],
    ] as const;

    for (const [geometry, material, position] of parts) {
      const part = new THREE.Mesh(geometry, material);
      part.position.set(position[0], position[1], position[2]);
      avatar.add(part);
    }

    avatar.position.copy(playerStart);
    scene.add(avatar);
    player.current = avatar;

    const portalBox = new THREE.Box3();
    const playerBox = new THREE.Box3();
    const coinBox = new THREE.Box3();
    const desired = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    let lastWidth = 0;
    let lastHeight = 0;

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width || mount.clientWidth));
      const height = Math.max(1, Math.floor(rect.height || mount.clientHeight));
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    const resizeFrame = requestAnimationFrame(resize);
    window.addEventListener('resize', resize);

    const setKey = (code: string, down: boolean) => {
      if (code === 'KeyW' || code === 'ArrowUp') keys.current.forward = down;
      if (code === 'KeyS' || code === 'ArrowDown') keys.current.back = down;
      if (code === 'KeyA' || code === 'ArrowLeft') keys.current.left = down;
      if (code === 'KeyD' || code === 'ArrowRight') keys.current.right = down;
      if (code === 'Space') keys.current.jump = down;
      if (code === 'ShiftLeft' || code === 'ShiftRight') keys.current.sprint = down;
    };

    const keydown = (event: KeyboardEvent) => {
      setKey(event.code, true);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    };
    const keyup = (event: KeyboardEvent) => setKey(event.code, false);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);

    const setPlayerBox = () => {
      const position = avatar.position;
      playerBox.min.set(position.x - playerHalfSize.x, position.y, position.z - playerHalfSize.z);
      playerBox.max.set(position.x + playerHalfSize.x, position.y + playerHeight, position.z + playerHalfSize.z);
    };

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (document.hidden) {
        clock.getDelta();
        return;
      }
      const dt = Math.min(clock.getDelta(), 0.033);
      const elapsed = clock.elapsedTime;

      for (const platform of platforms.current) {
        if (!platform.moving) continue;
        const t = (Math.sin(elapsed * platform.moving.speed * Math.PI) + 1) / 2;
        platform.mesh.position.lerpVectors(platform.moving.from, platform.moving.to, t);
        platform.bounds.setFromCenterAndSize(platform.mesh.position, platform.bounds.getSize(desired));
      }

      for (const coin of coins.current) {
        if (!coin.taken) {
          coin.mesh.rotation.y += dt * 3;
          coin.mesh.position.y += Math.sin(elapsed * 4 + coin.mesh.position.z) * 0.006;
        }
      }

      finish.rotation.y += dt * 0.9;
      finish.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.025);

      const avatarNow = player.current;
      if (!avatarNow) return;

      const inputX = Number(keys.current.left) - Number(keys.current.right);
      const inputZ = Number(keys.current.forward) - Number(keys.current.back);
      const speed = keys.current.sprint ? 34 : 23;
      desired.set(inputX, 0, inputZ);
      if (desired.lengthSq() > 0) {
        desired.normalize();
        velocity.current.x = THREE.MathUtils.lerp(velocity.current.x, desired.x * speed, 0.18);
        velocity.current.z = THREE.MathUtils.lerp(velocity.current.z, desired.z * speed, 0.18);
        avatarNow.rotation.y = Math.atan2(desired.x, desired.z);
      } else {
        velocity.current.x *= 0.82;
        velocity.current.z *= 0.82;
      }

      velocity.current.y -= 72 * dt;
      avatarNow.position.addScaledVector(velocity.current, dt);

      let grounded = false;
      setPlayerBox();

      for (const platform of platforms.current) {
        if (!intersects(playerBox, platform.bounds)) continue;

        if (platform.hazard) {
          resetPlayer();
          break;
        }

        if (velocity.current.y <= 0 && playerBox.min.y >= platform.bounds.max.y - 1.2) {
          avatarNow.position.y += platform.bounds.max.y - playerBox.min.y;
          velocity.current.y = 0;
          grounded = true;

          if (platform.checkpoint && platform.checkpoint > checkpoint.current) {
            checkpoint.current = platform.checkpoint;
            checkpointPosition.current.set(platform.mesh.position.x, platform.bounds.max.y + 5, platform.mesh.position.z);
            setStage(platform.checkpoint);
            setStatus(`Checkpoint ${platform.checkpoint} reached.`);
          }
        }
      }

      if (grounded && keys.current.jump) {
        velocity.current.y = 34;
      }

      if (avatarNow.position.y < -22) {
        resetPlayer();
      }

      setPlayerBox();
      for (const coin of coins.current) {
        if (coin.taken) continue;
        coinBox.setFromCenterAndSize(coin.mesh.position, coinHalfSize);
        if (intersects(playerBox, coinBox)) {
          coin.taken = true;
          coin.mesh.visible = false;
          collectedCoins.current += 1;
          const nextCoinCount = collectedCoins.current;
          setCoinCount(nextCoinCount);
          if (nextCoinCount >= totalCoins) {
            winGame('You got every coin. You win!');
          } else {
            setStatus(`Coin collected. ${totalCoins - nextCoinCount} left.`);
          }
        }
      }

      portalBox.setFromCenterAndSize(finish.position, desired.set(22, 16, 3));
      if (!finished.current && intersects(playerBox, portalBox)) {
        winGame('You reached the finish portal. You win!');
      }

      cameraTarget.copy(avatarNow.position).addScalar(0);
      cameraTarget.y += 4;
      cameraPosition.copy(avatarNow.position).add(desired.set(0, 16, -24));
      camera.position.lerp(cameraPosition, 0.08);
      camera.lookAt(cameraTarget);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      mount.removeChild(renderer.domElement);
      ground.geometry.dispose();
      for (const geometry of boxGeometryCache.values()) geometry.dispose();
      for (const material of materialCache.values()) material.dispose();
      renderer.dispose();
      platforms.current = [];
      coins.current = [];
    };
  }, [gameKey, resetPlayer, winGame]);

  return (
    <main className="game-shell">
      <section className="game-stage">
        {canUseWebGL && (
          <div className="hud">
            <div>
              <span>Block Rush</span>
              <strong>Stage {stage}/8</strong>
            </div>
            <div>
              <span>Coins</span>
              <strong>{coinCount}/{totalCoins}</strong>
            </div>
            <button type="button" onClick={resetPlayer}>Reset</button>
          </div>
        )}
        <div ref={mountRef} className="three-view" aria-label="Playable 3D Roblox-style obstacle course" />
        {!canUseWebGL && (
          <SoftwareObby onStatus={setStatus} />
        )}
        {hasWon && (
          <div className="win-screen" role="status" aria-live="polite">
            <div className="confetti" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <p>You win!</p>
            <h1>Every coin is yours</h1>
            <button type="button" onClick={restartGame}>Play again</button>
          </div>
        )}
        <div className="status-bar">{status}</div>
        {canUseWebGL && (
          <div className="controls">
            <span>WASD / Arrows</span>
            <span>Space</span>
            <span>Shift</span>
          </div>
        )}
      </section>
    </main>
  );
}
