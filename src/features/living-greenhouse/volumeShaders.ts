import { VOLUME_LAYERS } from './volumeGrid'

// Transparent XYZ volume across the greenhouse envelope. A subtle boundary
// makes its extent visible without an opaque plane hiding the saved layout.
export const volumeWgsl = `
struct Uniforms { inverse: mat4x4f, bounds: vec4f, contours: array<vec4f,2>, palette: array<vec4f,33>, envelope: vec4f }
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
  let x=clamp(t,0.0,.99999)*32;let i=u32(floor(x));return mix(u.palette[i].rgb,u.palette[i+1u].rgb,fract(x));
}
fn sampleField(p: vec3f) -> vec4f {
  if(abs(p.x)>u.bounds.x/2 || abs(p.z)>u.bounds.y/2 || p.y<0 || p.y>u.bounds.z*(1-u.envelope.x*abs(p.z)/(u.bounds.y/2))){return vec4f(0);}
  let size=vec2f(textureDimensions(field));let rows=size.y/f32(${VOLUME_LAYERS});
  let cell=clamp(vec2f(p.x/u.bounds.x+.5,.5-p.z/u.bounds.y),vec2f(.5)/vec2f(size.x,rows),vec2f(1)-vec2f(.5)/vec2f(size.x,rows));
  let y=clamp(p.y/u.bounds.z*f32(${VOLUME_LAYERS})-.5,0.0,f32(${VOLUME_LAYERS}-1));
  let lower=floor(y);let upper=min(lower+1,f32(${VOLUME_LAYERS}-1));
  let a=textureSampleLevel(field,fieldSampler,vec2f(cell.x,(lower+cell.y)/f32(${VOLUME_LAYERS})),0);
  let b=textureSampleLevel(field,fieldSampler,vec2f(cell.x,(upper+cell.y)/f32(${VOLUME_LAYERS})),0);
  let s=mix(a,b,fract(y));let v=s.rgb/max(s.a,.00001);
  if(u.bounds.w>1.5 && u.bounds.w<2.5){return vec4f((v.r*256+v.g)/257,v.b,0,s.a);}
  return vec4f(v,s.a);
}
fn fieldColor(s: vec4f) -> vec3f {
  let rgb=colorAt(s.r);return mix(rgb,vec3f(dot(rgb,vec3f(.25,.55,.2))),(.12+.16*s.b)*(1-s.g));
}

// Equal-value surfaces are sampled from the same XYZ field as the glass view.
// They have spatial shading and fine height lines, not animated flow particles.
fn topographyColor(value: f32) -> vec3f {
  let low=u.contours[0][0];var high=low;
  for(var j=0u;j<8u;j++){let level=u.contours[j/4u][j%4u];if(level>0){high=level;}}
  if(low<0){return vec3f(.55,.63,.57);}
  let t=clamp((value-low)/max(.00001,high-low),0.0,1.0);
  let cool=vec3f(.09,.47,.68);let neutral=vec3f(.84,.87,.82);let warm=vec3f(.93,.31,.16);
  if(t<.5){return mix(cool,neutral,t*2);}
  return mix(neutral,warm,(t-.5)*2);
}
fn surfaceColor(p: vec3f, s: vec4f, direction: vec3f) -> vec4f {
  let e=max(.025,min(u.bounds.x,min(u.bounds.y,u.bounds.z))*.012);
  let gradient=vec3f(sampleField(p+vec3f(e,0,0)).r-sampleField(p-vec3f(e,0,0)).r,sampleField(p+vec3f(0,e,0)).r-sampleField(p-vec3f(0,e,0)).r,sampleField(p+vec3f(0,0,e)).r-sampleField(p-vec3f(0,0,e)).r);
  let normal=normalize(gradient+vec3f(.000001));
  let facing=abs(dot(normal,direction));let rim=pow(1-facing,2.0);
  let light=.65+.35*abs(dot(normal,normalize(vec3f(-.4,.8,.6))));
  let line=1-smoothstep(.0,.045,abs(fract(p.y/.5)-.5));
  let color=mix(topographyColor(s.r)*light,vec3f(1),line*.48+rim*.15);
  return vec4f(color,(.40+.25*rim)*s.a);
}
fn topography(origin: vec3f, direction: vec3f, start: f32, end: f32, base: vec3f) -> vec3f {
  let ds=(end-start)/96;var rgb=vec3f(0);var opacity=0.0;
  var previous=sampleField(origin+direction*(start+.0001));
  let low=u.contours[0][0];var high=low;
  for(var j=0u;j<8u;j++){let level=u.contours[j/4u][j%4u];if(level>0){high=level;}}
  if(low>0 && previous.a>.5 && (previous.r<low || previous.r>high)){opacity=.30;rgb=topographyColor(previous.r)*opacity;}
  for(var iteration=0u;iteration<96u;iteration++){
    let t=start+(f32(iteration)+.5)*ds;let p=origin+direction*t;let s=sampleField(p);
    if(s.a>.5 && previous.a>.5){
      for(var j=0u;j<8u;j++){
        let level=u.contours[j/4u][j%4u];
        if(level>0 && ((s.r>=level)!=(previous.r>=level))){
          let f=clamp((level-previous.r)/(s.r-previous.r),0.0,1.0);
          let hit=p-direction*ds*(1-f);let surface=surfaceColor(hit,vec4f(level,s.gba),direction);
          rgb+=(1-opacity)*surface.a*surface.rgb;opacity+=(1-opacity)*surface.a;
        }
      }
    }
    let extreme=low>0 && (s.r<low || s.r>high);
    if(s.a>.5 && previous.a<.5 && extreme){let cap=.30;rgb+=(1-opacity)*cap*topographyColor(s.r);opacity+=(1-opacity)*cap;}
    if(low>0 && previous.a>.5 && s.a<.5 && (previous.r<low || previous.r>high)){let cap=.22;rgb+=(1-opacity)*cap*topographyColor(previous.r);opacity+=(1-opacity)*cap;}
    // Closed cooler/warmer regions retain their volume; intermediate space is clear.
    let density=select(.018,.30,extreme);
    let a=(1-exp(-ds*density/u.bounds.z))*s.a;
    rgb+=(1-opacity)*a*topographyColor(s.r);opacity+=(1-opacity)*a;previous=s;
  }
  return mix(base,rgb/max(opacity,.00001),min(opacity,.80));
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
  if(u.bounds.w>1.5 && u.bounds.w<2.5){return vec4f(topography(origin,direction,start,end,base),1);}
  if(u.bounds.w>2.5){
    let ds=(end-start)/96;var rgb=vec3f(0);var opacity=0.0;
    for(var i=0u;i<96u;i++){
      let s=sampleField(origin+direction*(start+(f32(i)+.5)*ds));
      let support=.10+.90*s.g;
      let band=1-smoothstep(.0,.07,min(fract(s.r*7),1-fract(s.r*7)));
      let a=(1-exp(-ds*(1.55+.40*band)*support/u.bounds.z))*s.a;
      let color=mix(colorAt(s.r),vec3f(.94,.96,.92),(1-s.g)*.15);
      rgb+=(1-opacity)*a*color;opacity+=(1-opacity)*a;
    }
    let limit=select(.68,.43,opaque<min(far.x,min(far.y,far.z))-.02);
    return vec4f(mix(base,rgb/max(opacity,.00001),min(opacity,limit)),1);
  }
  let ds=(end-start)/96;var rgb=vec3f(0);var opacity=0.0;
  for(var iteration=0u;iteration<96u;iteration++){
    let p=origin+direction*(start+(f32(iteration)+.5)*ds);let s=sampleField(p);
    let edge=min(min(u.bounds.x/2-abs(p.x),u.bounds.y/2-abs(p.z)),u.bounds.z*(1-u.envelope.x*abs(p.z)/(u.bounds.y/2))-p.y);
    let a=((1-exp(-ds*.85/u.bounds.z))+.035*(1-smoothstep(.0,ds*1.4,edge)))*(.25+.75*s.g)*s.a;
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
uniform float roofSlope;
uniform float contours[8];
uniform vec4 palette[33];
uniform sampler2D sceneColor;
uniform sampler2D sceneDepth;
uniform sampler2D field;
out vec4 outputColor;
vec3 world(vec2 ndc,float depth){vec4 p=inverseCamera*vec4(ndc,depth,1.);return p.xyz/p.w;}
vec3 colorAt(float t){
  float x=clamp(t,0.,.99999)*32.;int i=int(floor(x));return mix(palette[i].rgb,palette[i+1].rgb,fract(x));
}
vec4 sampleField(vec3 p){
  if(abs(p.x)>bounds.x/2. || abs(p.z)>bounds.y/2. || p.y<0. || p.y>bounds.z*(1.-roofSlope*abs(p.z)/(bounds.y/2.)))return vec4(0.);
  vec2 size=vec2(textureSize(field,0));float rows=size.y/float(${VOLUME_LAYERS});
  vec2 cell=clamp(vec2(p.x/bounds.x+.5,.5-p.z/bounds.y),vec2(.5)/vec2(size.x,rows),vec2(1.)-vec2(.5)/vec2(size.x,rows));
  float y=clamp(p.y/bounds.z*float(${VOLUME_LAYERS})-.5,0.,float(${VOLUME_LAYERS}-1));
  float lower=floor(y),upper=min(lower+1.,float(${VOLUME_LAYERS}-1));
  vec4 a=texture(field,vec2(cell.x,(lower+cell.y)/float(${VOLUME_LAYERS}))),b=texture(field,vec2(cell.x,(upper+cell.y)/float(${VOLUME_LAYERS})));
  vec4 s=mix(a,b,fract(y));vec3 v=s.rgb/max(s.a,.00001);
  if(bounds.w>1.5 && bounds.w<2.5)return vec4((v.r*256.+v.g)/257.,v.b,0.,s.a);
  return vec4(v,s.a);
}
vec3 fieldColor(vec4 s){vec3 rgb=colorAt(s.r);return mix(rgb,vec3(dot(rgb,vec3(.25,.55,.2))),(.12+.16*s.b)*(1.-s.g));}

vec3 topographyColor(float value){
  float low=contours[0],high=low;for(int j=0;j<8;j++)if(contours[j]>0.)high=contours[j];
  if(low<0.)return vec3(.55,.63,.57);
  float t=clamp((value-low)/max(.00001,high-low),0.,1.);
  vec3 cool=vec3(.09,.47,.68),neutral=vec3(.84,.87,.82),warm=vec3(.93,.31,.16);
  return t<.5 ? mix(cool,neutral,t*2.) : mix(neutral,warm,(t-.5)*2.);
}
vec4 surfaceColor(vec3 p,vec4 s,vec3 direction){
  float e=max(.025,min(bounds.x,min(bounds.y,bounds.z))*.012);
  vec3 gradient=vec3(sampleField(p+vec3(e,0,0)).r-sampleField(p-vec3(e,0,0)).r,sampleField(p+vec3(0,e,0)).r-sampleField(p-vec3(0,e,0)).r,sampleField(p+vec3(0,0,e)).r-sampleField(p-vec3(0,0,e)).r);
  vec3 normal=normalize(gradient+vec3(.000001));float facing=abs(dot(normal,direction)),rim=pow(1.-facing,2.);
  float light=.65+.35*abs(dot(normal,normalize(vec3(-.4,.8,.6))));
  float line=1.-smoothstep(0.,.045,abs(fract(p.y/.5)-.5));
  return vec4(mix(topographyColor(s.r)*light,vec3(1.),line*.48+rim*.15),(.40+.25*rim)*s.a);
}
vec3 topography(vec3 origin,vec3 direction,float start,float end,vec3 base){
  float ds=(end-start)/96.,opacity=0.;vec3 rgb=vec3(0.);vec4 previous=sampleField(origin+direction*(start+.0001));
  float low=contours[0],high=low;
  for(int j=0;j<8;j++)if(contours[j]>0.)high=contours[j];
  if(low>0. && previous.a>.5 && (previous.r<low || previous.r>high)){opacity=.30;rgb=topographyColor(previous.r)*opacity;}
  for(int iteration=0;iteration<96;iteration++){
    float t=start+(float(iteration)+.5)*ds;vec3 p=origin+direction*t;vec4 s=sampleField(p);
    if(s.a>.5 && previous.a>.5){
      for(int j=0;j<8;j++){
        float level=contours[j];
        if(level>0. && ((s.r>=level)!=(previous.r>=level))){
          float f=clamp((level-previous.r)/(s.r-previous.r),0.,1.);
          vec3 hit=p-direction*ds*(1.-f);vec4 surface=surfaceColor(hit,vec4(level,s.gba),direction);
          rgb+=(1.-opacity)*surface.a*surface.rgb;opacity+=(1.-opacity)*surface.a;
        }
      }
    }
    bool extreme=low>0. && (s.r<low || s.r>high);
    if(s.a>.5 && previous.a<.5 && extreme){float cap=.30;rgb+=(1.-opacity)*cap*topographyColor(s.r);opacity+=(1.-opacity)*cap;}
    if(low>0. && previous.a>.5 && s.a<.5 && (previous.r<low || previous.r>high)){float cap=.22;rgb+=(1.-opacity)*cap*topographyColor(previous.r);opacity+=(1.-opacity)*cap;}
    float density=extreme ? .30 : .018;
    float a=(1.-exp(-ds*density/bounds.z))*s.a;
    rgb+=(1.-opacity)*a*topographyColor(s.r);opacity+=(1.-opacity)*a;previous=s;
  }
  return mix(base,rgb/max(opacity,.00001),min(opacity,.80));
}

void main(){
  ivec2 size=textureSize(sceneColor,0),xy=ivec2(gl_FragCoord.xy);vec3 base=texelFetch(sceneColor,xy,0).rgb;
  if(bounds.w<.5){outputColor=vec4(base,1.);return;}
  vec2 ndc=gl_FragCoord.xy/vec2(size)*2.-1.;vec3 origin=world(ndc,0.),direction=normalize(world(ndc,1.)-origin);
  float opaque=distance(world(ndc,texelFetch(sceneDepth,xy,0).r),origin);
  vec3 inv=1./(direction+vec3(.000001));vec3 t0=(vec3(-bounds.x/2.,0.,-bounds.y/2.)-origin)*inv,t1=(vec3(bounds.x/2.,bounds.z,bounds.y/2.)-origin)*inv;
  vec3 near=min(t0,t1),far=max(t0,t1);float start=max(0.,max(near.x,max(near.y,near.z))),end=min(opaque,min(far.x,min(far.y,far.z)));
  if(end<=start){outputColor=vec4(base,1.);return;}
  if(bounds.w>1.5 && bounds.w<2.5){outputColor=vec4(topography(origin,direction,start,end,base),1.);return;}
  if(bounds.w>2.5){
    float ds=(end-start)/96.,opacity=0.;vec3 rgb=vec3(0.);
    for(int i=0;i<96;i++){
      vec4 s=sampleField(origin+direction*(start+(float(i)+.5)*ds));
      float support=.10+.90*s.g;
      float band=1.-smoothstep(0.,.07,min(fract(s.r*7.),1.-fract(s.r*7.)));
      float a=(1.-exp(-ds*(1.55+.40*band)*support/bounds.z))*s.a;
      vec3 color=mix(colorAt(s.r),vec3(.94,.96,.92),(1.-s.g)*.15);
      rgb+=(1.-opacity)*a*color;opacity+=(1.-opacity)*a;
    }
    float limit=opaque<min(far.x,min(far.y,far.z))-.02 ? .43 : .68;
    outputColor=vec4(mix(base,rgb/max(opacity,.00001),min(opacity,limit)),1.);return;
  }
  float ds=(end-start)/96.,opacity=0.;vec3 rgb=vec3(0.);
  for(int iteration=0;iteration<96;iteration++){
    vec3 p=origin+direction*(start+(float(iteration)+.5)*ds);vec4 s=sampleField(p);
    float edge=min(min(bounds.x/2.-abs(p.x),bounds.y/2.-abs(p.z)),bounds.z*(1.-roofSlope*abs(p.z)/(bounds.y/2.))-p.y);
    float a=((1.-exp(-ds*.85/bounds.z))+.035*(1.-smoothstep(0.,ds*1.4,edge)))*(.25+.75*s.g)*s.a;
    rgb+=(1.-opacity)*a*fieldColor(s);opacity+=(1.-opacity)*a;
  }
  outputColor=vec4(mix(base,rgb/max(opacity,.00001),min(opacity,.72)),1.);
}`
