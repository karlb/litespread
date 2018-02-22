var sqliteParser = require('sqlite-parser');

/////////////////////// findCols /////////////////////

/* eslint no-extend-native: ["error", { "exceptions": ["Set"] }] */
Set.prototype.union = function(setB) {
  var union = new Set(this);
  for (var elem of setB) {
    union.add(elem);
  }
  return union;
};

Set.prototype.difference = function(setB) {
  var difference = new Set(this);
  for (var elem of setB) {
    difference.delete(elem);
  }
  return difference;
};

function traverse(o, func) {
  if (Array.isArray(o)) {
    o.map(x => traverse(x, func));
  } else if (typeof o === 'object') {
    func(o);
    for (var i in o) {
      traverse(o[i], func);
    }
  } else {
    func(o);
  }
}

function findCols(formula) {
  let cols = [];
  const syntaxTree = sqliteParser('SELECT ' + formula);
  traverse(syntaxTree, el => {
    if (el.variant === 'column') {
      cols.push(el.name);
    }
  });
  return cols;
}

////////////////////// db methods /////////////////

function addDbMethods(db) {
    db.changeRows = (sqlStmt, params, expectedChanges) => {
      const changes = db.run(sqlStmt, params).getRowsModified();
      console.assert(
        changes === expectedChanges,
        'Got %i changes instead of %i in statement %s with params %s',
        changes,
        expectedChanges,
        sqlStmt,
        params
      );
    };

    db.changeRow = (sqlStmt, params) => {
      db.changeRows(sqlStmt, params, 1);
    }

    db.getAsObject = (sqlStmt, params) => {
      const stmt = db.prepare(sqlStmt)
      const obj = stmt.getAsObject(params || {});
      stmt.free();
      return obj;
    }
}

export { findCols, addDbMethods };
