// Top-level module API for smartystreets. This involves some semi-advanced
// TypeScript tricks, because we need to export an old-school NodeJS CommonJS
// API from a TypeScript ES6 module, and we need to maintain backwards
// compatibility with the existing `smartystreets` API. The major tricks we use
// are:
//
// 1. `export =` allows us to export a single top-level value from our module,
//    instead of the more modern ""`default` + other stuff" exports.
// 2. We alias `function smartystreets` and `namespace smartystreets`, which
//    gives us our old-style "function plus properties" API. (This sort of API
//    is normally only used with ES6 or TypeScript for backwards compatibility.)
// 3. We wrap our exported functions in local functions, and place the
//    documentation on the wrapper functions, because that's the only way to
//    re-export them successfully and document them for callers of this module.

import stream = require('stream')

import { default as geocoder } from './src/geocoder'
import { default as grouperInternal } from './src/grouper'
import * as options from './src/options'

/**
 * Create a {@link NodeJS.ReadWriteStream} which consumes CSV records and
 * outputs them with geocoding information from smartystreets.
 *
 * Input records should be arrays of objects, with keys corresponding to column
 * names. This can be done by using `smartystreets.grouper(70)` stream
 * transformer to batch 70 records together into an array.
 *
 *     [{ street: "a", zipcode: "b" }, { street: "c", zipcode: "d"}, ...]
 *     [{ street: "e", zipcode: "f" }, ...]
 *
 * Output record format is controlled by {@link Options.outputStreamFormat}. By
 * default, the output will be in array format, but if `outputStreamFormat:
 * "object"` is set, output will look like:
 *
 *     { street: "a", zipcode: "b", ss_field1: "...", ... }
 *     { street: "c", zipcode: "d", ss_field1: "...", ... }
 *     ...
 *
 * @param opts Configuration options.
 */
function smartystreets(options: options.Options): stream.Transform {
  // Wrap `geocoder` because there's no other way to make the overloads and
  // re-exports work.
  return geocoder(options)
}

// This aliases over `function smartystreets` and sets the specified properties
// and types on the function object.
namespace smartystreets {
  /** Geocoding options for smartystreets. */
  export type Options = options.Options

  /**
   * Create a stream which transforms input of the form:
   *
   *     {a: 1}
   *     {a: 2}
   *     {a: 3}
   *
   * ...to:
   *
   *     [{a: 1}, {a: 2}]
   *     [{a: 3}]
   *
   * ...using the specified `groupSize`.
   *
   * @param groupSize The number of records to put in each group.
   */
  export function grouper(groupSize: number): stream.Transform {
    // Wrap because there's no other way to make the overloads and re-exports
    // work.
    return grouperInternal(groupSize)
  }
}

// Magic TypeScript syntax to export an old-style Node module.
export = smartystreets
