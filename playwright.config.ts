import { defineConfig } from '@playwright/test';
const built=process.env.BRAWL_TEST_BUILD==='1';
const port=built?4174:5174;
export default defineConfig({
  testDir:'./tests/browser', timeout:180000, workers:1,
  expect:{timeout:15000},
  use:{baseURL:`http://127.0.0.1:${port}`,headless:true,viewport:{width:1440,height:1100},
    screenshot:'only-on-failure',trace:'off'},
  outputDir:'artifacts/browser-results',
  webServer:{command:`npm run ${built?'preview':'dev'} -- --port ${port} --strictPort`,url:`http://127.0.0.1:${port}`,reuseExistingServer:!built},
});
