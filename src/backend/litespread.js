var squel = require('squel');
var helper = require('./litespread_helper.js');

var formatters = {
  money: x => `printf("%.2f", ${x})`
};

var summaries = {
  undefined: x => 'NULL',
  sum: x => `sum(${x})`,
  avg: x => `avg(${x})`
};

function make_raw_view(db, table) {
  let s = squel.select();
  if (table.from) {
    s.from(table.from);
    s.field('null', 'rowid');
  } else {
    s.from(table.name);
    s.field('rowid');
  }

  // calculate col depencencies
  table.columns.forEach(col => {
    if (col.formula) {
      col.deps = new Set(helper.findCols(col.formula));
    } else {
      col.deps = new Set();
    }
  });
  // resolve dependencies
  let availableCols = new Set(
    table.columns.filter(c => !c.formula).map(c => c.name)
  );
  let todoCols = table.columns;
  let iterations = 0;
  while (todoCols.length) {
    let nextTodoCols = [];
    let nextAvailableCols = new Set();
    todoCols.forEach(col => {
      col.deps = col.deps.difference(availableCols);
      if (col.deps.size === 0) {
        s.field(col.formula || col.name, col.name);
        nextAvailableCols.add(col.name);
      } else {
        nextTodoCols.push(col);
      }
    });

    iterations++;
    if (iterations > 100) {
      throw Error(
        'could not resolve dependencies for columns ' +
          todoCols.map(c => c.name).join(', ')
      );
    }

    todoCols = nextTodoCols;
    availableCols = availableCols.union(nextAvailableCols);
    s = squel
      .select()
      .from(s)
      .field('*');
  }

  db.run(`
        DROP VIEW IF EXISTS ${table.name}_raw;
        CREATE VIEW ${table.name}_raw AS
        ${s.toString()}
    `);
}

function format_col(col, select) {
  var formatter = formatters[col.format] || (x => x);
  return formatter(select || col.name) + ' AS ' + col.name;
}

function make_formatted_view(db, table) {
  var select = table.columns.map(col => format_col(col)).join(', ');
  var summary = table.columns
    .map(col => {
      var summary = summaries[col.summary || 'undefined'];
      if (summary === undefined) {
        throw Error('Unknown summary: ' + col.summary);
      }
      return format_col(col, summary(col.name));
    })
    .join(', ');
  var script = `
        DROP VIEW IF EXISTS ${table.name}_formatted;
        CREATE VIEW ${table.name}_formatted AS
        SELECT rowid, ${select} FROM ${table.name}_raw
    `;
  if (table.hasFooter) {
    script += `
        UNION ALL
        SELECT rowid, ${summary} FROM ${table.name}_raw
    `;
  }
  db.run(script);
}

function updateDocument(db) {
  let tables = db
    .exec('SELECT table_name FROM litespread_table')[0]
    .values.map(row => row[0]);
  tables = tables.map(t => getTableDesc(db, t));
  tables.forEach(table => {
    make_raw_view(db, table);
    make_formatted_view(db, table);
  });
}

function importDocument(db) {
  if (
    db.exec(
      "SELECT count(*) FROM sqlite_master WHERE name = 'litespread_document'"
    )[0].values[0][0]
  ) {
    return;
  }
  db.run(`
        CREATE TABLE IF NOT EXISTS litespread_document (
            api_version int NOT NULL,
            author text,
            license text,
            description text
        );
        INSERT INTO litespread_document(api_version) VALUES (1);
    `);
  db.run(`
        CREATE TABLE IF NOT EXISTS litespread_table (
            table_name text NOT NULL PRIMARY KEY,
            description text
        );
        INSERT INTO litespread_table(table_name)
        SELECT DISTINCT name
        FROM sqlite_master
        WHERE type = 'table';
    `);
  db.run(`
        CREATE TABLE IF NOT EXISTS litespread_column (
            table_name text NOT NULL,
            name text NOT NULL,
            position int NOT NULL,
            format text,
            summary text,
            formula text,
            description text,
            PRIMARY KEY (table_name, position)
        );
    `);
  var col_insert = db.prepare(`
        INSERT INTO litespread_column(table_name, name, position)
        VALUES (?, ?, ?)
    `);
  db.each('SELECT table_name FROM litespread_table', [], ({ table_name }) => {
    db.each(`PRAGMA table_info(${table_name})`, [], ({ cid, name }) => {
      col_insert.run([table_name, name, cid]);
    });
  });
}

// skipCommit is useful for tests
function changeColumnName(db, table, colIndex, newName, skipCommit) {
  const oldCols = table.columns.filter(c => !c.formula).map(c => c.name);
  const newCols = oldCols.map((c, i) => (i === colIndex ? newName : c));
  const q = `
        BEGIN;
            ALTER TABLE ${table.name} RENAME TO _old_table;
            CREATE TABLE ${table.name} (${newCols});
            INSERT INTO ${table.name}
            SELECT ${oldCols}
            FROM _old_table;
            DROP TABLE _old_table;

            UPDATE litespread_column
            SET name='${newName}'
            WHERE table_name = '${table.name}' AND position = ${colIndex};
    `;
  db.exec(q);
  if (!skipCommit) {
    db.run('COMMIT');
  }
}

function getTableDesc(db, table_name) {
  let columns = [];
  db.each(
    `
            SELECT * FROM litespread_column
            WHERE table_name = '${table_name}'
        `,
    [],
    db_row => columns.push(db_row)
  );

  return {
    name: table_name,
    columns: columns,
    hasFooter: columns.some(c => c.summary)
  };
}

function addColumn(db, tableName, colName) {
  db.run(`
        ALTER TABLE ${tableName} ADD COLUMN '${colName}';
        INSERT INTO litespread_column(table_name, name, position)
        VALUES ('${tableName}', '${colName}', (
                SELECT max(position) + 1
                FROM litespread_column
                WHERE table_name = '${tableName}'
            ));
    `);
}

function addFormulaColumn(db, tableName, colName, formula) {
  db.run(
    `
      INSERT INTO litespread_column (table_name, name, formula, position)
      VALUES (
        :table_name, :col_name, :formula,
        (SELECT max(position) + 1 FROM litespread_column WHERE table_name = :table_name)
        )
      `,
    {
      ':table_name': tableName,
      ':col_name': colName,
      ':formula': formula
    }
  );
}

export {
  updateDocument,
  importDocument,
  changeColumnName,
  getTableDesc,
  addColumn,
  addFormulaColumn
};
