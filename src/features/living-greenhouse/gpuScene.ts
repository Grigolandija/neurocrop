/// <reference types="@webgpu/types" />
import { cameraMatrix, inverseMatrix, type Vec3 } from './sceneMath'
import type { VolumeField } from './sceneGeometry'
import type { LivingView } from './spatialEvidence'
import { volumeWgsl, volumeVertexGl, volumeFragmentGl } from './volumeShaders'

type Backend = {
  canvas: HTMLCanvasElement
  name: 'WebGPU' | 'WebGL'
  upload: (data: Float32Array, field: VolumeField) => void
  draw: (matrix: Float32Array, presentation: number) => void
  resize: () => void
  dispose: () => void
}
// Match the light NeuroCrop workspace in both graphics backends.
const clear = { r: .965, g: .973, b: .953, a: 1 }

async function webgpu(onLost: () => void): Promise<Backend> {
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'low-power' })
  if (!adapter) throw new Error('WebGPU unavailable')
  const device = await adapter.requestDevice()
  let disposed = false
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgpu')!
    if (!context) throw new Error('WebGPU canvas unavailable')
    const format = navigator.gpu.getPreferredCanvasFormat()
    context.configure({ device, format, alphaMode: 'opaque' })
    const shader = device.createShaderModule({ code: `
      struct Uniforms { matrix: mat4x4f }
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      struct Vertex { @builtin(position) position: vec4f, @location(0) color: vec3f }
      @vertex fn vertexMain(@location(0) position: vec3f, @location(1) color: vec3f) -> Vertex {
        var output: Vertex; output.position = uniforms.matrix * vec4f(position, 1.0); output.color = color; return output;
      }
      @fragment fn fragmentMain(input: Vertex) -> @location(0) vec4f { return vec4f(input.color, 1.0); }
    ` })
    const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: shader, entryPoint: 'vertexMain', buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }] }, fragment: { module: shader, entryPoint: 'fragmentMain', targets: [{ format }] }, primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' } })
    const volumeShader = device.createShaderModule({ code: volumeWgsl })
    const fieldSampler = device.createSampler({minFilter:'linear',magFilter:'linear'})
    const volumePipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: volumeShader, entryPoint: 'vertexMain' }, fragment: { module: volumeShader, entryPoint: 'fragmentMain', targets: [{ format }] } })
    const uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    const volumeUniform = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] })
    let buffer: GPUBuffer | null = null, depth: GPUTexture | null = null, color: GPUTexture | null = null, fieldTexture: GPUTexture | null = null
    let volumeGroup: GPUBindGroup | null = null, count = 0, bounds = [1, 1, 1]
    const bindVolume = () => {
      if (!depth || !color || !fieldTexture) return
      volumeGroup = device.createBindGroup({ layout: volumePipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: volumeUniform } }, { binding: 1, resource: color.createView() },
        { binding: 2, resource: depth.createView() }, { binding: 3, resource: fieldTexture.createView() },
        { binding: 4, resource: fieldSampler },
      ] })
    }
    void device.lost.then(info => { if (!disposed && info.reason !== 'destroyed') onLost() })
    device.addEventListener('uncapturederror', () => { if (!disposed) onLost() })
    return {
      canvas, name: 'WebGPU',
      resize() {
        depth?.destroy(); color?.destroy()
        depth = device.createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
        color = device.createTexture({ size: [canvas.width, canvas.height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
        bindVolume()
      },
      upload(data, field) {
        buffer?.destroy(); fieldTexture?.destroy()
        buffer = device.createBuffer({ size: Math.max(24, data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST })
        device.queue.writeBuffer(buffer, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
        fieldTexture = device.createTexture({ size: [field.width, field.height * field.layers], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST })
        device.queue.writeTexture({ texture: fieldTexture }, field.pixels.buffer as ArrayBuffer, { bytesPerRow: field.width * 4 }, { width: field.width, height: field.height * field.layers })
        bounds = field.bounds; count = data.length / 6; bindVolume()
      },
      draw(matrix, presentation) {
        if (!depth || !color || !buffer || !volumeGroup) return
        device.queue.writeBuffer(uniform, 0, matrix.buffer as ArrayBuffer, matrix.byteOffset, matrix.byteLength)
        const params = new Float32Array([...inverseMatrix(matrix), ...bounds, presentation])
        device.queue.writeBuffer(volumeUniform, 0, params.buffer)
        const encoder = device.createCommandEncoder()
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: color.createView(), clearValue: clear, loadOp: 'clear', storeOp: 'store' }], depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } })
        pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.setVertexBuffer(0, buffer); pass.draw(count); pass.end()
        const composite = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: clear, loadOp: 'clear', storeOp: 'store' }] })
        composite.setPipeline(volumePipeline); composite.setBindGroup(0, volumeGroup); composite.draw(3); composite.end()
        device.queue.submit([encoder.finish()])
      },
      dispose() { disposed = true; depth?.destroy(); color?.destroy(); fieldTexture?.destroy(); buffer?.destroy(); uniform.destroy(); volumeUniform.destroy(); context.unconfigure(); device.destroy() },
    }
  } catch (reason) { device.destroy(); throw reason }
}

