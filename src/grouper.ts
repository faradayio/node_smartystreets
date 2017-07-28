import stream = require('stream')
import through2 = require('through2');

export default function(groupSize: number): stream.Transform {
  let group: any[] = [];

  return through2.obj(
    function(row, enc, cb){
      group.push(row);
      if (group.length === groupSize) {
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
