export default function(
  structure: { [key: string]: any },
  row: { [key: string]: any },
  prefix: string,
  suffix: string
): { [key: string]: any } {
  const output: { [key: string]: any } = {};
  const addField = function(header: string, value: any){
    if (prefix) {
      header = prefix+header;
    }
    if (suffix) {
      header = header+suffix;
    }
    output[header] = value || null;
  };

  for (const key in structure) {
    const value = structure[key];
    if (typeof value == 'object') {
      for (const subkey in value) {
        const subvalue = value[subkey];
        if (subvalue) {
          const header = (subvalue === true) ? subkey : subvalue;
          const rowValue = (typeof row[key] == 'object') ? row[key][subkey] : null;
          addField(header, rowValue);
        }
      }
    } else if (value) {
      const header = (value === true) ? key : value;
      addField(header, row[key]);
    }
  }
  return output;
};
