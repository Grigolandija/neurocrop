import { VOLUME_LAYERS } from './volumeGrid'

// Readable contour surfaces at measured heights, plus a vertical section between
// those heights. Every surface samples the same XYZ field; unsupported areas
// remain empty. Opaque scene depth keeps walls and equipment in front.
export const volumeWgsl = `
struct Uniforms { inverse: mat4x4f, bounds: vec4f, levels0: vec4f, levels1: vec4f }
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var sceneColor: texture_2d<f32>;
@group(0) @binding(2) var sceneDepth: texture_depth_2d;
@group(0) @binding(3) var field: texture_2d<f32>;
@vertex fn vertexMain(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
  let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(p[id],0,1);
}
fn world(ndc: vec2f, depth: f32) -> vec3f { let p=u.inverse*vec4f(ndc,depth,1); return p.xyz/p.w; }
fn level(i: u32) -> f32 { if(i<4u){return u.levels0[i];}return u.levels1[i-4u]; }
fn colorAt(t: f32) -> vec3f {
  let stops=array<vec3f,5>(vec3f(.10,.42,.90),vec3f(.06,.78,.86),vec3f(.89,.89,.45),vec3f(1,.57,.18),vec3f(.94,.22,.25));
  let x=clamp(t,0.0,.99999)*4;let i=u32(floor(x));return mix(stops[i],stops[i+1u],fract(x));
}
fn cellValue(cell: vec2i, layer: i32, rows: i32) -> vec4f {
  let size=textureDimensions(field);
  let c=clamp(cell,vec2i(0),vec2i(i32(size.x)-1,rows-1));
  let sample=textureLoad(field,vec2i(c.x,layer*rows+c.y),0);
  // Weighted interpolation must not blend a valid observation with empty zeros.
  return vec4f(sample.r*sample.a,sample.g*sample.a,0,sample.a);
}
fn layerValue(cell: vec2f, layer: i32, rows: i32) -> vec4f {
  let c=vec2i(floor(cell));let f=fract(cell);
  return mix(mix(cellValue(c,layer,rows),cellValue(c+vec2i(1,0),layer,rows),f.x),mix(cellValue(c+vec2i(0,1),layer,rows),cellValue(c+vec2i(1,1),layer,rows),f.x),f.y);
}
fn shade(p: vec3f) -> vec4f {
  if(abs(p.x)>u.bounds.x/2 || abs(p.z)>u.bounds.y/2 || p.y<0 || p.y>u.bounds.z*(1-.32*abs(p.z)/(u.bounds.y/2))){return vec4f(0);}
  let size=textureDimensions(field);let rows=i32(size.y)/${VOLUME_LAYERS};
  let cell=vec2f(p.x/u.bounds.x+.5,p.z/u.bounds.y+.5)*vec2f(f32(size.x),f32(rows))-.5;
  let y=clamp(p.y/u.bounds.z*f32(${VOLUME_LAYERS})-.5,0.0,f32(${VOLUME_LAYERS}-1));
  let lower=i32(floor(y));let s=mix(layerValue(cell,lower,rows),layerValue(cell,min(lower+1,${VOLUME_LAYERS}-1),rows),fract(y));
  if(s.a<.5){return vec4f(0);}
  let value=s.r/max(s.a,.00001);let confidence=s.g/max(s.a,.00001);
  let contour=1-smoothstep(.018,.065,abs(fract(value*10+.5)-.5));
  let color=mix(colorAt(value),vec3f(.92,.99,.98),contour*.38);
  return vec4f(color,(.72+.18*confidence)*smoothstep(.5,.85,s.a));
}
@fragment fn fragmentMain(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let size=textureDimensions(sceneColor);let xy=vec2i(pixel.xy);let base=textureLoad(sceneColor,xy,0).rgb;
  if(u.bounds.w<.5){return vec4f(base,1);}
  let ndc=vec2f(pixel.x/f32(size.x)*2-1,1-pixel.y/f32(size.y)*2);
  let origin=world(ndc,0);let direction=normalize(world(ndc,1)-origin);
  let opaque=distance(world(ndc,textureLoad(sceneDepth,xy,0)),origin);
  var hits: array<f32,9>;
  for(var i=0u;i<8u;i++){
    hits[i]=1e20;
    if(level(i)>=0 && abs(direction.y)>.0001){let t=(level(i)-origin.y)/direction.y;if(t>0 && t<opaque){hits[i]=t;}}
  }
  hits[8]=1e20;
  if(level(1u)>=0 && abs(direction.z)>.0001){let t=-origin.z/direction.z;if(t>0 && t<opaque){hits[8]=t;}}
  var color=vec3f(0);var alpha=0.0;
  for(var iteration=0u;iteration<9u;iteration++){
    var nearest=1e20;var index=0u;
    for(var i=0u;i<9u;i++){if(hits[i]<nearest){nearest=hits[i];index=i;}}
    if(nearest>=1e19){break;}
    hits[index]=1e20;let p=origin+direction*nearest;let s=shade(p);
    let opacity=select(s.a,s.a*.65,index==8u);
    color+=(1-alpha)*opacity*s.rgb;alpha+=(1-alpha)*opacity;
  }
  return vec4f(color+(1-alpha)*base,1);
}`

