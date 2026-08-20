#!/usr/bin/env node
'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const catalog = require('../shared/identifierCatalog.json')
const identifiers = require('../api/_lib/identifiers')

const codePattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/
const seenTopLevelCodes = new Set()

function uniqueCode(code, scope) {
  assert(codePattern.test(code), `Invalid immutable code ${scope}:${code}`)
  const key = `${scope}:${code}`
  assert(!seenTopLevelCodes.has(key), `Duplicate immutable code ${key}`)
  seenTopLevelCodes.add(key)
}

for (const workflow of catalog.workflows || []) {
  uniqueCode(workflow.code, 'workflow')
  const stateCodes = new Set()
  const aliases = new Map()
  for (const state of workflow.states || []) {
    assert(codePattern.test(state.code), `Invalid state code ${workflow.code}:${state.code}`)
    assert(!stateCodes.has(state.code), `Duplicate state code ${workflow.code}:${state.code}`)
    stateCodes.add(state.code)
    for (const alias of state.legacyValues || []) {
      const normalized = alias.trim().toLocaleLowerCase('en-US')
      const owner = aliases.get(normalized)
      assert(!owner || owner === state.code, `Ambiguous alias ${workflow.code}:${alias}`)
      aliases.set(normalized, state.code)
    }
  }
  assert([...stateCodes].length > 0, `Workflow ${workflow.code} has no states`)
  assert((workflow.states || []).filter(state => state.isInitial).length <= 1, `Workflow ${workflow.code} has multiple initial states`)
}

for (const choiceSet of catalog.choiceSets || []) {
  uniqueCode(choiceSet.code, 'choice')
  const optionCodes = new Set()
  for (const option of choiceSet.options || []) {
    assert(codePattern.test(option.code), `Invalid choice code ${choiceSet.code}:${option.code}`)
    assert(!optionCodes.has(option.code), `Duplicate choice code ${choiceSet.code}:${option.code}`)
    optionCodes.add(option.code)
  }
}

for (const role of catalog.roles || []) uniqueCode(role.code, 'role')
for (const board of catalog.boards || []) uniqueCode(board.code, 'board')

assert.strictEqual(identifiers.resolveWorkflowStateCode('deal.lifecycle', 'Offer Accapted'), 'offer_accepted')
assert.strictEqual(identifiers.resolveWorkflowStateCode('task.lifecycle', 'completed'), 'done')

const renamed = structuredClone(catalog)
renamed.workflows.find(item => item.code === 'deal.lifecycle')
  .states.find(item => item.code === 'closed').label = 'Completed Sale'
const renamedIndex = identifiers.buildIndex(renamed)
assert.strictEqual(identifiers.resolveWorkflowStateCode('deal.lifecycle', 'Closed', renamedIndex), 'closed')
assert.strictEqual(identifiers.workflowStateHasFlag('deal.lifecycle', 'Closed', 'countsAsWon', renamedIndex), true)

const generatedSeed = fs.readFileSync(
  path.resolve(__dirname, '..', 'sql', 'stable-identifiers', '002_catalog_seed.generated.sql'),
  'utf8'
)
assert(generatedSeed.includes(`Catalog version: ${catalog.catalogVersion}`), 'Generated SQL catalog version is stale')
for (const workflow of catalog.workflows || []) assert(generatedSeed.includes(`'${workflow.code}'`), `Generated SQL missing ${workflow.code}`)
for (const choiceSet of catalog.choiceSets || []) assert(generatedSeed.includes(`'${choiceSet.code}'`), `Generated SQL missing ${choiceSet.code}`)

process.stdout.write('Identifier catalog validation passed\n')

