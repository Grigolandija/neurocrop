// Linux headless Chromium can omit WebGPU canvas presentation from captures.
// CI supplies DISPLAY through Xvfb; other E2E files remain headless.
export const graphicsOptions = {
  headless: process.platform !== 'linux',
  contextOptions: { reducedMotion: 'reduce' as const },
  launchOptions: {
    // SwiftShader runs on the CI CPU; Chromium's GPU watchdog can kill it
    // during shader compilation. Keep Playwright/job timeouts as the bound.
    // Same harness fix: https://github.com/mrdoob/three.js/pull/33650
    args: process.platform === 'linux'
      ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface', '--disable-gpu-watchdog']
      : ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
  },
}
