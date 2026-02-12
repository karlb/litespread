import initSqlJs from 'sql.js';

const sqlPromise = initSqlJs({
  locateFile: file => `/${file}`
});

export default sqlPromise;
