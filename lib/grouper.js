var through2 = require('through2');

module.exports = function(groupSize){
  var group = [];

  return through2.obj(
    function(row, enc, cb){
      group.push(row);
      if (group.length == groupSize) {
        this.push(group);
        group = [];
      }
      cb();
    }, function(cb){
      if (group.length) {
        this.push(group);
        group = [];
      }
      cb();
    }
  );
};