// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// https://astro.build/config
export default defineConfig({
  // GitHub Pages 프로젝트 페이지 배포 설정.
  // 사용자명/저장소명이 다르면 아래 두 줄을 바꾸세요.
  site: 'https://jiwon1304.github.io',
  base: '/interactive-graphics-book/',

  integrations: [react(), mdx()],

  markdown: {
    // 수식 지원: remark-math 로 $...$ 파싱 → rehype-katex 로 HTML 렌더
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
  },
});