export const volumeVertexGl = `#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`

export const volumeFragmentGl = `#version 300 es
precision highp float;
uniform mat4 inverseCamera;
uniform vec4 bounds;
uniform float levels[8];
uniform sampler2D sceneColor;
uniform sampler2D sceneDepth;
uniform sampler2D field;
out vec4 outputColor;
vec3 world(vec2 ndc,float depth){vec4 p=inverseCamera*vec4(ndc,depth,1.);return p.xyz/p.w;}
vec3 colorAt(float t){
  vec3 stops[5]=vec3[5](vec3(.10,.42,.90),vec3(.06,.78,.86),vec3(.89,.89,.45),vec3(1.,.57,.18),vec3(.94,.22,.25));
  float x=clamp(t,0.,.99999)*4.;int i=int(floor(x));return mix(stops[i],stops[i+1],fract(x));
}
vec4 cellValue(ivec2 cell,int layer,int rows){
  ivec2 size=textureSize(field,0);ivec2 c=clamp(cell,ivec2(0),ivec2(size.x-1,rows-1));
  vec4 s=texelFetch(field,ivec2(c.x,layer*rows+c.y),0);return vec4(s.r*s.a,s.g*s.a,0.,s.a);
}
vec4 layerValue(vec2 cell,int layer,int rows){
  ivec2 c=ivec2(floor(cell));vec2 f=fract(cell);
  return mix(mix(cellValue(c,layer,rows),cellValue(c+ivec2(1,0),layer,rows),f.x),mix(cellValue(c+ivec2(0,1),layer,rows),cellValue(c+ivec2(1,1),layer,rows),f.x),f.y);
}
vec4 shade(vec3 p){
  if(abs(p.x)>bounds.x/2. || abs(p.z)>bounds.y/2. || p.y<0. || p.y>bounds.z*(1.-.32*abs(p.z)/(bounds.y/2.)))return vec4(0.);
  ivec2 size=textureSize(field,0);int rows=size.y/${VOLUME_LAYERS};
  vec2 cell=vec2(p.x/bounds.x+.5,p.z/bounds.y+.5)*vec2(size.x,rows)-.5;
  float y=clamp(p.y/bounds.z*float(${VOLUME_LAYERS})-.5,0.,float(${VOLUME_LAYERS}-1));
  int lower=int(floor(y));vec4 s=mix(layerValue(cell,lower,rows),layerValue(cell,min(lower+1,${VOLUME_LAYERS}-1),rows),fract(y));
  if(s.a<.5)return vec4(0.);
  float value=s.r/max(s.a,.00001),confidence=s.g/max(s.a,.00001);
  float contour=1.-smoothstep(.018,.065,abs(fract(value*10.+.5)-.5));
  vec3 color=mix(colorAt(value),vec3(.92,.99,.98),contour*.38);
  return vec4(color,(.72+.18*confidence)*smoothstep(.5,.85,s.a));
}
void main(){
  ivec2 size=textureSize(sceneColor,0),xy=ivec2(gl_FragCoord.xy);vec3 base=texelFetch(sceneColor,xy,0).rgb;
  if(bounds.w<.5){outputColor=vec4(base,1.);return;}
  vec2 ndc=gl_FragCoord.xy/vec2(size)*2.-1.;
  vec3 origin=world(ndc,0.),direction=normalize(world(ndc,1.)-origin);
  float opaque=distance(world(ndc,texelFetch(sceneDepth,xy,0).r),origin);
  float hits[9];
  for(int i=0;i<8;i++){
    hits[i]=1e20;
    if(levels[i]>=0. && abs(direction.y)>.0001){float t=(levels[i]-origin.y)/direction.y;if(t>0. && t<opaque)hits[i]=t;}
  }
  hits[8]=1e20;
  if(levels[1]>=0. && abs(direction.z)>.0001){float t=-origin.z/direction.z;if(t>0. && t<opaque)hits[8]=t;}
  vec3 color=vec3(0.);float alpha=0.;
  for(int iteration=0;iteration<9;iteration++){
    float nearest=1e20;int index=0;
    for(int i=0;i<9;i++){if(hits[i]<nearest){nearest=hits[i];index=i;}}
    if(nearest>=1e19)break;
    hits[index]=1e20;vec4 s=shade(origin+direction*nearest);float opacity=s.a*(index==8 ? .65 : 1.);
    color+=(1.-alpha)*opacity*s.rgb;alpha+=(1.-alpha)*opacity;
  }
  outputColor=vec4(color+(1.-alpha)*base,1.);
}`
