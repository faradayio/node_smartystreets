// Hackish local type decls for through2-concurrent, based on
// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/through2/index.d.ts

declare module "through2-concurrent" {
  import { Transform } from "stream"

  type TransformCallback = (err?: any, data?: any) => void;
  type TransformFunction = (this: Transform, chunk: any, enc: string, callback: TransformCallback) => void;
  type FlushCallback = (this: Transform, flushCallback: () => void) => void;

  type Options = {
    maxConcurrency?: number
  }

  namespace through2Concurent {
    function obj(transform?: TransformFunction, flush?: FlushCallback): Transform;
    function obj(options: Options, transform?: TransformFunction, flush?: FlushCallback): Transform;
  }

  export = through2Concurent
}
