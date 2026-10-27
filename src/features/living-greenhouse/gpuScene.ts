/// <reference types="@webgpu/types" />
import { cameraMatrix, inverseMatrix, type Vec3 } from './sceneMath'
import { sortWallSurfaces,WALL_OPACITY } from './wallSurfaces'
import type { VolumeField } from './sceneGeometry'
import type { LivingView } from './spatialEvidence'
import { volumeWgsl, volumeVertexGl, volumeFragmentGl } from './volumeShaders'

type Backend = {
  canvas: HTMLCanvasElement
  name: 'WebGPU' | 'WebGL'
  maxPixels?: number
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
  // Software Vulkan executes the volume shader on the CPU. A full HiDPI
  // framebuffer can hit the driver's watchdog before the first frame finishes.
  // Keep CSS coordinates and camera framing intact; bound only raster density.
  const software = /swiftshader|software|llvmpipe/i.test(
    [adapter.info?.vendor, adapter.info?.architecture, adapter.info?.device, adapter.info?.description].join(' ')
  )
  const device = await adapter.requestDevice()
  let disposed = false
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgpu')!
    if (!context) throw new Error('WebGPU canvas unavailable')
    const format = navigator.gpu.getPreferredCanvasFormat()
    context.configure({ device, format, alphaMode: 'opaque' })
    const shader = device.createShaderModule({ code: `
      struct Uniforms { matrix: mat4x4f, material: vec4f }
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      struct Vertex { @builtin(position) position: vec4f, @location(0) color: vec3f }
      @vertex fn vertexMain(@location(0) position: vec3f, @location(1) color: vec3f) -> Vertex {
        var output: Vertex; output.position = uniforms.matrix * vec4f(position, 1.0); output.color = color; return output;
      }
      @fragment fn fragmentMain(input: Vertex) -> @location(0) vec4f { return vec4f(input.color, 1.0); }
      @fragment fn fragmentWall(input: Vertex) -> @location(0) vec4f { return vec4f(input.color, uniforms.material.x); }
    ` })
    const matrixLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}}]})
    const meshLayout=device.createPipelineLayout({bindGroupLayouts:[matrixLayout]})
    const pipeline = await device.createRenderPipelineAsync({ layout: meshLayout, vertex: { module: shader, entryPoint: 'vertexMain', buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }] }, fragment: { module: shader, entryPoint: 'fragmentMain', targets: [{ format }] }, primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' } })
    const wallPipeline=await device.createRenderPipelineAsync({layout:meshLayout,vertex:{module:shader,entryPoint:'vertexMain',buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'}]}]},fragment:{module:shader,entryPoint:'fragmentWall',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth24plus',depthWriteEnabled:false,depthCompare:'less-equal'}})
    const volumeShader = device.createShaderModule({ code: volumeWgsl })
    const fieldSampler = device.createSampler({minFilter:'linear',magFilter:'linear'})
    const volumePipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: volumeShader, entryPoint: 'vertexMain' }, fragment: { module: volumeShader, entryPoint: 'fragmentMain', targets: [{ format }] } })
    const uniform = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    const volumeUniform = device.createBuffer({ size: 672, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] })
    let buffer: GPUBuffer | null = null, depth: GPUTexture | null = null, color: GPUTexture | null = null, fieldTexture: GPUTexture | null = null
    let wallBuffer:GPUBuffer|null=null, surfaces=new Float32Array(),surfaceOpacity=WALL_OPACITY
    let volumeGroup: GPUBindGroup | null = null, count = 0, bounds = [1, 1, 1], contours = Array(8).fill(-1), palette = new Float32Array(132), roofSlope = .32, slicePlane = [0,0,1,0]
    const bindVolume = () => {
      if (!depth || !color || !fieldTexture) return
      volumeGroup = device.createBindGroup({ layout: volumePipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: volumeUniform } }, { binding: 1, resource: color.createView() },
        { binding: 2, resource: depth.createView() }, { binding: 3, resource: fieldTexture.createView() },
        { binding: 4, resource: fieldSampler },
      ] })
    }
    void device.lost.then(info => { if (!disposed && info.reason !== 'destroyed') { console.warn('NeuroCrop WebGPU device lost:', info.reason, info.message); onLost() } })
    device.addEventListener('uncapturederror', event => { if (!disposed) { console.warn('NeuroCrop WebGPU rendering error:', event.error.message); onLost() } })
    return {
      canvas, name: 'WebGPU', maxPixels: software ? 262144 : undefined,
      resize() {
        depth?.destroy(); color?.destroy()
        depth = device.createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
        color = device.createTexture({ size: [canvas.width, canvas.height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
        bindVolume()
      },
      upload(data, field) {
        buffer?.destroy(); fieldTexture?.destroy();wallBuffer?.destroy()
        surfaces=field.surfaces ? new Float32Array(field.surfaces) : new Float32Array();surfaceOpacity=field.surfaceOpacity ?? WALL_OPACITY
        wallBuffer=surfaces.length ? device.createBuffer({size:surfaces.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}) : null
        buffer = device.createBuffer({ size: Math.max(24, data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST })
        device.queue.writeBuffer(buffer, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
        fieldTexture = device.createTexture({ size: [field.width, field.height * field.layers], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST })
        device.queue.writeTexture({ texture: fieldTexture }, field.pixels.buffer as ArrayBuffer, { bytesPerRow: field.width * 4 }, { width: field.width, height: field.height * field.layers })
        bounds = field.bounds; roofSlope = field.roofSlope ?? .32; slicePlane = field.slicePlane || [0,0,1,0]; palette = field.palette ? new Float32Array(field.palette) : new Float32Array(132); contours=Array.from({length:8},(_,i)=>field.contours[i]?.normalized ?? -1); count = data.length / 6; bindVolume()
      },
      draw(matrix, presentation) {
        if (!depth || !color || !buffer || !volumeGroup) return
        device.queue.writeBuffer(uniform,0,new Float32Array([...matrix,surfaceOpacity,0,0,0]).buffer)
        const params = new Float32Array([...inverseMatrix(matrix), ...bounds, presentation, ...contours, ...palette, roofSlope, 0, 0, 0, ...slicePlane])
        device.queue.writeBuffer(volumeUniform, 0, params.buffer)
        const encoder = device.createCommandEncoder()
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: color.createView(), clearValue: clear, loadOp: 'clear', storeOp: 'store' }], depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } })
        pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.setVertexBuffer(0, buffer); pass.draw(count)
        if(wallBuffer && surfaces.length){const sorted=sortWallSurfaces(surfaces,matrix);device.queue.writeBuffer(wallBuffer,0,sorted.buffer);pass.setPipeline(wallPipeline);pass.setBindGroup(0,bindGroup);pass.setVertexBuffer(0,wallBuffer);pass.draw(surfaces.length/6)}
        pass.end()
        const composite = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: clear, loadOp: 'clear', storeOp: 'store' }] })
        composite.setPipeline(volumePipeline); composite.setBindGroup(0, volumeGroup); composite.draw(3); composite.end()
        device.queue.submit([encoder.finish()])
      },
      dispose() { disposed = true; depth?.destroy(); color?.destroy(); fieldTexture?.destroy(); buffer?.destroy(); wallBuffer?.destroy(); uniform.destroy(); volumeUniform.destroy(); context.unconfigure(); device.destroy() },
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
    precision highp float; in vec3 vColor; uniform float opacity; out vec4 outputColor; void main() { outputColor=vec4(vColor,opacity); }`)
  const volumeProgram = programFor(volumeVertexGl, volumeFragmentGl)
  const buffer = gl.createBuffer()!, vao = gl.createVertexArray()!, screenVao = gl.createVertexArray()!
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  for (const [name, offset] of [['position', 0], ['color', 12]] as const) { const location = gl.getAttribLocation(program, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 24, offset) }
  const wallBuffer=gl.createBuffer()!,wallVao=gl.createVertexArray()!
  gl.bindVertexArray(wallVao);gl.bindBuffer(gl.ARRAY_BUFFER,wallBuffer)
  for(const [name,offset] of [['position',0],['color',12]] as const){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,24,offset)}
  let surfaces=new Float32Array(),surfaceOpacity=WALL_OPACITY
  const opacityLocation=gl.getUniformLocation(program,'opacity')
  const matrixLocation = gl.getUniformLocation(program, 'matrix')
  const inverseLocation = gl.getUniformLocation(volumeProgram, 'inverseCamera'), boundsLocation = gl.getUniformLocation(volumeProgram, 'bounds')
  const slicePlaneLocation=gl.getUniformLocation(volumeProgram,'slicePlane'), roofSlopeLocation=gl.getUniformLocation(volumeProgram,'roofSlope'), contoursLocation=gl.getUniformLocation(volumeProgram,'contours[0]'), paletteLocation=gl.getUniformLocation(volumeProgram,'palette[0]')
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
  let count = 0, bounds = [1, 1, 1], contours = Array(8).fill(-1), palette = new Float32Array(132), roofSlope = .32, slicePlane = [0,0,1,0]
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
      surfaces=field.surfaces ? new Float32Array(field.surfaces) : new Float32Array();surfaceOpacity=field.surfaceOpacity ?? WALL_OPACITY
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); count = data.length / 6
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, field.width, field.height * field.layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.pixels)
      bounds = field.bounds; roofSlope = field.roofSlope ?? .32; slicePlane = field.slicePlane || [0,0,1,0]; palette = field.palette ? new Float32Array(field.palette) : new Float32Array(132); contours=Array.from({length:8},(_,i)=>field.contours[i]?.normalized ?? -1)
    },
    draw(matrix, presentation) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.enable(gl.DEPTH_TEST); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.useProgram(program); gl.bindVertexArray(vao); gl.uniformMatrix4fv(matrixLocation, false, matrix);gl.uniform1f(opacityLocation,1);gl.drawArrays(gl.TRIANGLES, 0, count)
      if(surfaces.length){
        gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false)
        gl.bindVertexArray(wallVao);gl.bindBuffer(gl.ARRAY_BUFFER,wallBuffer);gl.bufferData(gl.ARRAY_BUFFER,sortWallSurfaces(surfaces,matrix),gl.DYNAMIC_DRAW);gl.uniform1f(opacityLocation,surfaceOpacity);gl.drawArrays(gl.TRIANGLES,0,surfaces.length/6)
        gl.depthMask(true);gl.disable(gl.BLEND)
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.DEPTH_TEST); gl.useProgram(volumeProgram); gl.bindVertexArray(screenVao)
      gl.uniformMatrix4fv(inverseLocation, false, inverseMatrix(matrix)); gl.uniform4f(boundsLocation, ...bounds as [number,number,number], presentation); gl.uniform1fv(contoursLocation, contours); gl.uniform4fv(paletteLocation, palette); gl.uniform1f(roofSlopeLocation, roofSlope); gl.uniform4fv(slicePlaneLocation, slicePlane)
      for (const [i,t] of [color, depth, fieldTexture].entries()) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t) }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() { gl.deleteBuffer(buffer); gl.deleteBuffer(wallBuffer);gl.deleteVertexArray(wallVao);gl.deleteVertexArray(vao); gl.deleteVertexArray(screenVao); gl.deleteProgram(program); gl.deleteProgram(volumeProgram); shaders.forEach(s => gl.deleteShader(s)); gl.deleteFramebuffer(framebuffer); [color,depth,fieldTexture].forEach(t => gl.deleteTexture(t)); gl.getExtension('WEBGL_lose_context')?.loseContext() },
  }
}

export type LivingSceneCamera={azimuth:number;elevation:number;zoom:number;target:Vec3|null;extent:number|null}

export async function createLivingScene(host: HTMLElement, onProject: (matrix: Float32Array, width: number, height: number) => void, onLost: () => void, camera: {targetHeight?:number;elevation?:number;zoom?:number;animateIntro?:boolean;backend?:'webgl'} = {}) {
  let backend: Backend
  if(camera.backend==='webgl')backend=webgl()
  else try { backend = await webgpu(onLost) } catch { backend = webgl() }
  const { canvas } = backend
  canvas.setAttribute('aria-hidden','true')
  host.prepend(canvas)
  let presentation=0
  let size=20, elevation=camera.elevation ?? .70, azimuth=.67, zoom=camera.zoom ?? 1, dirty=true, disposed=false, width=1, height=1, raf=0
  let focusTarget: Vec3 | null = null, focusSize: number | null = null
  let introStart=performance.now()
  const reducedMotion=camera.animateIntro===false || matchMedia('(prefers-reduced-motion: reduce)').matches
  const pointers=new Map<number,{ x:number; y:number }>()
  let pinch=0
  let allocated=false
  const resize=() => {
    width=host.clientWidth; height=host.clientHeight
    const dpr=Math.min(2,devicePixelRatio || 1,Math.sqrt((backend.maxPixels ?? Infinity)/Math.max(1,width*height)))
    const nextWidth=Math.max(1,Math.round(width*dpr)),nextHeight=Math.max(1,Math.round(height*dpr))
    if(!allocated || canvas.width!==nextWidth || canvas.height!==nextHeight){canvas.width=nextWidth;canvas.height=nextHeight;backend.resize();allocated=true}
    dirty=true
  }
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
  const wheel=(e:WheelEvent) => {
    if (!e.altKey) return
    e.preventDefault()
    zoom=Math.max(.65,Math.min(3,zoom*Math.exp(e.deltaY*.001)))
    dirty=true
  }
  const lost=(e:Event) => { e.preventDefault(); if (!disposed) onLost() }
  canvas.addEventListener('pointerdown',down); canvas.addEventListener('pointermove',move); canvas.addEventListener('pointerup',up); canvas.addEventListener('pointercancel',up); canvas.addEventListener('wheel',wheel,{passive:false}); canvas.addEventListener('webglcontextlost',lost)
  const draw=(time:number) => {
    if (disposed) return
    const progress=reducedMotion ? 1 : Math.min(1,(time-introStart)/1400)
    if ((dirty || progress<1) && !document.hidden && width>0 && height>0) {
      const aspect=width/height, distance=(focusSize ?? size)*(aspect<1 ? 2.45 : 1.8)*zoom*(1+.1*(1-progress))
      const a=azimuth+.08*(1-progress)
      const eye:Vec3=[(focusTarget?.[0] ?? 0)+Math.sin(a)*Math.cos(elevation)*distance,Math.sin(elevation)*distance+(focusTarget?.[1] ?? camera.targetHeight ?? 0),(focusTarget?.[2] ?? 0)+Math.cos(a)*Math.cos(elevation)*distance]
      const matrix=cameraMatrix(eye,focusTarget ?? [0,camera.targetHeight ?? size*.035,0],aspect)
      backend.draw(matrix,presentation); onProject(matrix,width,height); dirty=false
    }
    raf=requestAnimationFrame(draw)
  }
  raf=requestAnimationFrame(draw)
  return { name:backend.name,
    getCamera():LivingSceneCamera { return {azimuth,elevation,zoom,target:focusTarget ? [...focusTarget] : null,extent:focusSize} },
    restoreCamera(view:LivingSceneCamera) {
      if(![view.azimuth,view.elevation,view.zoom].every(Number.isFinite) || (view.target!==null && (view.target.length!==3 || !view.target.every(Number.isFinite))) || (view.extent!==null && (!Number.isFinite(view.extent) || view.extent<=0)))return
      azimuth=view.azimuth;elevation=Math.max(.2,Math.min(1.48,view.elevation));zoom=Math.max(.65,Math.min(3,view.zoom));focusTarget=view.target ? [...view.target] : null;focusSize=view.extent;dirty=true
    },
    invalidate() { dirty=true },
    update(vertices:Float32Array,nextSize:number,field:VolumeField) { backend.upload(vertices,field); size=nextSize; dirty=true },
    setPresentation(view:LivingView, topography=false, spatialField=false) { presentation=view==='slice' ? 4 : view==='volume' ? spatialField ? 3 : topography ? 2 : 1 : 0; dirty=true },
    reset(top=false) { elevation=top ? 1.47 : camera.elevation ?? .70; azimuth=top ? 0 : .67; zoom=camera.zoom ?? 1; dirty=true },
    zoom(delta:number) { zoom=Math.max(.65,Math.min(3,zoom*delta)); dirty=true },
    focus(target:Vec3 | null,extent?:number) { focusTarget=target; focusSize=extent ?? null; zoom=camera.zoom ?? 1; dirty=true },
    shiftOrigin(delta:Vec3) { const target=focusTarget ?? [0,camera.targetHeight ?? size*.035,0];focusTarget=target.map((n,i)=>n+delta[i]) as Vec3;dirty=true },
    dispose() { disposed=true; cancelAnimationFrame(raf); observer.disconnect(); canvas.removeEventListener('pointerdown',down); canvas.removeEventListener('pointermove',move); canvas.removeEventListener('pointerup',up); canvas.removeEventListener('pointercancel',up); canvas.removeEventListener('wheel',wheel); canvas.removeEventListener('webglcontextlost',lost); backend.dispose(); canvas.remove() },
    restartIntro() { introStart=performance.now(); dirty=true },
  }
}

export type LivingScene = Awaited<ReturnType<typeof createLivingScene>>
