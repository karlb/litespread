import * as moment from 'moment';

let colTypes = {
  generic: {
    name: 'Generic',
    icon: 'blank',
    align: 'left',
    className: '',
    defaultPrecision: null
  },
  number: {
    name: 'Number',
    icon: 'numerical',
    align: 'right',
    className: 'pt-monospace-text',
    defaultPrecision: 0
  },
  money: {
    name: 'Money',
    icon: 'dollar',
    align: 'right',
    className: 'pt-monospace-text',
    defaultPrecision: 2
  },
  date: {
    name: 'Date',
    icon: 'calendar',
    align: 'right',
    validator: x => moment.utc(x).toISOString(),
    defaultPrecision: null
  }
};

const defaults = {
  validator: x => x
};

Object.keys(colTypes).forEach(cType => {
  Object.keys(defaults).forEach(key => {
    if (colTypes[cType][key] === undefined) {
      colTypes[cType][key] = defaults[key];
    }
  });
});

export default colTypes;
