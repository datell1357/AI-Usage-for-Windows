const { cpSync, readdirSync, rmSync } = require("fs")
const { join } = require("path")

const root = __dirname
const include = ["claude", "codex", "cursor", "gemini"]
const srcDir = join(root, "plugins")
const dstDir = join(root, "src-tauri", "resources", "bundled_plugins")

rmSync(dstDir, { recursive: true, force: true })

const existingPlugins = new Set(
  readdirSync(srcDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
)

const plugins = include.filter((id) => existingPlugins.has(id))

const missing = include.filter((id) => !existingPlugins.has(id))
if (missing.length > 0) {
  throw new Error(`Missing bundled plugins: ${missing.join(", ")}`)
}

for (const id of plugins) {
  cpSync(join(srcDir, id), join(dstDir, id), { recursive: true })
}

console.log(`Bundled ${plugins.length} plugins: ${plugins.join(", ")}`)
