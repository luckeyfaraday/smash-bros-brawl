import {defineConfig} from '@playwright/test';
import browserConfig from './playwright.config';

const baseURL='http://127.0.0.1:4175';

export default defineConfig(browserConfig,{
  testDir:'./tests/pages',
  use:{baseURL},
  outputDir:'artifacts/pages-results',
  webServer:{
    command:'wrangler pages dev --ip 127.0.0.1 --port 4175',
    url:baseURL,
    reuseExistingServer:false,
    timeout:120000,
  },
});
