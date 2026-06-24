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
uniform vec2 uTexel;   // 1.0 / depthSize, for gradient sampling
uniform float uCut;    // depth-gradient threshold; 0 = no cut

out vec4 fragColor;

void main() {
  vec4 color = texture(uTex, vUV);

  if (uCut > 0.0) {
    // Central-difference depth gradient. A continuous mesh stretches across
    // depth discontinuities (silhouettes); those stretched triangles map to
    // UVs that straddle the edge, so the gradient there is large. Cutting them
    // lets the background fill layer show through instead of a smear.
    vec2 s = uTexel * 1.5;
    float dl = texture(uDepth, vUV - vec2(s.x, 0.0)).r;
    float dr = texture(uDepth, vUV + vec2(s.x, 0.0)).r;
    float du = texture(uDepth, vUV - vec2(0.0, s.y)).r;
    float dd = texture(uDepth, vUV + vec2(0.0, s.y)).r;
    float grad = length(vec2(dr - dl, dd - du));
    // Feather the cut over a band that stays ~constant in screen pixels: widen it
    // by the local screen-space rate-of-change of the gradient (fwidth) so the
    // silhouette anti-aliases consistently regardless of DPR or depth resolution.
    // The uCut*1.6 floor preserves the original band width away from steep edges.
    float band = max(uCut * 1.6, fwidth(grad) * 2.0);
    float edge = smoothstep(uCut, uCut + band, grad);
    color.a *= (1.0 - edge);

    // Dissolve the outermost ring of the plane into the static backdrop so the
    // image-plane rectangle never reads as a hard edge sliding across the fill.
    vec2 m = min(vUV, 1.0 - vUV);
    color.a *= smoothstep(0.0, 0.03, min(m.x, m.y));
  }

  if (color.a <= 0.02) discard;
  fragColor = color;
}
`
