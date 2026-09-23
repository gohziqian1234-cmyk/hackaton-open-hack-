'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { characters } from '../lib/catalog';
type Mode = 'hero' | 'box' | 'reveal';
function Kin({ color = '#FFD84D' }: { color?: string }) {
  return (
    <group>
      <RoundedBox args={[1.02, 0.98, 0.64]} radius={0.28} position={[0, -0.27, 0]}>
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.32} />
      </RoundedBox>
      {[-1, 1].map((s) => (
        <group key={s}>
          <RoundedBox
            args={[0.34, 0.72, 0.42]}
            radius={0.16}
            position={[s * 0.64, -0.34, 0]}
            rotation={[0, 0, s * 0.16]}
          >
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
          </RoundedBox>
          <RoundedBox args={[0.38, 0.45, 0.56]} radius={0.14} position={[s * 0.28, -0.94, 0.05]}>
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
          </RoundedBox>
          <mesh position={[s * 0.49, 1.03, -0.05]} rotation={[0, 0, s * -0.32]}>
            <coneGeometry args={[0.2, 0.64, 4]} />
            <meshStandardMaterial color={color} roughness={0.42} metalness={0.4} />
          </mesh>
        </group>
      ))}
      <RoundedBox args={[1.4, 1.18, 0.95]} radius={0.38} position={[0, 0.57, 0]}>
        <meshStandardMaterial color={color} roughness={0.34} metalness={0.35} />
      </RoundedBox>
      <RoundedBox args={[1.15, 0.72, 0.32]} radius={0.27} position={[0, 0.57, 0.45]}>
        <meshStandardMaterial color="#17123A" roughness={0.16} metalness={0.68} />
      </RoundedBox>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.27, 0.56, 0.618]}>
          <capsuleGeometry args={[0.022, 0.13, 4, 8]} />
          <meshStandardMaterial color="#EEEBFB" emissive="#FFD84D" emissiveIntensity={1.5} />
        </mesh>
      ))}
      <mesh position={[0, -0.2, 0.342]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.135, 0.135, 0.045, 32]} />
        <meshStandardMaterial color="#221B52" metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh position={[0, 1.35, 0]} rotation={[1.34, 0.15, -0.18]}>
        <torusGeometry args={[0.79, 0.018, 8, 80]} />
        <meshStandardMaterial
          color="#FFD84D"
          metalness={0.8}
          roughness={0.3}
          emissive="#C9A21F"
          emissiveIntensity={0.2}
        />
      </mesh>
      <mesh position={[-0.23, 0.77, 0.62]} rotation={[0, 0, -0.35]}>
        <planeGeometry args={[0.52, 0.035]} />
        <meshBasicMaterial color="#EEEBFB" transparent opacity={0.24} />
      </mesh>
    </group>
  );
}
function Sculpture({
  mode,
  opened,
  reduced,
  color,
}: {
  mode: Mode;
  opened: boolean;
  reduced: boolean;
  color: string;
}) {
  const root = useRef<THREE.Group>(null),
    lid = useRef<THREE.Group>(null),
    kin = useRef<THREE.Group>(null),
    base = useRef<THREE.Group>(null);
  const progress = useRef(0);
  useFrame((state, delta) => {
    if (!root.current) return;
    const dt = Math.min(delta, 0.05);
    root.current.rotation.y = THREE.MathUtils.damp(
      root.current.rotation.y,
      mode === 'hero' ? -0.3 + state.pointer.x * 0.22 : state.pointer.x * 0.1,
      3,
      dt,
    );
    root.current.rotation.x = THREE.MathUtils.damp(
      root.current.rotation.x,
      -state.pointer.y * 0.05,
      3,
      dt,
    );
    if (!reduced && mode === 'hero')
      root.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.055;
    progress.current = opened ? (reduced ? 1 : Math.min(1, progress.current + dt * 0.4)) : 0;
    const p = progress.current;
    if (lid.current) {
      lid.current.position.y = 0.8 + p * 2.6;
      lid.current.rotation.z = -p * 0.32;
      lid.current.scale.setScalar(1 - p * 0.35);
      lid.current.visible = p < 0.98;
    }
    if (kin.current && mode === 'reveal') {
      kin.current.position.y = -0.6 + p * 0.9;
      kin.current.scale.setScalar(0.01 + p * 0.83);
      kin.current.rotation.y = (1 - p) * 2.8;
      kin.current.visible = p > 0.22;
    }
    if (base.current && mode === 'reveal') {
      base.current.position.y = -p * 1.4;
      base.current.scale.setScalar(1 - p * 0.3);
      base.current.visible = p < 0.98;
    }
  });
  return (
    <group ref={root} rotation={[0, -0.3, 0]}>
      {mode === 'hero' ? (
        <>
          <group position={[0.3, 0.02, 0.2]} rotation={[0, 0.08, 0]}>
            <Kin color="#FFD84D" />
          </group>
          <group position={[-1.1, -0.61, -0.7]} rotation={[0, -0.25, -0.08]} scale={0.73}>
            <Package />
          </group>
        </>
      ) : (
        <>
          <group ref={base}>
            <Package noLid />
          </group>
          <group ref={lid} position={[0, 0.8, 0]}>
            <RoundedBox args={[1.7, 0.24, 1.45]} radius={0.04}>
              <meshStandardMaterial color="#FFD84D" metalness={0.2} roughness={0.6} />
            </RoundedBox>
            <mesh position={[0, 0.126, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.23, 0.25, 64]} />
              <meshStandardMaterial color="#C9A21F" />
            </mesh>
          </group>
          {mode === 'reveal' && (
            <group ref={kin} scale={0.01}>
              <Kin color={color} />
            </group>
          )}
        </>
      )}
    </group>
  );
}
function Package({ noLid = false }: { noLid?: boolean }) {
  return (
    <group>
      <RoundedBox args={[1.6, 1.5, 1.35]} radius={0.035}>
        <meshStandardMaterial color="#EEEBFB" metalness={0.15} roughness={0.67} />
      </RoundedBox>
      {!noLid && (
        <RoundedBox args={[1.7, 0.24, 1.45]} radius={0.035} position={[0, 0.8, 0]}>
          <meshStandardMaterial color="#FFD84D" roughness={0.62} />
        </RoundedBox>
      )}
      <mesh position={[0, 0.08, 0.682]}>
        <ringGeometry args={[0.3, 0.32, 64]} />
        <meshStandardMaterial color="#17123A" metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.08, 0.69]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.24, 0.24]} />
        <meshStandardMaterial color="#2E2668" />
      </mesh>
      <mesh position={[0, -0.46, 0.681]}>
        <planeGeometry args={[0.62, 0.024]} />
        <meshStandardMaterial color="#2E2668" />
      </mesh>
      <mesh position={[0, -0.53, 0.681]}>
        <planeGeometry args={[0.38, 0.015]} />
        <meshStandardMaterial color="#2E2668" />
      </mesh>
    </group>
  );
}
export default function Scene({
  mode = 'hero',
  opened = false,
  reduced = false,
  character = 'eclipse',
  onFailure,
}: {
  mode?: Mode;
  opened?: boolean;
  reduced?: boolean;
  character?: string;
  onFailure?: () => void;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const color = characters.find((c) => c.id === character)?.color || '#FFD84D';
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.1, 5.6], fov: 38 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      frameloop={!visible ? 'never' : reduced && !opened ? 'demand' : 'always'}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', () => onFailure?.(), { once: true });
      }}
    >
      <ambientLight intensity={0.7} />
      <hemisphereLight args={['#EEEBFB', '#221B52', 1.8]} />
      <directionalLight position={[2, 4, 4]} intensity={4} color="#FFF6DA" />
      <directionalLight position={[-4, 1, 2]} intensity={2} color="#8C7BFF" />
      <pointLight position={[1, 2, -3]} intensity={20} color="#FFD84D" />
      <Sculpture mode={mode} opened={opened} reduced={reduced} color={color} />
      <mesh position={[0, -1.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.9, 64]} />
        <meshStandardMaterial color="#8C7BFF" transparent opacity={0.16} />
      </mesh>
    </Canvas>
  );
}