function webgl(): Backend {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'low-power' })
  if (!gl) throw new Error('3D graphics unavailable')
  const shaders: WebGLShader[] = []
  const compile = (type: number, code: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, code); gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error || 'Shader compilation failed') }
    shaders.push(shader); return shader
  }
  const programFor = (v: string, f: string) => {
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl.VERTEX_SHADER, v)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, f)); gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed')
    return program
  }
  const program = programFor(`#version 300 es
    in vec3 position; in vec3 color; uniform mat4 matrix; out vec3 vColor;
    void main() { gl_Position=matrix*vec4(position,1.); gl_Position.z=2.*gl_Position.z-gl_Position.w; vColor=color; }`, `#version 300 es
    precision highp float; in vec3 vColor; out vec4 outputColor; void main() { outputColor=vec4(vColor,1.); }`)
  const volumeProgram = programFor(volumeVertexGl, volumeFragmentGl)
  const buffer = gl.createBuffer()!, vao = gl.createVertexArray()!, screenVao = gl.createVertexArray()!
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  for (const [name, offset] of [['position', 0], ['color', 12]] as const) { const location = gl.getAttribLocation(program, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 24, offset) }
  const matrixLocation = gl.getUniformLocation(program, 'matrix')
  const inverseLocation = gl.getUniformLocation(volumeProgram, 'inverseCamera'), boundsLocation = gl.getUniformLocation(volumeProgram, 'bounds')
  gl.useProgram(volumeProgram)
  for (const [i, name] of ['sceneColor', 'sceneDepth', 'field'].entries()) gl.uniform1i(gl.getUniformLocation(volumeProgram, name), i)
  const framebuffer = gl.createFramebuffer()!
  const texture = () => {
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }
  const color = texture(), depth = texture(), fieldTexture = texture()
  gl.bindTexture(gl.TEXTURE_2D,fieldTexture); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
  let count = 0, bounds = [1, 1, 1]
  gl.clearColor(clear.r, clear.g, clear.b, 1)
  return {
    canvas, name: 'WebGL',
    resize() {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.bindTexture(gl.TEXTURE_2D, color); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.bindTexture(gl.TEXTURE_2D, depth); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, canvas.width, canvas.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('3D framebuffer unavailable')
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    },
    upload(data, field) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); count = data.length / 6
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, field.width, field.height * field.layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.pixels)
      bounds = field.bounds
    },
    draw(matrix, presentation) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.enable(gl.DEPTH_TEST); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.useProgram(program); gl.bindVertexArray(vao); gl.uniformMatrix4fv(matrixLocation, false, matrix); gl.drawArrays(gl.TRIANGLES, 0, count)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.DEPTH_TEST); gl.useProgram(volumeProgram); gl.bindVertexArray(screenVao)
      gl.uniformMatrix4fv(inverseLocation, false, inverseMatrix(matrix)); gl.uniform4f(boundsLocation, ...bounds as [number,number,number], presentation)
      for (const [i,t] of [color, depth, fieldTexture].entries()) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t) }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() { gl.deleteBuffer(buffer); gl.deleteVertexArray(vao); gl.deleteVertexArray(screenVao); gl.deleteProgram(program); gl.deleteProgram(volumeProgram); shaders.forEach(s => gl.deleteShader(s)); gl.deleteFramebuffer(framebuffer); [color,depth,fieldTexture].forEach(t => gl.deleteTexture(t)); gl.getExtension('WEBGL_lose_context')?.loseContext() },
  }
}

