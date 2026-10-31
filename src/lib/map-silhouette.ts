// Clip in homogeneous camera space before dividing by w. Mapbox.project()
// returns MAX_VALUE for points behind the camera; those cannot form a CSS path.
type Vertex = [number, number, number];
type ClipPoint = [number, number, number];
export function silhouettePath(
  polygons: Vertex[][][],
  matrix: ArrayLike<number>,
  width: number,
  height: number,
): string {
  const paths: string[] = [];
  const planes = [
    (p: ClipPoint) => p[2] - 1e-8,
    (p: ClipPoint) => p[0] + p[2],
    (p: ClipPoint) => p[2] - p[0],
    (p: ClipPoint) => p[1] + p[2],
    (p: ClipPoint) => p[2] - p[1],
  ];
  for (const polygon of polygons)
    for (const ring of polygon) {
      let points: ClipPoint[] = ring.map(([x, y, z]) => [
        matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
        matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
        matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
      ]);
      for (const distance of planes) {
        if (!points.length) break;
        const clipped: ClipPoint[] = [];
        let previous = points[points.length - 1],
          a = distance(previous);
        for (const current of points) {
          const b = distance(current);
          if (a >= 0 !== b >= 0) {
            const t = a / (a - b);
            clipped.push(previous.map((v, i) => v + t * (current[i] - v)) as ClipPoint);
          }
          if (b >= 0) clipped.push(current);
          previous = current;
          a = b;
        }
        points = clipped;
      }
      let previous: [number, number] | undefined;
      const commands: string[] = [];
      for (const [x, y, w] of points) {
        const p: [number, number] = [((x / w + 1) * width) / 2, ((1 - y / w) * height) / 2];
        if (!p.every(Number.isFinite)) continue;
        if (previous && Math.hypot(p[0] - previous[0], p[1] - previous[1]) < 0.6) continue;
        commands.push(`${commands.length ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`);
        previous = p;
      }
      if (commands.length > 2) paths.push(commands.join('') + 'Z');
    }
  return paths.join('');
}
