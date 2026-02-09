import initSqlJs from 'sql.js';

const sqlPromise = initSqlJs({
  locateFile: file => `${process.env.PUBLIC_URL}/${file}`
});

export default sqlPromise;
