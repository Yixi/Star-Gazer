/**
 * 文件图标 — 基于 vscode-icons 图标集（通过 unplugin-icons 按需编译）
 *
 * 使用方式：
 *   <FileIcon name="App.tsx" isDir={false} />
 *   <FileIcon name="src" isDir isOpen />
 *
 * 匹配优先级：特殊文件名 > 扩展名 > 默认
 * 文件夹：特殊文件夹名 > 默认（开合两套）
 *
 * 风格：彩色 VSCode 官方图标 — 与 Y-Vibe-IDE 深色主题协调
 */
import type { FC, SVGProps } from "react";

/* ============ 默认图标 ============ */
import DefaultFile from "~icons/vscode-icons/default-file";
import DefaultFolder from "~icons/vscode-icons/default-folder";
import DefaultFolderOpened from "~icons/vscode-icons/default-folder-opened";

/* ============ 文件类型图标 ============ */
// TypeScript / JavaScript
import IconTs from "~icons/vscode-icons/file-type-typescript-official";
import IconTsx from "~icons/vscode-icons/file-type-reactts";
import IconJs from "~icons/vscode-icons/file-type-js-official";
import IconJsx from "~icons/vscode-icons/file-type-reactjs";
import IconTsconfig from "~icons/vscode-icons/file-type-tsconfig-official";
// 数据/配置
import IconJson from "~icons/vscode-icons/file-type-json-official";
import IconYaml from "~icons/vscode-icons/file-type-yaml";
import IconToml from "~icons/vscode-icons/file-type-toml";
import IconXml from "~icons/vscode-icons/file-type-xml";
import IconEnv from "~icons/vscode-icons/file-type-dotenv";
import IconEditorconfig from "~icons/vscode-icons/file-type-editorconfig";
// 文档/文本
import IconMarkdown from "~icons/vscode-icons/file-type-markdown";
import IconLicense from "~icons/vscode-icons/file-type-license";
import IconText from "~icons/vscode-icons/file-type-text";
import IconLog from "~icons/vscode-icons/file-type-log";
import IconPdf from "~icons/vscode-icons/file-type-pdf2";
// Web
import IconHtml from "~icons/vscode-icons/file-type-html";
import IconCss from "~icons/vscode-icons/file-type-css";
import IconScss from "~icons/vscode-icons/file-type-scss";
import IconSass from "~icons/vscode-icons/file-type-sass";
import IconLess from "~icons/vscode-icons/file-type-less";
import IconTailwind from "~icons/vscode-icons/file-type-tailwind";
import IconVue from "~icons/vscode-icons/file-type-vue";
import IconSvelte from "~icons/vscode-icons/file-type-svelte";
import IconAstro from "~icons/vscode-icons/file-type-astro";
// 编程语言
import IconRust from "~icons/vscode-icons/file-type-rust";
import IconPython from "~icons/vscode-icons/file-type-python";
import IconGo from "~icons/vscode-icons/file-type-go";
import IconJava from "~icons/vscode-icons/file-type-java";
import IconKotlin from "~icons/vscode-icons/file-type-kotlin";
import IconSwift from "~icons/vscode-icons/file-type-swift";
import IconCsharp from "~icons/vscode-icons/file-type-csharp";
import IconCpp from "~icons/vscode-icons/file-type-cpp";
import IconC from "~icons/vscode-icons/file-type-c";
import IconRuby from "~icons/vscode-icons/file-type-ruby";
import IconPhp from "~icons/vscode-icons/file-type-php";
import IconSql from "~icons/vscode-icons/file-type-sql";
import IconGraphql from "~icons/vscode-icons/file-type-graphql";
// Shell
import IconShell from "~icons/vscode-icons/file-type-shell";
import IconBat from "~icons/vscode-icons/file-type-bat";
import IconPowershell from "~icons/vscode-icons/file-type-powershell";
// 构建 / 工具链
import IconDocker from "~icons/vscode-icons/file-type-docker";
import IconGit from "~icons/vscode-icons/file-type-git";
import IconVscode from "~icons/vscode-icons/file-type-vscode";
import IconVite from "~icons/vscode-icons/file-type-vite";
import IconWebpack from "~icons/vscode-icons/file-type-webpack";
import IconRollup from "~icons/vscode-icons/file-type-rollup";
import IconBabel from "~icons/vscode-icons/file-type-babel";
import IconEslint from "~icons/vscode-icons/file-type-eslint";
import IconPrettier from "~icons/vscode-icons/file-type-prettier";
import IconTauri from "~icons/vscode-icons/file-type-tauri";
// 包管理
import IconNpm from "~icons/vscode-icons/file-type-npm";
import IconPnpm from "~icons/vscode-icons/file-type-pnpm";
import IconYarn from "~icons/vscode-icons/file-type-yarn";
import IconCargo from "~icons/vscode-icons/file-type-cargo";
// 媒体
import IconImage from "~icons/vscode-icons/file-type-image";
import IconAudio from "~icons/vscode-icons/file-type-audio";
import IconVideo from "~icons/vscode-icons/file-type-video";
import IconFont from "~icons/vscode-icons/file-type-font";
import IconBinary from "~icons/vscode-icons/file-type-binary";
import IconZip from "~icons/vscode-icons/file-type-zip";
// Office
import IconExcel from "~icons/vscode-icons/file-type-excel";
import IconWord from "~icons/vscode-icons/file-type-word";
import IconPpt from "~icons/vscode-icons/file-type-powerpoint";

