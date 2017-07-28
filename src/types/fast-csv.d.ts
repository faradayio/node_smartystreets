// Partial type declarations for `fast-csv`.
//
// This can go away once upstream merges
// https://github.com/C2FO/fast-csv/pull/190
declare module "fast-csv" {
  export = csv

  function csv(options?: csv.Options): NodeJS.ReadWriteStream

  namespace csv {
    type Options = {
      headers?: boolean,
      delimiter?: string,
    }

    function fromString(data: string, options?: csv.Options): NodeJS.ReadableStream
    function createWriteStream(options?: csv.Options): NodeJS.ReadWriteStream
  }
}
