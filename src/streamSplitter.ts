import stream = require('stream')
import terminus = require('terminus');

export default function(
  identifier: (chunk: string, enc: string) => string | false,
  constructor: (streamName: string) => NodeJS.WritableStream,
  options: stream.WritableOptions
) {
  options = options || {};
  const streams: { [name: string]: NodeJS.WritableStream } = {};

  const splitter = terminus(options, function(chunk, enc, cb){
    const streamName = identifier(chunk, enc);

    if (streamName === false) {
      cb();
      return;
    }

    if (typeof streams[streamName] === 'undefined') {
      streams[streamName] = constructor(streamName);
    }

    const success = streams[streamName].write(chunk);

    if (success === false) {
      streams[streamName].once('drain', cb.bind(null, null));
    } else {
      cb();
    }
  });

  splitter.on('finish', function flush () {
    for (var name in streams) {
      streams[name].end();
      delete streams[name];
    }
  });

  return splitter;
};
