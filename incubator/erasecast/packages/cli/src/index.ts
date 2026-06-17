/**
 * erasecast CLI — batch object removal for build pipelines.
 *
 *   erasecast remove photo.jpg --mask m.png -o photo.clean.png
 *   erasecast remove ./shots/*.jpg --auto "price tag" -o ./clean/
 *
 * Node decode/encode + ORT wiring is the first task (PLAN.md §5). Arg parsing
 * and the high-res composite (shared `inpaintImage`) are real.
 */
import { parseArgs } from 'node:util'

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      mask: { type: 'string' },
      auto: { type: 'string' }, // text prompt → auto mask (roadmap)
      strategy: { type: 'string', default: 'tiled' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  const [cmd, ...inputs] = positionals
  if (values.help || cmd !== 'remove' || inputs.length === 0) {
    console.log(
      [
        'erasecast — batch object removal',
        '',
        'Usage:',
        '  erasecast remove <image...> (--mask m.png | --auto "<prompt>") -o <out>',
        '    --strategy tiled|single|progressive   (default: tiled)',
        '',
        'Privacy note: runs locally; nothing is uploaded.',
      ].join('\n'),
    )
    process.exit(values.help ? 0 : 1)
  }

  if (!values.mask && !values.auto) {
    console.error('erasecast: provide --mask <png> or --auto "<prompt>"')
    process.exit(1)
  }

  // TODO(impl): for each input, decode RGBA + mask, run inpaintImage with a Node
  // ORT-backed inpaintTile, encode to `out`. See PLAN.md §5.
  for (const input of inputs) {
    const out =
      values.out ??
      input.replace(/\.[^.]+$/, '') +
        '.clean$&'.replace('$&', input.match(/\.[^.]+$/)?.[0] ?? '.png')
    console.log(
      `erasecast: would remove from "${input}" → "${out}" (Node wiring pending — PLAN.md §5)`,
    )
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
