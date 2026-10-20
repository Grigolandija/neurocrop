import { VOLUME_LAYERS } from './volumeGrid'

// Transparent XYZ volume across the greenhouse envelope. A subtle boundary
// makes its extent visible without an opaque plane hiding the saved layout.
export const volumeWgsl = `
struct Uniforms { inverse: mat4x4f, bounds: vec4f }
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var sceneColor: texture_2d<f32>;
@group(0) @binding(2) var sceneDepth: texture_depth_2d;
@group(0) @binding(3) var field: texture_2d<f32>;
@group(0) @binding(4) var fieldSampler: sampler;
@vertex fn vertexMain(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
  let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(p[id],0,1);
}
fn world(ndc: vec2f, depth: f32) -> vec3f { let p=u.inverse*vec4f(ndc,depth,1); return p.xyz/p.w; }
fn colorAt(t: f32) -> vec3f {
  let stops=array<vec3f,5>(vec3f(.10,.42,.90),vec3f(.06,.78,.86),vec3f(.89,.89,.45),vec3f(1,.57,.18),vec3f(.94,.22,.25));
  let x=clamp(t,0.0,.99999)*4;let i=u32(floor(x));return mix(stops[i],stops[i+1u],fract(x));
}
fn sampleField(p: vec3f) -> vec4f {
  if(abs(p.x)>u.bounds.x/2 || abs(p.z)>u.bounds.y/2 || p.y<0 || p.y>u.bounds.z*(1-.32*abs(p.z)/(u.bounds.y/2))){return vec4f(0);}
  let size=vec2f(textureDimensions(field));let rows=size.y/f32(${VOLUME_LAYERS});
  let cell=clamp(vec2f(p.x/u.bounds.x+.5,p.z/u.bounds.y+.5),vec2f(.5)/vec2f(size.x,rows),vec2f(1)-vec2f(.5)/vec2f(size.x,rows));
  let y=clamp(p.y/u.bounds.z*f32(${VOLUME_LAYERS})-.5,0.0,f32(${VOLUME_LAYERS}-1));
  let lower=floor(y);let upper=min(lower+1,f32(${VOLUME_LAYERS}-1));
  let a=textureSampleLevel(field,fieldSampler,vec2f(cell.x,(lower+cell.y)/f32(${VOLUME_LAYERS})),0);
  let b=textureSampleLevel(field,fieldSampler,vec2f(cell.x,(upper+cell.y)/f32(${VOLUME_LAYERS})),0);
  let s=mix(a,b,fract(y));return vec4f(s.rgb/max(s.a,.00001),s.a);
}
fn fieldColor(s: vec4f) -> vec3f {
  let rgb=colorAt(s.r);return mix(rgb,vec3f(dot(rgb,vec3f(.25,.55,.2))),(.12+.16*s.b)*(1-s.g));
}
@fragment fn fragmentMain(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let size=textureDimensions(sceneColor);let xy=vec2i(pixel.xy);var base=textureLoad(sceneColor,xy,0).rgb;
  if(u.bounds.w<.5){return vec4f(base,1);}
  let ndc=vec2f(pixel.x/f32(size.x)*2-1,1-pixel.y/f32(size.y)*2);
  let origin=world(ndc,0);let direction=normalize(world(ndc,1)-origin);
  let opaque=distance(world(ndc,textureLoad(sceneDepth,xy,0)),origin);
  let inv=1/(direction+vec3f(.000001));
  let t0=(vec3f(-u.bounds.x/2,0,-u.bounds.y/2)-origin)*inv;
  let t1=(vec3f(u.bounds.x/2,u.bounds.z,u.bounds.y/2)-origin)*inv;
  let near=min(t0,t1);let far=max(t0,t1);
  let start=max(0.0,max(near.x,max(near.y,near.z)));let end=min(opaque,min(far.x,min(far.y,far.z)));
  if(end<=start){return vec4f(base,1);}
  let ds=(end-start)/96;var rgb=vec3f(0);var opacity=0.0;
  for(var iteration=0u;iteration<96u;iteration++){
    let p=origin+direction*(start+(f32(iteration)+.5)*ds);let s=sampleField(p);
    let edge=min(min(u.bounds.x/2-abs(p.x),u.bounds.y/2-abs(p.z)),u.bounds.z*(1-.32*abs(p.z)/(u.bounds.y/2))-p.y);
    let a=((1-exp(-ds*.22/u.bounds.z))+.07*(1-smoothstep(.0,ds*1.4,edge)))*s.a;
    rgb+=(1-opacity)*a*fieldColor(s);opacity+=(1-opacity)*a;
  }
  return vec4f(mix(base,rgb/max(opacity,.00001),min(opacity,.72)),1);
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
vec3 colorAt(float t){
  vec3 stops[5]=vec3[5](vec3(.10,.42,.90),vec3(.06,.78,.86),vec3(.89,.89,.45),vec3(1.,.57,.18),vec3(.94,.22,.25));
  float x=clamp(t,0.,.99999)*4.;int i=int(floor(x));return mix(stops[i],stops[i+1],fract(x));
}
vec4 sampleField(vec3 p){
  if(abs(p.x)>bounds.x/2. || abs(p.z)>bounds.y/2. || p.y<0. || p.y>bounds.z*(1.-.32*abs(p.z)/(bounds.y/2.)))return vec4(0.);
  vec2 size=vec2(textureSize(field,0));float rows=size.y/float(${VOLUME_LAYERS});
  vec2 cell=clamp(vec2(p.x/bounds.x+.5,p.z/bounds.y+.5),vec2(.5)/vec2(size.x,rows),vec2(1.)-vec2(.5)/vec2(size.x,rows));
  float y=clamp(p.y/bounds.z*float(${VOLUME_LAYERS})-.5,0.,float(${VOLUME_LAYERS}-1));
  float lower=floor(y),upper=min(lower+1.,float(${VOLUME_LAYERS}-1));
  vec4 a=texture(field,vec2(cell.x,(lower+cell.y)/float(${VOLUME_LAYERS}))),b=texture(field,vec2(cell.x,(upper+cell.y)/float(${VOLUME_LAYERS})));
  vec4 s=mix(a,b,fract(y));return vec4(s.rgb/max(s.a,.00001),s.a);
}
vec3 fieldColor(vec4 s){vec3 rgb=colorAt(s.r);return mix(rgb,vec3(dot(rgb,vec3(.25,.55,.2))),(.12+.16*s.b)*(1.-s.g));}
void main(){
  ivec2 size=textureSize(sceneColor,0),xy=ivec2(gl_FragCoord.xy);vec3 base=texelFetch(sceneColor,xy,0).rgb;
  if(bounds.w<.5){outputColor=vec4(base,1.);return;}
  vec2 ndc=gl_FragCoord.xy/vec2(size)*2.-1.;vec3 origin=world(ndc,0.),direction=normalize(world(ndc,1.)-origin);
  float opaque=distance(world(ndc,texelFetch(sceneDepth,xy,0).r),origin);
  vec3 inv=1./(direction+vec3(.000001));vec3 t0=(vec3(-bounds.x/2.,0.,-bounds.y/2.)-origin)*inv,t1=(vec3(bounds.x/2.,bounds.z,bounds.y/2.)-origin)*inv;
  vec3 near=min(t0,t1),far=max(t0,t1);float start=max(0.,max(near.x,max(near.y,near.z))),end=min(opaque,min(far.x,min(far.y,far.z)));
  if(end<=start){outputColor=vec4(base,1.);return;}
  float ds=(end-start)/96.,opacity=0.;vec3 rgb=vec3(0.);
  for(int iteration=0;iteration<96;iteration++){
    vec3 p=origin+direction*(start+(float(iteration)+.5)*ds);vec4 s=sampleField(p);
    float edge=min(min(bounds.x/2.-abs(p.x),bounds.y/2.-abs(p.z)),bounds.z*(1.-.32*abs(p.z)/(bounds.y/2.))-p.y);
    float a=((1.-exp(-ds*.22/bounds.z))+.07*(1.-smoothstep(0.,ds*1.4,edge)))*s.a;
    rgb+=(1.-opacity)*a*fieldColor(s);opacity+=(1.-opacity)*a;
  }
  outputColor=vec4(mix(base,rgb/max(opacity,.00001),min(opacity,.72)),1.);
}`
