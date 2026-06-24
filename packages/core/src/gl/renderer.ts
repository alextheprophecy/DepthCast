import { createProgram, createTexture, getUniformLocations } from './program'
import { VERTEX_SHADER, FRAGMENT_SHADER } from './shaders'
import type { EdgeHandling, Quality } from '../types'

const SEGMENTS_BY_QUALITY: Record<Quality, number> = { low: 128, medium: 192, high: 288 }

// Depth-gradient threshold above which the displaced mesh is "cut" so the
// background fill shows through instead of a rubber-sheet smear.
const CUT_THRESHOLD = 0.06

export interface RendererInit {
  image: ImageData
  depth: ImageData
  /** Background fill layer (inpainted or blurred). Null = foreground only. */
  background: ImageData | null
  quality: Quality
  intensity: number
  edgeHandling: EdgeHandling
  parallaxAmount?: number
  clearColor?: [number, number, number, number]
}

const UNIFORMS = [
  'uProjView',
  'uDepth',
  'uTex',
  'uIntensity',
  'uDisplace',
  'uTexel',
  'uCut',
] as const

export class Renderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private uniforms: Record<string, WebGLUniformLocation | null>
  private vao: WebGLVertexArrayObject
  private indexCount: number
  private quadVao: WebGLVertexArrayObject
  private texImage: WebGLTexture
  private texDepth: WebGLTexture
  private texBackground: WebGLTexture | null
  private aspect: number
  private depthW: number
  private depthH: number
  private parallaxAmount: number
  private clearColor: [number, number, number, number]

  private intensity: number
  private edgeHandling: EdgeHandling

  constructor(init: RendererInit) {
    this.aspect = init.image.width / init.image.height
    this.depthW = init.depth.width
    this.depthH = init.depth.height
    this.intensity = init.intensity
    this.edgeHandling = init.edgeHandling
    this.parallaxAmount = init.parallaxAmount ?? 0.22
    this.clearColor = init.clearColor ?? [0, 0, 0, 0]

    const canvas = document.createElement('canvas')
    canvas.width = init.image.width
    canvas.height = init.image.height
    this.canvas = canvas

    const gl = canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      antialias: true,
      alpha: true,
    })
    if (!gl) throw new Error('depthcast: WebGL2 is not available in this browser')
    this.gl = gl

    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER)
    this.uniforms = getUniformLocations(gl, this.program, UNIFORMS)

    const segments = SEGMENTS_BY_QUALITY[init.quality]
    const { vao, indexCount } = this.buildGrid(segments)
    this.vao = vao
    this.indexCount = indexCount
    this.quadVao = this.buildQuad()

    this.texImage = createTexture(gl, init.image)
    this.texDepth = createTexture(gl, init.depth)
    this.texBackground = init.background ? createTexture(gl, init.background) : null

    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.enable(gl.BLEND)
    // Straight-alpha "over" for RGB, but Porter-Duff "over" (src factor ONE) for the
    // ALPHA channel. With plain SRC_ALPHA on alpha, fractional-alpha fragments (the
    // edge-dissolve ring + the silhouette cut) pull the canvas's own alpha below 1.0;
    // on a non-premultiplied canvas over a dark page that shows through as a moving
    // black rectangle around the plane. Keeping dst alpha = 1.0 over the opaque
    // backdrop removes it while preserving true transparency for the no-backdrop case.
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    )
  }

  private buildGrid(segments: number): { vao: WebGLVertexArrayObject; indexCount: number } {
    const gl = this.gl
    const A = this.aspect
    // Tiny overscan so the very edge of the plane doesn't show a hard seam
    // against the backdrop during parallax. The static backdrop covers borders.
    const O = 1.02
    const verts: number[] = [] // x, y, u, v
    for (let j = 0; j <= segments; j++) {
      const v = j / segments
      const y = (v * 2 - 1) * O
      for (let i = 0; i <= segments; i++) {
        const u = i / segments
        const x = (u * 2 - 1) * A * O
        verts.push(x, y, u, v)
      }
    }
    const indices: number[] = []
    const row = segments + 1
    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const a = j * row + i
        const b = a + 1
        const c = a + row
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }

    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)

    const vbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW)
    const stride = 4 * 4
    const aPos = gl.getAttribLocation(this.program, 'aPos')
    const aUV = gl.getAttribLocation(this.program, 'aUV')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(aUV)
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, stride, 2 * 4)

    const ibo = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW)

    gl.bindVertexArray(null)
    return { vao, indexCount: indices.length }
  }

  /** Full-screen quad for the static (non-parallaxing) background backdrop. */
  private buildQuad(): WebGLVertexArrayObject {
    const gl = this.gl
    // x, y, u, v — covers clip space; uv maps the backdrop texture.
    const verts = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1])
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const vbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(this.program, 'aPos')
    const aUV = gl.getAttribLocation(this.program, 'aUV')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(aUV)
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8)
    gl.bindVertexArray(null)
    return vao
  }

  setIntensity(v: number): void {
    this.intensity = v
  }

  setEdgeHandling(e: EdgeHandling): void {
    this.edgeHandling = e
  }

  resize(
    cssWidth: number,
    cssHeight: number,
    dpr = Math.min(window.devicePixelRatio || 1, 2),
  ): void {
    const w = Math.max(1, Math.round(cssWidth * dpr))
    const h = Math.max(1, Math.round(cssHeight * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  /** Render a single frame given normalized parallax (-1..1) and zoom. */
  render(parallaxX: number, parallaxY: number, zoom = 1): void {
    const gl = this.gl
    const { width, height } = this.canvas
    gl.viewport(0, 0, width, height)
    gl.depthMask(true) // ensure the depth buffer is writable so it clears
    gl.clearColor(...this.clearColor)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    const canvasAspect = width / height
    const fovy = (35 * Math.PI) / 180
    const dist = 1.05 / Math.tan(fovy / 2) / zoom
    const eye: Vec3 = [parallaxX * this.parallaxAmount, parallaxY * this.parallaxAmount, dist]
    const proj = perspective(fovy, canvasAspect, 0.01, 100)
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0])
    const projView = multiply(proj, view)

    gl.useProgram(this.program)
    gl.uniform1i(this.uniforms.uTex!, 0)
    gl.uniform1i(this.uniforms.uDepth!, 1)
    // Gradient step must be in depth-map texels, not the DPR-scaled canvas.
    gl.uniform2f(this.uniforms.uTexel!, 1 / this.depthW, 1 / this.depthH)
    gl.uniform1f(this.uniforms.uIntensity!, this.intensity)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.texDepth)

    // Pass 1: STATIC screen-space backdrop (identity transform, no depth write).
    // Because it does not parallax with the camera, disoccluded gaps reveal a
    // clean background instead of a second offset copy sliding across the frame.
    if (this.texBackground && this.edgeHandling !== 'none') {
      gl.disable(gl.DEPTH_TEST)
      gl.depthMask(false)
      gl.bindVertexArray(this.quadVao)
      gl.uniformMatrix4fv(this.uniforms.uProjView!, false, IDENTITY)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texBackground)
      gl.uniform1f(this.uniforms.uDisplace!, 0)
      gl.uniform1f(this.uniforms.uCut!, 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    // Pass 2: displaced foreground, depth-tested for self-occlusion, with the
    // silhouette cut so stretched triangles drop out.
    gl.enable(gl.DEPTH_TEST)
    gl.depthMask(true)
    gl.bindVertexArray(this.vao)
    gl.uniformMatrix4fv(this.uniforms.uProjView!, false, projView)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texImage)
    gl.uniform1f(this.uniforms.uDisplace!, 1)
    gl.uniform1f(this.uniforms.uCut!, this.edgeHandling === 'none' ? 0 : CUT_THRESHOLD)
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0)

    gl.bindVertexArray(null)
  }

  dispose(): void {
    const gl = this.gl
    gl.deleteProgram(this.program)
    gl.deleteVertexArray(this.vao)
    gl.deleteVertexArray(this.quadVao)
    gl.deleteTexture(this.texImage)
    gl.deleteTexture(this.texDepth)
    if (this.texBackground) gl.deleteTexture(this.texBackground)
    const ext = gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
  }
}

// --- tiny column-major mat4 helpers (no external deps) ---

type Vec3 = [number, number, number]
type Mat4 = Float32Array

// prettier-ignore
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2)
  const nf = 1 / (near - far)
  const out = new Float32Array(16)
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) * nf
  out[11] = -1
  out[14] = 2 * far * near * nf
  return out
}

function lookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const z = normalize(sub(eye, center))
  const x = normalize(cross(up, z))
  const y = cross(z, x)
  const out = new Float32Array(16)
  out[0] = x[0]
  out[1] = y[0]
  out[2] = z[0]
  out[4] = x[1]
  out[5] = y[1]
  out[6] = z[1]
  out[8] = x[2]
  out[9] = y[2]
  out[10] = z[2]
  out[12] = -dot(x, eye)
  out[13] = -dot(y, eye)
  out[14] = -dot(z, eye)
  out[15] = 1
  return out
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] as number) * (b[col * 4 + k] as number)
      out[col * 4 + row] = sum
    }
  }
  return out
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}
