var terminus = require('terminus');

module.exports = function(identifier, constructor, options){
  options = options || {};
  var streams = {};

  var splitter = terminus(options, function(chunk, enc, cb){
    var streamName = identifier(chunk, enc);

    if (streamName === false) {
      cb();
      return;
    }

    if (typeof streams[streamName] === 'undefined') {
      streams[streamName] = constructor(streamName);
    }

    var success = streams[streamName].write(chunk);

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
