declare module 'vt-pbf' {
  const encoder: {
    fromGeojsonVt(
      layers: Record<
        string,
        {
          features: {
            id: number;
            type: number;
            geometry: number[][];
            tags: Record<string, string>;
          }[];
        }
      >,
      options: { version: number; extent: number },
    ): Uint8Array;
  };
  export default encoder;
}