export async function createLivingScene(host: HTMLElement, onProject: (matrix: Float32Array, width: number, height: number) => void, onLost: () => void) {
  let backend: Backend
  try { backend = await webgpu(onLost) } catch { backend = webgl() }
  const { canvas } = backend
  canvas.setAttribute('aria-hidden','true')
  host.prepend(canvas)
  let presentation=0
  let size=20, elevation=.70, azimuth=.67, zoom=1, dirty=true, disposed=false, width=1, height=1, raf=0
  let introStart=performance.now()
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches
  const pointers=new Map<number,{ x:number; y:number }>()
  let pinch=0
  const resize=() => { width=host.clientWidth; height=host.clientHeight; const dpr=Math.min(2,devicePixelRatio || 1); canvas.width=Math.max(1,Math.round(width*dpr)); canvas.height=Math.max(1,Math.round(height*dpr)); backend.resize(); dirty=true }
  const observer=new ResizeObserver(resize); observer.observe(host); resize()
  const down=(e:PointerEvent) => { pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); canvas.setPointerCapture(e.pointerId); pinch=0 }
  const move=(e:PointerEvent) => {
    const before=pointers.get(e.pointerId); if (!before) return
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY})
    if (pointers.size===2) { const [a,b]=[...pointers.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); if (pinch) zoom=Math.max(.65,Math.min(3,zoom*pinch/d)); pinch=d }
    else { azimuth-=(e.clientX-before.x)*.006; elevation=Math.max(.2,Math.min(1.48,elevation+(e.clientY-before.y)*.005)) }
    dirty=true
  }
  const up=(e:PointerEvent) => { pointers.delete(e.pointerId); pinch=0 }
  const wheel=(e:WheelEvent) => { e.preventDefault(); zoom=Math.max(.65,Math.min(3,zoom*Math.exp(e.deltaY*.001))); dirty=true }
  const lost=(e:Event) => { e.preventDefault(); if (!disposed) onLost() }
  canvas.addEventListener('pointerdown',down); canvas.addEventListener('pointermove',move); canvas.addEventListener('pointerup',up); canvas.addEventListener('pointercancel',up); canvas.addEventListener('wheel',wheel,{passive:false}); canvas.addEventListener('webglcontextlost',lost)
  const draw=(time:number) => {
    if (disposed) return
    const progress=reducedMotion ? 1 : Math.min(1,(time-introStart)/1400)
    if ((dirty || progress<1) && !document.hidden && width>0 && height>0) {
      const aspect=width/height, distance=size*(aspect<1 ? 2.45 : 1.8)*zoom*(1+.1*(1-progress))
      const a=azimuth+.08*(1-progress)
      const eye:Vec3=[Math.sin(a)*Math.cos(elevation)*distance,Math.sin(elevation)*distance,Math.cos(a)*Math.cos(elevation)*distance]
      const matrix=cameraMatrix(eye,[0,size*.035,0],aspect)
      backend.draw(matrix,presentation); onProject(matrix,width,height); dirty=false
    }
    raf=requestAnimationFrame(draw)
  }
  raf=requestAnimationFrame(draw)
  return { name:backend.name,
    update(vertices:Float32Array,nextSize:number,field:VolumeField) { backend.upload(vertices,field); size=nextSize; dirty=true },
    setPresentation(view:LivingView) { presentation=view==='volume' ? 1 : 0; dirty=true },
    reset(top=false) { elevation=top ? 1.47 : .70; azimuth=top ? 0 : .67; zoom=1; dirty=true },
    zoom(delta:number) { zoom=Math.max(.65,Math.min(3,zoom*delta)); dirty=true },
    dispose() { disposed=true; cancelAnimationFrame(raf); observer.disconnect(); canvas.removeEventListener('pointerdown',down); canvas.removeEventListener('pointermove',move); canvas.removeEventListener('pointerup',up); canvas.removeEventListener('pointercancel',up); canvas.removeEventListener('wheel',wheel); canvas.removeEventListener('webglcontextlost',lost); backend.dispose(); canvas.remove() },
    restartIntro() { introStart=performance.now(); dirty=true },
  }
}

export type LivingScene = Awaited<ReturnType<typeof createLivingScene>>
