import type { NextConfig } from 'next';
import {existsSync} from 'node:fs';
if(existsSync('.env.mapbox.local'))process.loadEnvFile('.env.mapbox.local');
const mapToken=process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN??'';
if(mapToken&&!mapToken.startsWith('pk.'))throw new Error('Mapbox browser configuration requires a public map token.');
const config: NextConfig = {
  poweredByHeader: false,
  // Keep private acquisition files out of automatic build tracing. VPS releases
  // install the checked SQLite geography and matching manifest separately.
  outputFileTracingExcludes: {'/*':['./data/acquisition/**/*','./data/originals/**/*','./.hisaab/**/*','./tmp/**/*','./.env*']},
  env:{NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN:mapToken},
  async rewrites(){return [{source:'/state/:code',destination:'/'},{source:'/asset/:id',destination:'/'}];},
  async headers() { return [{source:'/geography/:path*',headers:[{key:'Cache-Control',value:'public, max-age=86400'}]}, { source: '/:path*', headers: [
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'no-referrer'},
    {key:'Permissions-Policy',value:'camera=(self), microphone=(), geolocation=(self)'},
    {key:'X-Frame-Options',value:'DENY'},
  ]}]; },
};
export default config;
