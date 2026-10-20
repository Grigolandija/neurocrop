// Linux headless Chromium can omit WebGPU canvas presentation from captures.
// CI supplies DISPLAY through Xvfb; other E2E files remain headless.
export const graphicsOptions = {
  headless: process.platform !== 'linux',
  reducedMotion: 'reduce' as const,
  launchOptions: {
    args: process.platform === 'linux'
      ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface']
      : ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
  },
}
