import * as moment from 'moment';

let colTypes = {
  generic: {
    name: 'Generic',
    icon: 'blank',
    align: 'left',
    className: '',
  },
  number: {
    name: 'Number',
    icon: 'numerical',
    align: 'right',
    className: 'pt-monospace-text',
  },
  money: {
    name: 'Money',
    icon: 'dollar',
    align: 'right',
    className: 'pt-monospace-text',
  },
  date: {
    name: 'Date',
    icon: 'numerical',
    align: 'right',
    validator: x => moment.utc(x).toISOString(),
  },
}

const defaults = {
  validator: x => x,
}

Object.keys(colTypes).forEach(cType => {
  Object.keys(defaults).forEach(key => {
    if (colTypes[cType][key] === undefined) {
      colTypes[cType][key] = defaults[key];
    }
  })
});

export default colTypes;