/* ============ 文件夹类型图标 ============ */
import FolderSrc from "~icons/vscode-icons/folder-type-src";
import FolderSrcOpen from "~icons/vscode-icons/folder-type-src-opened";
import FolderComponent from "~icons/vscode-icons/folder-type-component";
import FolderComponentOpen from "~icons/vscode-icons/folder-type-component-opened";
import FolderTest from "~icons/vscode-icons/folder-type-test";
import FolderTestOpen from "~icons/vscode-icons/folder-type-test-opened";
import FolderDist from "~icons/vscode-icons/folder-type-dist";
import FolderDistOpen from "~icons/vscode-icons/folder-type-dist-opened";
import FolderNode from "~icons/vscode-icons/folder-type-node";
import FolderNodeOpen from "~icons/vscode-icons/folder-type-node-opened";
import FolderGit from "~icons/vscode-icons/folder-type-git";
import FolderGitOpen from "~icons/vscode-icons/folder-type-git-opened";
import FolderDocs from "~icons/vscode-icons/folder-type-docs";
import FolderDocsOpen from "~icons/vscode-icons/folder-type-docs-opened";
import FolderPublic from "~icons/vscode-icons/folder-type-public";
import FolderPublicOpen from "~icons/vscode-icons/folder-type-public-opened";
import FolderConfig from "~icons/vscode-icons/folder-type-config";
import FolderConfigOpen from "~icons/vscode-icons/folder-type-config-opened";
import FolderHook from "~icons/vscode-icons/folder-type-hook";
import FolderHookOpen from "~icons/vscode-icons/folder-type-hook-opened";
import FolderStyle from "~icons/vscode-icons/folder-type-style";
import FolderStyleOpen from "~icons/vscode-icons/folder-type-style-opened";
import FolderTypescript from "~icons/vscode-icons/folder-type-typescript";
import FolderTypescriptOpen from "~icons/vscode-icons/folder-type-typescript-opened";
import FolderView from "~icons/vscode-icons/folder-type-view";
import FolderViewOpen from "~icons/vscode-icons/folder-type-view-opened";
import FolderRoute from "~icons/vscode-icons/folder-type-route";
import FolderRouteOpen from "~icons/vscode-icons/folder-type-route-opened";
import FolderDocker from "~icons/vscode-icons/folder-type-docker";
import FolderDockerOpen from "~icons/vscode-icons/folder-type-docker-opened";
import FolderTauri from "~icons/vscode-icons/folder-type-tauri";
import FolderTauriOpen from "~icons/vscode-icons/folder-type-tauri-opened";
import FolderCargo from "~icons/vscode-icons/folder-type-cargo";
import FolderCargoOpen from "~icons/vscode-icons/folder-type-cargo-opened";
import FolderGithub from "~icons/vscode-icons/folder-type-github";
import FolderGithubOpen from "~icons/vscode-icons/folder-type-github-opened";
import FolderServices from "~icons/vscode-icons/folder-type-services";
import FolderServicesOpen from "~icons/vscode-icons/folder-type-services-opened";

type IconComponent = FC<SVGProps<SVGSVGElement>>;

