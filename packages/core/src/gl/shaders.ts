/** GLSL ES 3.00 shaders for the displacement renderer. */

export const VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 aPos;   // grid position, x in [-aspect, aspect], y in [-1, 1]
in vec2 aUV;    // texture coordinate, 0..1

uniform mat4 uProjView;
uniform sampler2D uDepth;
uniform float uIntensity;   // displacement strength
uniform float uDisplace;    // 1 = foreground mesh, 0 = flat background layer

out vec2 vUV;
out float vDepth;

void main() {
  float d = texture(uDepth, aUV).r;   // 0 (far) .. 1 (near)
  vUV = aUV;
  vDepth = d;
  // Centre depth around 0 so the focal plane stays put while near/far pop.
  float z = (d - 0.5) * uIntensity * uDisplace;
  gl_Position = uProjView * vec4(aPos, z, 1.0);
}
`

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUV;
in float vDepth;

uniform sampler2D uTex;
uniform sampler2D uDepth;
uniform vec2 uTexel;     // 1.0 / depthSize, for gradient sampling
uniform float uFeather;  // 0 = off; >0 = fade across steep depth edges

out vec4 fragColor;

void main() {
  vec4 color = texture(uTex, vUV);

  if (uFeather > 0.0) {
    // Sobel-ish depth gradient: steep edges are where the mesh stretches.
    float dl = texture(uDepth, vUV - vec2(uTexel.x, 0.0)).r;
    float dr = texture(uDepth, vUV + vec2(uTexel.x, 0.0)).r;
    float du = texture(uDepth, vUV - vec2(0.0, uTexel.y)).r;
    float dd = texture(uDepth, vUV + vec2(0.0, uTexel.y)).r;
    float grad = length(vec2(dr - dl, dd - du));
    float fade = 1.0 - smoothstep(0.06, 0.18, grad * uFeather);
    color.a *= fade;
  }

  if (color.a <= 0.001) discard;
  fragColor = color;
}
`
