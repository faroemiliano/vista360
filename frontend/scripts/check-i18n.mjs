import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const catalog = JSON.parse(readFileSync(new URL('../src/i18n/pt-BR.json', import.meta.url), 'utf8'))
const slots = value => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort()
for (const [source, target] of Object.entries(catalog)) {
  assert.ok(target.trim(), `Traducción vacía: ${source}`)
  assert.deepEqual(slots(target), slots(source), `Parámetros distintos: ${source}`)
}
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name)
    if (entry.isDirectory()) { check(filename); continue }
    if (!/\.tsx?$/.test(filename) || filename.endsWith('.d.ts')) continue
    const file = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' && ts.isStringLiteral(node.arguments[0])) {
        assert.ok(Object.hasOwn(catalog, node.arguments[0].text), `Falta traducción en ${filename}: ${node.arguments[0].text}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
}
check(new URL('../src/', import.meta.url).pathname)
console.log(`Catálogo válido: ${Object.keys(catalog).length} traducciones; parámetros y referencias comprobados.`)