/* ====== 扩展名 → 图标 ====== */
const extensionMap: Record<string, IconComponent> = {
  // TS/JS
  ts: IconTs,
  mts: IconTs,
  cts: IconTs,
  tsx: IconTsx,
  js: IconJs,
  mjs: IconJs,
  cjs: IconJs,
  jsx: IconJsx,
  // 数据
  json: IconJson,
  jsonc: IconJson,
  json5: IconJson,
  yaml: IconYaml,
  yml: IconYaml,
  toml: IconToml,
  xml: IconXml,
  // 文档
  md: IconMarkdown,
  mdx: IconMarkdown,
  markdown: IconMarkdown,
  txt: IconText,
  log: IconLog,
  pdf: IconPdf,
  // Web
  html: IconHtml,
  htm: IconHtml,
  css: IconCss,
  scss: IconScss,
  sass: IconSass,
  less: IconLess,
  vue: IconVue,
  svelte: IconSvelte,
  astro: IconAstro,
  // 编程语言
  rs: IconRust,
  py: IconPython,
  pyi: IconPython,
  go: IconGo,
  java: IconJava,
  kt: IconKotlin,
  kts: IconKotlin,
  swift: IconSwift,
  cs: IconCsharp,
  cpp: IconCpp,
  cxx: IconCpp,
  cc: IconCpp,
  hpp: IconCpp,
  c: IconC,
  h: IconC,
  rb: IconRuby,
  php: IconPhp,
  sql: IconSql,
  graphql: IconGraphql,
  gql: IconGraphql,
  // Shell
  sh: IconShell,
  bash: IconShell,
  zsh: IconShell,
  fish: IconShell,
  bat: IconBat,
  cmd: IconBat,
  ps1: IconPowershell,
  // 图片
  png: IconImage,
  jpg: IconImage,
  jpeg: IconImage,
  gif: IconImage,
  webp: IconImage,
  svg: IconImage,
  bmp: IconImage,
  ico: IconImage,
  avif: IconImage,
  // 音频
  mp3: IconAudio,
  wav: IconAudio,
  flac: IconAudio,
  ogg: IconAudio,
  m4a: IconAudio,
  // 视频
  mp4: IconVideo,
  mov: IconVideo,
  avi: IconVideo,
  mkv: IconVideo,
  webm: IconVideo,
  // 字体
  ttf: IconFont,
  otf: IconFont,
  woff: IconFont,
  woff2: IconFont,
  eot: IconFont,
  // 压缩包
  zip: IconZip,
  tar: IconZip,
  gz: IconZip,
  rar: IconZip,
  "7z": IconZip,
  // 二进制
  exe: IconBinary,
  bin: IconBinary,
  dll: IconBinary,
  so: IconBinary,
  dylib: IconBinary,
  // Office
  xls: IconExcel,
  xlsx: IconExcel,
  csv: IconExcel,
  doc: IconWord,
  docx: IconWord,
  ppt: IconPpt,
  pptx: IconPpt,
  // 其它
  lock: IconBinary,
};

/* ====== 特殊文件名 → 图标（不区分大小写） ====== */
const filenameMap: Record<string, IconComponent> = {
  "package.json": IconNpm,
  "package-lock.json": IconNpm,
  "pnpm-lock.yaml": IconPnpm,
  "pnpm-workspace.yaml": IconPnpm,
  "yarn.lock": IconYarn,
  ".yarnrc": IconYarn,
  ".yarnrc.yml": IconYarn,
  "cargo.toml": IconCargo,
  "cargo.lock": IconCargo,
  "tsconfig.json": IconTsconfig,
  "tsconfig.node.json": IconTsconfig,
  "tsconfig.base.json": IconTsconfig,
  "vite.config.ts": IconVite,
  "vite.config.js": IconVite,
  "vitest.config.ts": IconVite,
  "webpack.config.js": IconWebpack,
  "rollup.config.js": IconRollup,
  "rollup.config.ts": IconRollup,
  ".babelrc": IconBabel,
  "babel.config.js": IconBabel,
  "babel.config.json": IconBabel,
  ".eslintrc": IconEslint,
  ".eslintrc.js": IconEslint,
  ".eslintrc.cjs": IconEslint,
  ".eslintrc.json": IconEslint,
  ".eslintrc.yml": IconEslint,
  ".eslintignore": IconEslint,
  "eslint.config.js": IconEslint,
  "eslint.config.ts": IconEslint,
  ".prettierrc": IconPrettier,
  ".prettierrc.js": IconPrettier,
  ".prettierrc.json": IconPrettier,
  ".prettierrc.yml": IconPrettier,
  ".prettierignore": IconPrettier,
  "prettier.config.js": IconPrettier,
  "tailwind.config.js": IconTailwind,
  "tailwind.config.ts": IconTailwind,
  "tailwind.config.cjs": IconTailwind,
  "tauri.conf.json": IconTauri,
  dockerfile: IconDocker,
  "docker-compose.yml": IconDocker,
  "docker-compose.yaml": IconDocker,
  ".dockerignore": IconDocker,
  ".gitignore": IconGit,
  ".gitattributes": IconGit,
  ".gitmodules": IconGit,
  ".gitkeep": IconGit,
  ".editorconfig": IconEditorconfig,
  ".env": IconEnv,
  license: IconLicense,
  "license.md": IconLicense,
  "license.txt": IconLicense,
  readme: IconMarkdown,
  "readme.md": IconMarkdown,
};

