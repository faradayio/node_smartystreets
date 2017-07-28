import { assert } from 'chai'
import 'mocha';
import sinon = require('sinon');

import csv = require('fast-csv');
import fs = require('fs');
import path = require('path');
import { promisify } from 'util'

const readFileP = promisify(fs.readFile)

// Use the public API, to make sure all our exports are set up correctly.
import smartystreets = require('../index');

describe("geocode", () => {
  let SMARTYSTREETS_AUTH_ID: string
  let SMARTYSTREETS_AUTH_TOKEN: string

  beforeEach(function () {
    const id = process.env.SMARTYSTREETS_AUTH_ID
    const token = process.env.SMARTYSTREETS_AUTH_TOKEN
    if (!id || !token) {
      console.warn("Skipping test because we don't have SMARTYSTREETS_AUTH_ID and SMARTYSTREETS_AUTH_TOKEN")
      this.skip()
      return
    } else {
      SMARTYSTREETS_AUTH_ID = id
      SMARTYSTREETS_AUTH_TOKEN = token
    }
  })

  it("adds geocoding columns to a parsed, grouped CSV stream", async () => {
    const structurePath = path.join(__dirname, '..', 'structure', 'standard.json')
    const fixturePath = path.join(__dirname, 'fixtures', 'landmarks.csv')
    const structure = JSON.parse((await readFileP(structurePath)).toString())
    const options: smartystreets.Options = {
      authId: SMARTYSTREETS_AUTH_ID,
      authToken: SMARTYSTREETS_AUTH_TOKEN,
      structure: structure,
      outputStreamFormat: "object",
    }
    const geocoded: { [key: string]: string }[] = []
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(fixturePath)
        .pipe(csv({ headers: true }))
        .pipe(smartystreets.grouper(70))
        .pipe(smartystreets(options))
        .on('data', (data: { [key: string]: string }) => { geocoded.push(data) })
        .on('end', () => { resolve() })
        .on('error', () => { reject() })
    })
  })
})
