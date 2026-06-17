import { createEraser } from 'erasecast'

const app = document.getElementById('app')!

async function start(src: string) {
  app.innerHTML = 'loading…'
  try {
    const eraser = await createEraser(src, {
      onProgress: (stage, pct) => (app.dataset.status = `${stage}: ${Math.round(pct)}%`),
    })
    app.innerHTML = ''
    eraser.mount(app)

    eraser.canvas.addEventListener('click', async (e) => {
      const rect = eraser.canvas.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * eraser.canvas.width
      const y = ((e.clientY - rect.top) / rect.height) * eraser.canvas.height
      await eraser.selectAt(x, y)
      await eraser.erase()
    })
  } catch (err) {
    app.innerHTML = `<pre style="color:#f88">${err instanceof Error ? err.message : err}</pre>`
  }
}

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (file) start(URL.createObjectURL(file))
})

start('/sample.jpg')
