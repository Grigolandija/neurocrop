import { VOLUME_LAYERS } from './volumeGrid'

// XYZ values are sampled from stacked height layers. The model depth occludes
// the field; empty / unsupported voxels stay transparent.
export const volumeWgsl = `
struct Uniforms { inverse: mat4x4f, bounds: vec4f }
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var sceneColor: texture_2d<f32>;
@group(0) @binding(2) var sceneDepth: texture_depth_2d;
@group(0) @binding(3) var field: texture_2d<f32>;
@vertex fn vertexMain(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
  let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(p[id],0,1);
}
fn world(ndc: vec2f, depth: f32) -> vec3f { let p=u.inverse*vec4f(ndc,depth,1); return p.xyz/p.w; }
fn sampleField(p: vec3f) -> vec4f {
  let dimensions=textureDimensions(field);
  let rows=i32(dimensions.y)/${VOLUME_LAYERS};
  let cell=clamp(vec2i(vec2f(p.x/u.bounds.x+0.5,p.z/u.bounds.y+0.5)*vec2f(f32(dimensions.x),f32(rows))),vec2i(0),vec2i(i32(dimensions.x)-1,rows-1));
  let layer=clamp(p.y/u.bounds.z*f32(${VOLUME_LAYERS})-0.5,0.0,f32(${VOLUME_LAYERS}-1));
  let lower=i32(floor(layer)); let upper=min(lower+1,${VOLUME_LAYERS}-1);
  let a=textureLoad(field,vec2i(cell.x,lower*rows+cell.y),0);
  let b=textureLoad(field,vec2i(cell.x,upper*rows+cell.y),0);
  // Premultiplication prevents dark seams at the edge of measured coverage.
  let alpha=mix(a.a,b.a,fract(layer));
  let rgb=mix(a.rgb*a.a,b.rgb*b.a,fract(layer))/max(alpha,0.00001);
  return vec4f(rgb,alpha);
}
@fragment fn fragmentMain(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let size=textureDimensions(sceneColor);
  let xy=vec2i(pixel.xy);
  let base=textureLoad(sceneColor,xy,0).rgb;
  if(u.bounds.w<0.5){return vec4f(base,1);}
  let ndc=vec2f(pixel.x/f32(size.x)*2-1,1-pixel.y/f32(size.y)*2);
  let origin=world(ndc,0);
  let direction=normalize(world(ndc,1)-origin);
  let invDir=1.0/(direction+vec3f(0.000001));
  let lo=vec3f(-u.bounds.x/2,0,-u.bounds.y/2);
  let hi=vec3f(u.bounds.x/2,u.bounds.z,u.bounds.y/2);
  let t0=(lo-origin)*invDir; let t1=(hi-origin)*invDir;
  let near=min(t0,t1); let far=max(t0,t1);
  let start=max(0.0,max(near.x,max(near.y,near.z)));
  let depth=textureLoad(sceneDepth,xy,0);
  let opaque=distance(world(ndc,depth),origin);
  let end=min(opaque,min(far.x,min(far.y,far.z)));
  if(end<=start){return vec4f(base,1);}
  let step=(end-start)/64.0;
  var color=vec3f(0); var alpha=0.0;
  for(var i=0u;i<64u;i++) {
    let p=origin+direction*(start+(f32(i)+0.5)*step);
    let roof=u.bounds.z*(1.0-0.32*abs(p.z)/(u.bounds.y/2.0));
    if(p.y>roof){continue;}
    let sample=sampleField(p);
    let a=1.0-exp(-sample.a*step*2.4/u.bounds.z);
    color+=(1.0-alpha)*a*sample.rgb;
    alpha+=(1.0-alpha)*a;
  }
  return vec4f(color+(1.0-alpha)*base,1);
}`

export const volumeVertexGl = `#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`

export const volumeFragmentGl = `#version 300 es
precision highp float;
uniform mat4 inverseCamera;
uniform vec4 bounds;
uniform sampler2D sceneColor;
uniform sampler2D sceneDepth;
uniform sampler2D field;
out vec4 outputColor;
vec3 world(vec2 ndc,float depth){vec4 p=inverseCamera*vec4(ndc,depth,1.);return p.xyz/p.w;}
vec4 sampleField(vec3 p){
  ivec2 dimensions=textureSize(field,0);int rows=dimensions.y/${VOLUME_LAYERS};
  ivec2 cell=clamp(ivec2(vec2(p.x/bounds.x+.5,p.z/bounds.y+.5)*vec2(dimensions.x,rows)),ivec2(0),ivec2(dimensions.x-1,rows-1));
  float layer=clamp(p.y/bounds.z*float(${VOLUME_LAYERS})-.5,0.,float(${VOLUME_LAYERS}-1));
  int lower=int(floor(layer)),upper=min(lower+1,${VOLUME_LAYERS}-1);
  vec4 a=texelFetch(field,ivec2(cell.x,lower*rows+cell.y),0),b=texelFetch(field,ivec2(cell.x,upper*rows+cell.y),0);
  float alpha=mix(a.a,b.a,fract(layer));
  vec3 rgb=mix(a.rgb*a.a,b.rgb*b.a,fract(layer))/max(alpha,.00001);
  return vec4(rgb,alpha);
}
void main(){
  ivec2 size=textureSize(sceneColor,0),xy=ivec2(gl_FragCoord.xy);
  vec3 base=texelFetch(sceneColor,xy,0).rgb;
  if(bounds.w<.5){outputColor=vec4(base,1.);return;}
  vec2 ndc=gl_FragCoord.xy/vec2(size)*2.-1.;
  vec3 origin=world(ndc,0.),direction=normalize(world(ndc,1.)-origin);
  vec3 invDir=1./(direction+vec3(.000001));
  vec3 t0=(vec3(-bounds.x/2.,0.,-bounds.y/2.)-origin)*invDir;
  vec3 t1=(vec3(bounds.x/2.,bounds.z,bounds.y/2.)-origin)*invDir;
  vec3 near=min(t0,t1),far=max(t0,t1);
  float start=max(0.,max(near.x,max(near.y,near.z)));
  float opaque=distance(world(ndc,texelFetch(sceneDepth,xy,0).r),origin);
  float end=min(opaque,min(far.x,min(far.y,far.z)));
  if(end<=start){outputColor=vec4(base,1.);return;}
  float stepSize=(end-start)/64.,alpha=0.;vec3 color=vec3(0.);
  for(int i=0;i<64;i++){
    vec3 p=origin+direction*(start+(float(i)+.5)*stepSize);
    float roof=bounds.z*(1.-.32*abs(p.z)/(bounds.y/2.));
    if(p.y>roof)continue;
    vec4 s=sampleField(p);
    float a=1.-exp(-s.a*stepSize*2.4/bounds.z);
    color+=(1.-alpha)*a*s.rgb;alpha+=(1.-alpha)*a;
  }
  outputColor=vec4(color+(1.-alpha)*base,1.);
}`
