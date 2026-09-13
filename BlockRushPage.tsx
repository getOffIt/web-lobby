'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type Platform = {
  mesh: THREE.Mesh;
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

const playerStart = new THREE.Vector3(0, 5, 0);
const finishZ = 292;
const totalCoins = 21;

function intersects(a: THREE.Box3, b: THREE.Box3) {
  return a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y && a.max.z >= b.min.z && a.min.z <= b.max.z;
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
    scene.fog = new THREE.Fog(0x9bdcff, 80, 430);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false });
      } catch {
        queueMicrotask(() => {
          setCanUseWebGL(false);
          setStatus('3D graphics are unavailable in this browser right now.');
        });
        return;
      }
    }
    queueMicrotask(() => setCanUseWebGL(true));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 900);
    const clock = new THREE.Clock();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x546d48, 1.7));

    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(-60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 160;
    sun.shadow.camera.bottom = -80;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x6bd66d, roughness: 0.85 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3;
    ground.receiveShadow = true;
    scene.add(ground);

    const makeBox = (name: string, size: [number, number, number], position: [number, number, number], color: number, options: Partial<Platform> = {}) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size[0], size[1], size[2]),
        new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.04 }),
      );
      mesh.name = name;
      mesh.position.set(position[0], position[1], position[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      const platform = { mesh, ...options };
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
            new THREE.CylinderGeometry(1.1, 1.1, 0.32, 28),
            new THREE.MeshStandardMaterial({ color: 0xffd64a, emissive: 0x5c4300, roughness: 0.35 }),
          );
          coin.rotation.z = Math.PI / 2;
          coin.position.set((c - 1) * 7, 5.2, z + 11 + c * 8);
          coin.castShadow = true;
          scene.add(coin);
          coins.current.push({ mesh: coin, taken: false });
        }
      }
    }

    const finish = new THREE.Mesh(
      new THREE.BoxGeometry(22, 16, 3),
      new THREE.MeshStandardMaterial({ color: 0x44ffb4, emissive: 0x118854, roughness: 0.35 }),
    );
    finish.position.set(0, 7, finishZ);
    finish.castShadow = true;
    scene.add(finish);

    const avatar = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2f80ed, roughness: 0.55 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffd3aa, roughness: 0.65 });
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x222736, roughness: 0.7 });
    const parts = [
      [new THREE.BoxGeometry(2.3, 3, 1.2), bodyMaterial, [0, 2.8, 0]],
      [new THREE.BoxGeometry(1.7, 1.7, 1.7), headMaterial, [0, 5.15, 0]],
      [new THREE.BoxGeometry(0.8, 2, 0.8), legMaterial, [-0.55, 0.9, 0]],
      [new THREE.BoxGeometry(0.8, 2, 0.8), legMaterial, [0.55, 0.9, 0]],
      [new THREE.BoxGeometry(0.75, 2.7, 0.75), bodyMaterial, [-1.65, 2.85, 0]],
      [new THREE.BoxGeometry(0.75, 2.7, 0.75), bodyMaterial, [1.65, 2.85, 0]],
    ] as const;

    for (const [geometry, material, position] of parts) {
      const part = new THREE.Mesh(geometry, material);
      part.position.set(position[0], position[1], position[2]);
      part.castShadow = true;
      avatar.add(part);
    }

    avatar.position.copy(playerStart);
    scene.add(avatar);
    player.current = avatar;

    const portalBox = new THREE.Box3();
    const playerBox = new THREE.Box3();
    const platformBox = new THREE.Box3();
    const coinBox = new THREE.Box3();

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width || mount.clientWidth));
      const height = Math.max(1, Math.floor(rect.height || mount.clientHeight));
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

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.033);
      const elapsed = clock.elapsedTime;

      for (const platform of platforms.current) {
        if (!platform.moving) continue;
        const t = (Math.sin(elapsed * platform.moving.speed * Math.PI) + 1) / 2;
        platform.mesh.position.lerpVectors(platform.moving.from, platform.moving.to, t);
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
      const desired = new THREE.Vector3(inputX, 0, inputZ);
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
      playerBox.setFromObject(avatarNow);

      for (const platform of platforms.current) {
        platformBox.setFromObject(platform.mesh);
        if (!intersects(playerBox, platformBox)) continue;

        if (platform.hazard) {
          resetPlayer();
          break;
        }

        if (velocity.current.y <= 0 && playerBox.min.y >= platformBox.max.y - 1.2) {
          avatarNow.position.y += platformBox.max.y - playerBox.min.y;
          velocity.current.y = 0;
          grounded = true;

          if (platform.checkpoint && platform.checkpoint > checkpoint.current) {
            checkpoint.current = platform.checkpoint;
            checkpointPosition.current.set(platform.mesh.position.x, platformBox.max.y + 5, platform.mesh.position.z);
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

      playerBox.setFromObject(avatarNow);
      for (const coin of coins.current) {
        if (coin.taken) continue;
        coinBox.setFromObject(coin.mesh);
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

      portalBox.setFromObject(finish);
      if (!finished.current && intersects(playerBox, portalBox)) {
        winGame('You reached the finish portal. You win!');
      }

      const cameraTarget = avatarNow.position.clone().add(new THREE.Vector3(0, 4, 0));
      const cameraPosition = avatarNow.position.clone().add(new THREE.Vector3(0, 16, -24));
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
      renderer.dispose();
      platforms.current = [];
      coins.current = [];
    };
  }, [gameKey, resetPlayer, winGame]);

  return (
    <main className="game-shell">
      <section className="game-stage">
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
        <div ref={mountRef} className="three-view" aria-label="Playable 3D Roblox-style obstacle course" />
        {!canUseWebGL && (
          <div className="webgl-warning" role="status">
            <p>WebGL is unavailable</p>
            <h1>Graphics acceleration needs attention</h1>
            <span>The local game is running, but this browser could not create a WebGL context. After the OpenCore patch update, reopen OpenCore Legacy Patcher and apply any available root patches.</span>
            <a href="http://localhost:3000/block-rush" target="_blank" rel="noreferrer">Open local game</a>
          </div>
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
        <div className="controls">
          <span>WASD / Arrows</span>
          <span>Space</span>
          <span>Shift</span>
        </div>
      </section>
    </main>
  );
}
