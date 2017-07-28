import { assert } from 'chai'
import 'mocha'
import sinon = require('sinon')

import { exec } from 'child_process'
import csv = require('fast-csv')
import path = require('path')
import { promisify } from 'util'

const execP = promisify(exec);

describe('smartystreets CLI', () => {
  beforeEach(function () {
    if (!process.env.SMARTYSTREETS_AUTH_ID || !process.env.SMARTYSTREETS_AUTH_TOKEN) {
      console.warn("Skipping test because we don't have SMARTYSTREETS_AUTH_ID and SMARTYSTREETS_AUTH_TOKEN")
      this.skip()
      return
    }
  })

  it('adds geocoding columns to CSV', async () => {
    const bin = path.join(__dirname, '..', 'lib', 'program.js')
    const fixture = path.join(__dirname, 'fixtures', 'landmarks.csv')
    let out = await execP(`${bin} --input ${fixture} --output -`)
    const geocoded: { [key: string]: string }[] = []
    await new Promise<void>((resolve, reject) => {
      csv.fromString(out.stdout, { headers: true })
        .on('data', (data) => { geocoded.push(data) })
        .on('end', () => { resolve() })
        .on('error', () => { reject() })
    })
    assert.strictEqual(geocoded[0].landmark, "White House")
    assert.strictEqual(geocoded[0].ss_zipcode, "20500")
    assert.closeTo(Number(geocoded[0].ss_latitude), 38.8987, 0.1)
    assert.closeTo(Number(geocoded[0].ss_longitude), -77.0352, 0.1)
  })
})
