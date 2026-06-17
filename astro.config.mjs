// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// https://astro.build/config
export default defineConfig({
  // 로컬 개발에는 영향 없음. GitHub Pages 배포 시 아래 두 줄을 본인 값으로 바꾸세요.
  //  - 사용자/조직 페이지(user.github.io):   site: 'https://USERNAME.github.io'
  //  - 프로젝트 페이지(user.github.io/repo):  site + base: '/REPO/'
  // site: 'https://USERNAME.github.io',
  // base: '/interactive-graphics-book/',

  integrations: [react(), mdx()],

  markdown: {
    // 수식 지원: remark-math 로 $...$ 파싱 → rehype-katex 로 HTML 렌더
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
  },
});
