var terminus = require('terminus');

module.exports = function(identifier, constructor, options){
  options = options || {};
  var streams = {};
  var cloggedStreams = 0;

  return terminus(options, function(chunk, enc, cb){
    var self = this;
    var streamName = identifier(chunk, enc);

    if (streamName === false) {
      cb();
      return true;
    }

    if (typeof streams[streamName] == 'undefined') {
      streams[streamName] = constructor(streamName);
      streams[streamName].__clogged = false;
      streams[streamName].on('drain', function(){
        this.__clogged = false;
        cloggedStreams--;
        if (!cloggedStreams) {
          self.emit('drain');
        }
      });
    }

    var success = streams[streamName].write(chunk);
    if (!success && !streams[streamName].__clogged) {
      streams[streamName].__clogged = true;
      cloggedStreams++;
    }

    cb();
    return !cloggedStreams;
  });
};