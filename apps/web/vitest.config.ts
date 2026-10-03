import { defineConfig } from 'vitest/config';

/**
 * T08 · apps/web 单测配置（仅 src/lib 纯函数层；Astro 页面/React 岛靠
 * astro check + dev server/curl 验收）。
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
