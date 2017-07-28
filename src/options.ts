/** (Internal.) Options which must be supplied. */
export type RequiredOptions = {
  /**
   * SmartyStreets auth ID. You can get this
   * {@link here|https://smartystreets.com/account/keys} listed under "Security
   * Keys".
   */
  authId: string
  /**
   * SmartyStreets auth token. You can get this
   * {@link here|https://smartystreets.com/account/keys} listed under "Security
   * Keys".
   */
  authToken: string
  /**
   * A JSON object describing what column structure to request.
   *
   * For examples, see
   * {@link https://github.com/faradayio/node_smartystreets/blob/master/structure/|the JSON files which ship with SmartyStreets}.
   */
  structure: { [key: string]: any }
}

/** (Internal.) Default values for geocoding options. */
export const DEFAULTS: DefaultableOptions = {
  streetCol: "street",
  zipcodeCol: "zipcode",
  cityCol: "city",
  stateCol: "state",
  concurrency: 48,
  columnPrefix: 'ss_',
  columnSuffix: '',
  quiet: false,
  logInterval: 1000,
  dropThreshold: undefined,
  retryTimeout: 500,
  includeInvalid: false,
  outputStreamFormat: "array"
}

/** (Internal.) Options which can be omitted. */
export type DefaultableOptions = {
  /**
   * The CSV column which contains street data (e.g. "123 main st"). The default
   * is `"street"`. You may also pass an array containing multiple column names;
   * the values of those columns will be combined using spaces.
   */
  streetCol: string | string[]
  /**
   * The CSV column which contains the zip code. The default is `"zipcode"`.
   *
   * Note: If your file includes street and zipcode, you don't need to include
   * city and state data, as it will not be used. If your file does not include
   * zipcode, you must include city and state columns.
   */
  zipcodeCol: string
  /**
   * The name of the column in your input file that contains the city or town,
   * e.g. 'Albany'. Default is 'city'.
   *
   * Note: City is only used if zipcode is not present.
   */
  cityCol: string
  /**
   * The name of the column in your input file that contains the state, e.g.
   * 'Vermont'. Default is 'state'.
   */
  stateCol: string
  /**
   * Tune this if you fancy yourself an engineer and want to get a slight
   * increase in performance. Default is 48. It should be higher if you have an
   * unmetered 10 gigabit connection, and lower if you're on an EDGE wireless
   * signal. If you want to run fifty instances of this program at the same
   * time, you may experience dropped connections which can be dealt with by
   * turning this down.
   */
  concurrency: number
  /**
   * The prefix applied to all columns that are added to your output file.
   * Default is `ss_`. `delivery_line_1` becomes `ss_delivery_line_1`.
   */
  columnPrefix: string
  /**
   * This is the suffix applied to all columns that are added to your output
   * file. Default is the empty string.
   */
  columnSuffix: string
  /**
   * Reduce output. Default is false.
   */
  quiet: boolean
  /**
   * By default, we log a message every X number of rows to let you know how
   * it's doing. The default is 1000.
   */
  logInterval: number | null | undefined
  /**
   * If a batch of rows cannot be geocoded after 5 retries, they will be
   * dropped. You can use this option to limit that. If you set it 0, any
   * dropped rows will cause the process to exit with a code of 1. If you set it
   * to 1,000, geocoding failures will be tolerated up to 1,000 rows.
   */
  dropThreshold: number | null | undefined
  /**
   * How long wait, in milliseconds, before retrying a failed chunk. Default is
   * 500.
   */
  retryTimeout: number
  /**
   * Not required. Allows approximate geocoding of addresses that SmartyStreets
   * considers invalid. Be cautious - this may introduce potentially-large
   * precision degredation.
   */
  includeInvalid: boolean
  /**
   * Should we stream the output data as objects or as arrays?  Default is
   * `"array"`, but only for backwards compatibility. Sample array output:
   *
   *     ["col1", "col2"]
   *     ["val1", "val2"]
   *     ["val3", "val4"]
   *
   * Sample object output:
   *
   *     {"col1": "val1", "col2": "val2"}
   *     {"col1": "val3", "col2": "val4"}
   */
  outputStreamFormat: OutputStreamFormat
}

/** Geocoding options for smartystreets. */
export type Options = RequiredOptions & Partial<DefaultableOptions>

/** (Internal.) All options, with no unnecessary defaults. */
export type FullOptions = RequiredOptions & DefaultableOptions

/**
 * Allowed `outputStreamFormat` values. We declare this as a named type so that
 * our callers can use it in their own APIs if desired.
 */
export type OutputStreamFormat = "object" | "array"
