'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

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

export default function Home() {
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
  const [status, setStatus] = useState('Canvas 3D mode is ready.');

  const resetPlayer = useCallback(() => {
    player.current.copy(checkpointPosition.current);
    velocity.current.set(0, 0, 0);
    setStatus(`Back to checkpoint ${checkpoint.current}.`);
  }, []);

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
    setStatus('Canvas 3D mode is running smoothly.');
  }, []);

  const winGame = useCallback((message: string) => {
    if (finished.current) return;
    finished.current = true;
    setHasWon(true);
    setStatus(message);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;

    setStatus('Canvas 3D mode is running smoothly.');

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
            setStatus(`Checkpoint ${platform.checkpoint} reached.`);
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
            else setStatus(`Coin collected. ${totalCoins - next} left.`);
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
  }, [resetPlayer, winGame]);

  return (
    <main className="game-shell">
      <section className="game-stage">
        <div className="software-stage">
          <canvas ref={canvasRef} aria-label="Playable canvas-rendered 3D obstacle course" />
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
        <div className="status-bar">{status}</div>
      </section>
    </main>
  );
}
