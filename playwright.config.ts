import {defineConfig} from '@playwright/test';
import {testDatabaseUrl} from './tests/browser/test-environment';
const databaseUrl=testDatabaseUrl();
export default defineConfig({
 // GitHub runners have no GPU, so map pages render through SwiftShader (software WebGL) on
 // four shared CPUs. One worker keeps map loads inside the app's 20s preview deadline, and the
 // longer budget covers multi-step desktop journeys. Assertions and expect timeouts are unchanged.
 testDir:'tests/browser',workers:process.env.CI?1:2,timeout:process.env.CI?90_000:30_000,
 use:{channel:process.env.HISAAB_BROWSER_CHANNEL,baseURL:'http://127.0.0.1:3000',trace:'retain-on-failure'},
 webServer:{
  command:'npm run dev',url:'http://127.0.0.1:3000',reuseExistingServer:false,
  env:{
   NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN:'pk.browser-fixture',NEXT_PUBLIC_HISAAB_MAP_TILE_BASE_URL:'',
   SUPABASE_URL:databaseUrl,NEXT_PUBLIC_SUPABASE_URL:databaseUrl,
   HISAAB_DATA_MODE:'supabase',HISAAB_APP_ORIGIN:'http://127.0.0.1:3000',HISAAB_PUBLIC_RELEASE:'false',
  },
 },
 projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],
});
