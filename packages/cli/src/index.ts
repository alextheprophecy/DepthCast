import { RawImage } from '@huggingface/transformers'
import { estimateDepth, DEFAULT_MODEL } from 'depthcast'
import { fitWithin } from 'depthcast'
import type { Quality } from 'depthcast'

interface Args {
  input?: string
  output?: string
  model: string
  quality: Quality
  max: number
  invert: boolean
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    model: DEFAULT_MODEL,
    quality: 'high',
    max: 1024,
    invert: false,
    help: false,
  }
  const rest = argv[0] === 'precompute' ? argv.slice(1) : argv
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    switch (a) {
      case '-o':
      case '--out':
        args.output = rest[++i]
        break
      case '--model':
        args.model = rest[++i] ?? args.model
        break
      case '--quality':
        args.quality = (rest[++i] as Quality) ?? args.quality
        break
      case '--max':
        args.max = Number(rest[++i]) || args.max
        break
      case '--invert':
        args.invert = true
        break
      case '-h':
      case '--help':
        args.help = true
        break
      default:
        if (a && !a.startsWith('-')) args.input = a
    }
  }
  return args
}

const HELP = `
depthcast — bake a depth map offline (ship a tiny runtime, not a 50MB model)

Usage:
  depthcast precompute <image> [options]

Options:
  -o, --out <file>     Output PNG path (default: <image>.depth.png)
      --model <id>     HF depth model id (default: ${DEFAULT_MODEL})
      --quality <q>    low | medium | high   (default: high)
      --max <px>       Downscale longest edge before inference (default: 1024)
      --invert         Write near = dark instead of near = bright
  -h, --help           Show this help

Then in the browser, skip inference entirely:

  createDepthcast(img, { depthMap: '/cat.depth.png' })
`

function defaultOutput(input: string): string {
  return input.replace(/\.[^.]+$/, '') + '.depth.png'
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.input) {
    process.stdout.write(HELP + '\n')
    process.exit(args.input ? 0 : 1)
  }

  const input = args.input
  const output = args.output ?? defaultOutput(input)

  process.stderr.write(`· loading ${input}\n`)
  let image = await RawImage.read(input)

  const { width, height } = fitWithin(image.width, image.height, args.max)
  if (width !== image.width || height !== image.height) {
    image = await image.resize(width, height)
  }

  process.stderr.write(`· running ${args.model} (${args.quality}) at ${width}x${height}\n`)
  const raw = await estimateDepth(image, {
    model: args.model,
    device: 'wasm', // → onnxruntime-node CPU
    quality: args.quality,
    nearIsBright: !args.invert,
  })

  const out = new RawImage(raw.gray, raw.width, raw.height, 1)
  await out.save(output)
  process.stderr.write(`✓ wrote ${output} (${raw.width}x${raw.height})\n`)
}

main().catch((err) => {
  process.stderr.write(`✗ ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