/* ====== 文件夹名称 → [关闭图标, 打开图标] ====== */
const folderMap: Record<string, [IconComponent, IconComponent]> = {
  src: [FolderSrc, FolderSrcOpen],
  components: [FolderComponent, FolderComponentOpen],
  component: [FolderComponent, FolderComponentOpen],
  test: [FolderTest, FolderTestOpen],
  tests: [FolderTest, FolderTestOpen],
  __tests__: [FolderTest, FolderTestOpen],
  spec: [FolderTest, FolderTestOpen],
  e2e: [FolderTest, FolderTestOpen],
  dist: [FolderDist, FolderDistOpen],
  build: [FolderDist, FolderDistOpen],
  out: [FolderDist, FolderDistOpen],
  node_modules: [FolderNode, FolderNodeOpen],
  ".git": [FolderGit, FolderGitOpen],
  docs: [FolderDocs, FolderDocsOpen],
  doc: [FolderDocs, FolderDocsOpen],
  public: [FolderPublic, FolderPublicOpen],
  static: [FolderPublic, FolderPublicOpen],
  assets: [FolderPublic, FolderPublicOpen],
  config: [FolderConfig, FolderConfigOpen],
  configs: [FolderConfig, FolderConfigOpen],
  ".config": [FolderConfig, FolderConfigOpen],
  hooks: [FolderHook, FolderHookOpen],
  styles: [FolderStyle, FolderStyleOpen],
  style: [FolderStyle, FolderStyleOpen],
  css: [FolderStyle, FolderStyleOpen],
  types: [FolderTypescript, FolderTypescriptOpen],
  "@types": [FolderTypescript, FolderTypescriptOpen],
  typings: [FolderTypescript, FolderTypescriptOpen],
  views: [FolderView, FolderViewOpen],
  pages: [FolderView, FolderViewOpen],
  routes: [FolderRoute, FolderRouteOpen],
  router: [FolderRoute, FolderRouteOpen],
  services: [FolderServices, FolderServicesOpen],
  service: [FolderServices, FolderServicesOpen],
  stores: [FolderServices, FolderServicesOpen],
  store: [FolderServices, FolderServicesOpen],
  docker: [FolderDocker, FolderDockerOpen],
  "src-tauri": [FolderTauri, FolderTauriOpen],
  ".cargo": [FolderCargo, FolderCargoOpen],
  ".github": [FolderGithub, FolderGithubOpen],
};

/** 根据文件名推断最后一个扩展名（不带点，小写） */
function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

/** 前缀匹配：.env.local / .env.production 等都走 dotenv 图标 */
function matchPrefixRules(lower: string): IconComponent | undefined {
  if (lower.startsWith(".env")) return IconEnv;
  if (lower.startsWith("readme")) return IconMarkdown;
  if (lower.startsWith("license")) return IconLicense;
  if (lower.startsWith("changelog")) return IconMarkdown;
  if (lower.startsWith(".vscode")) return IconVscode;
  return undefined;
}

interface FileIconProps {
  /** 文件或文件夹名（不是路径） */
  name: string;
  isDir: boolean;
  /** 当 isDir=true 时表示是否展开 */
  isOpen?: boolean;
  /** 图标尺寸（px），默认 14 */
  size?: number;
  className?: string;
}

/** 根据文件/文件夹名与状态渲染 VSCode 风格的彩色图标 */
export function FileIcon({ name, isDir, isOpen = false, size = 14, className }: FileIconProps) {
  const lower = name.toLowerCase();

  if (isDir) {
    const tuple = folderMap[lower];
    const Icon: IconComponent = tuple
      ? isOpen
        ? tuple[1]
        : tuple[0]
      : isOpen
        ? DefaultFolderOpened
        : DefaultFolder;
    return <Icon width={size} height={size} className={className} />;
  }

  // 文件：1) 完整文件名精确匹配 2) 前缀匹配 3) 扩展名 4) 默认
  let Icon: IconComponent | undefined = filenameMap[lower];
  if (!Icon) Icon = matchPrefixRules(lower);
  if (!Icon) {
    const ext = getExtension(name);
    if (ext) Icon = extensionMap[ext];
  }
  if (!Icon) Icon = DefaultFile;

  return <Icon width={size} height={size} className={className} />;
}
