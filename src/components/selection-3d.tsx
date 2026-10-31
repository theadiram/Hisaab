'use client';
import { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import * as THREE from 'three';
// A location halo, never an invented building. Mapbox owns the camera and render loop.
export function Selection3D({
  map,
  location,
}: {
  map: mapboxgl.Map;
  location: [number, number] | null;
}) {
  useEffect(() => {
    if (!location) return;
    const id = 'hisaab-selected-location-3d',
      scene = new THREE.Scene(),
      camera = new THREE.Camera(),
      geometry = new THREE.RingGeometry(10, 13, 64),
      material = new THREE.MeshBasicMaterial({
        color: 0xb3ef52,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      ring = new THREE.Mesh(geometry, material);
    scene.add(ring);
    let renderer: THREE.WebGLRenderer;
    const layer: mapboxgl.CustomLayerInterface = {
      id,
      type: 'custom',
      renderingMode: '3d',
      onAdd(_map, gl) {
        renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl });
        renderer.autoClear = false;
      },
      render(_gl, matrix) {
        const p = mapboxgl.MercatorCoordinate.fromLngLat(
            location,
            (map.queryTerrainElevation(location) ?? 0) + 2,
          ),
          scale = p.meterInMercatorCoordinateUnits();
        const transform = new THREE.Matrix4()
          .makeTranslation(p.x, p.y, p.z)
          .scale(new THREE.Vector3(scale, -scale, scale));
        camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(transform);
        renderer.resetState();
        renderer.render(scene, camera);
      },
      onRemove() {
        geometry.dispose();
        material.dispose();
        renderer?.dispose();
      },
    };
    const install = () => {
      if (map.getStyle() && !map.getLayer(id)) map.addLayer(layer, 'hisaab-outside-india');
    };
    install();
    map.on('style.load', install);
    map.triggerRepaint();
    return () => {
      map.off('style.load', install);
      if (!map.getStyle()) return;
      if (map.getLayer(id)) map.removeLayer(id);
    };
  }, [map, location]);
  return null;
}
