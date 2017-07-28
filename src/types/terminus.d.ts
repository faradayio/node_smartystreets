// Hacked up type declarations for `terminus`.

declare module "terminus" {
    import stream = require('stream')

    type WriteFn = (chunk: any, enc: string, cb: (err?: any) => void) => void

    function terminus(
        options: stream.WritableOptions,
        writeFn: WriteFn
    ): stream.Writable

    export = terminus
}
