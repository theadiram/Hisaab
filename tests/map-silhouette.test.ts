import { describe, it, expect } from 'vitest';
import { silhouettePath } from '../src/lib/map-silhouette';
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
describe('India camera-space silhouette', () => {
  it('clips a boundary surrounding the viewport instead of dropping it', () => {
    expect(
      silhouettePath(
        [
          [
            [
              [-2, -2, 0],
              [2, -2, 0],
              [2, 2, 0],
              [-2, 2, 0],
              [-2, -2, 0],
            ],
          ],
        ],
        identity,
        800,
        600,
      ),
    ).toContain('800.0');
  });
  it('clips rings crossing behind the camera without huge or non-finite screen coordinates', () => {
    const perspective = [...identity];
    perspective[3] = 1;
    perspective[15] = 0.2;
    const path = silhouettePath(
      [
        [
          [
            [-1, -1, 0],
            [1, -1, 0],
            [1, 1, 0],
            [-1, 1, 0],
          ],
        ],
      ],
      perspective,
      800,
      600,
    );
    expect(path).not.toMatch(/NaN|Infinity|e\+/);
    expect(path).not.toBe('');
    for (const value of path.match(/-?\d+\.\d+/g) ?? [])
      expect(Number(value)).toBeGreaterThanOrEqual(-0.1);
    expect(Math.max(...(path.match(/-?\d+\.\d+/g) ?? []).map(Number))).toBeLessThanOrEqual(800.1);
  });
  it('retains separate island and hole subpaths; entirely hidden geometry stays empty', () => {
    const rings: [number, number, number][][] = [
      [
        [0, 0, 0],
        [0.8, 0, 0],
        [0.8, 0.8, 0],
      ],
      [
        [0.2, 0.2, 0],
        [0.3, 0.2, 0],
        [0.3, 0.3, 0],
      ],
    ];
    expect(silhouettePath([rings], identity, 800, 600).match(/M/g)).toHaveLength(2);
    const hidden = [...identity];
    hidden[15] = -1;
    expect(silhouettePath([rings], hidden, 800, 600)).toBe('');
  });
});
