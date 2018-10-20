var squel = require('squel');
var helper = require('./litespread_helper.js');

const LATEST_VERSION = 6;

var formatters = {
  money: (x, c) =>
    `CASE WHEN ${x} IS NOT NULL THEN printf("%.${c.precision}f", ${x}) END`,
  number: (x, c) =>
    `CASE WHEN ${x} IS NOT NULL THEN printf("%.${c.precision}f", ${x}) END`,
  date: x => `CASE WHEN ${x} IS NOT NULL THEN date(${x}) END`
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
    table.columns.filter(c => !c.formula).map(c => c.name.toLowerCase())
  );
  let todoCols = table.columns;
  let iterations = 0;
  while (todoCols.length) {
    let nextTodoCols = [];
    let nextAvailableCols = new Set();
    // eslint-disable-next-line no-loop-func
    todoCols.forEach(col => {
      col.deps = col.deps.difference(availableCols);
      if (col.deps.size === 0) {
        s.field(col.formula || col.name, col.name);
        nextAvailableCols.add(col.name.toLowerCase());
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

  let selectString = s.toString();
  if (table.order_by) {
    selectString += ' ORDER BY ' + table.order_by;
  }

  db.run(`
        DROP VIEW IF EXISTS ${table.name}_raw;
        CREATE VIEW ${table.name}_raw AS
        ${selectString}
    `);
}

function format_col(col, select) {
  var formatter = formatters[col.format] || (x => x);
  return formatter(select || col.name, col) + ' AS ' + col.name;
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
  let script = `
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

function upgradeDocument(db) {
  const api_version = db.exec('SELECT api_version FROM litespread_document')[0]
    .values[0][0];

  if (api_version === LATEST_VERSION) {
    return;
  } else if (api_version === 1) {
  } else if (api_version === 2) {
    db.run('ALTER TABLE litespread_column ADD COLUMN width float');
  } else if (api_version === 3) {
    db.run('ALTER TABLE litespread_column ADD COLUMN precision int');
  } else if (api_version === 4) {
    db.run('ALTER TABLE litespread_table ADD COLUMN order_by text');
  } else if (api_version === 5) {
    db.run(`ALTER TABLE litespread_table
      ADD COLUMN type text DEFAULT 'table'
        CHECK (type IN ('table', 'view', 'pivot'))
    `);
  }

  // increase api_version and continue until we're at the latest version
  db.run('UPDATE litespread_document SET api_version = ?', [api_version + 1]);
  upgradeDocument(db);
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

function findDefaultName(defaultName, existingNames) {
    let counter = 1;
    existingNames.forEach(name => {
      let match = RegExp(defaultName + '(\\d+)').exec(name);
      if (match) {
        counter = Math.max(parseInt(match[1], 10) + 1, counter);
      };
    });
    return defaultName + counter;
}

class Document {
  constructor(db) {
    helper.addDbMethods(db);
    db.run('PRAGMA foreign_keys = ON');
    this.db = db;
    this.importAll();
    this.update();
    this.schemaChangeCallbacks = [];
    this.dataChangeCallbacks = [];
  }

  importTable(tableName, type) {
    if (!this.db.get(
      'SELECT ? IN (SELECT table_name FROM litespread_table)', [tableName])[0][0]
    ) {
      this.db.run('INSERT INTO litespread_table(table_name, type) VALUES (?, ?)', [
        tableName, type
      ]);
    }
    const existingCols = this.db.getCol(
      'SELECT name FROM litespread_column WHERE table_name = ?', [tableName]);
    const col_insert = this.db.prepare(`
          INSERT INTO litespread_column(table_name, name, position)
          VALUES (?, ?, (
              SELECT coalesce(max(position), -1) + 1 FROM litespread_column
              WHERE table_name = ?
            ))
      `);
    this.db.each(`PRAGMA table_info(${tableName})`, [], ({ name }) => {
      if (!existingCols.includes(name)) {
        col_insert.run([tableName, name, tableName]);
      }
    });
  }

  importAll() {
    // VACUUM makes all rowids sequential, which is currently required for sorting
    this.db.run('VACUUM main');
    if (
      this.db.exec(
        "SELECT count(*) FROM sqlite_master WHERE name = 'litespread_document'"
      )[0].values[0][0]
    ) {
      upgradeDocument(this.db);
      return;
    }
    this.db.run(`
          CREATE TABLE IF NOT EXISTS litespread_document (
              api_version int NOT NULL,
              author text,
              license text,
              description text
          );
      `);
    this.db.run('INSERT INTO litespread_document(api_version) VALUES (?)', [
      LATEST_VERSION
    ]);
    this.db.run(`
          CREATE TABLE IF NOT EXISTS litespread_table (
              table_name text NOT NULL PRIMARY KEY,
              type text DEFAULT 'table'
                CHECK (type IN ('table', 'view', 'pivot')),
              description text,
              order_by text
          );
      `);
    this.db.run(`
          CREATE TABLE IF NOT EXISTS litespread_column (
              table_name text NOT NULL REFERENCES litespread_table(table_name) ON DELETE CASCADE,
              name text NOT NULL,
              position int NOT NULL,
              format text,
              summary text,
              formula text,
              description text,
              width float,
              precision int,
              PRIMARY KEY (table_name, name)
          );
          CREATE UNIQUE INDEX litespread_column_unique_position
            ON litespread_column(table_name, position);
      `);
    this.db.each(
      `
        SELECT DISTINCT name AS table_name, type
        FROM sqlite_master
        WHERE (
            type = 'table'
            AND name NOT LIKE 'litespread_%'
        ) OR (
            type = 'view'
            AND name NOT LIKE '%_raw'
            AND name NOT LIKE '%_formatted'
        )
        `,
      [],
      ({ table_name, type }) => {
        this.importTable(table_name, type);
      }
    );

    if (
      this.db.exec('SELECT count(*) FROM litespread_table')[0].values[0][0] ===
      0
    ) {
      throw new Error('Invalid file or no tables found.');
    }
  }

  update() {
    this.tables = this.db
      .getAsObjects('SELECT * FROM litespread_table')
      .map(t => makeTable(this.db, t, this));
    this.tables.forEach(table => {
      make_raw_view(this.db, table);
      make_formatted_view(this.db, table);
    });
  }

  schemaChanged() {
    this.schemaChangeCallbacks.forEach(c => c());
  }

  dataChanged() {
    this.dataChangeCallbacks.forEach(c => c());
  }

  createTableWithDefaultName(defaultName) {
    const name = findDefaultName(defaultName, this.tables.map(t => t.name));
    this.db.run(`
          CREATE TABLE ${name} (col1, col2, col3);
          INSERT INTO ${name} (col1)
          VALUES (null), (null), (null);
      `);
    this.importTable(name, 'table');
    this.update();
    this.schemaChanged();
  }
}

function makeTable(db, tableRow, doc) {
  const classes = {
    'table': Table,
    'view': View
  };
  return new classes[tableRow.type](db, tableRow, doc)
}

class Table {
  constructor(db, tableRow, doc) {
    this.db = db;
    this.parent = doc;
    this.name = tableRow.table_name;
    this.type = tableRow.type;
    this.order_by = tableRow.order_by;
    this._updateColumns();
    this.hasFooter = this.columns.some(c => c.summary);
  }

  _updateColumns() {
    let columns = [];
    this.db.each(
      `
              SELECT litespread_column.*
              FROM litespread_column
                   JOIN pragma_table_info('${this.name}') USING (name)
              WHERE table_name = '${this.name}'
              ORDER BY position
          `,
      [],
      db_row => columns.push(new Column(this.db, db_row, this))
    );
    this.columns = columns;
  }

  setCol(col, val) {
    this.db.changeRow(
      `
                    UPDATE litespread_table
                       SET ${col} = ?
                    WHERE table_name = ?
                `,
      [val, this.name]
    );
  }

  sortRowids() {
    sortRowids(this.db, this.name);
  }

  drop() {
    this.db.run(`
        DROP TABLE ${this.name};
        DELETE FROM litespread_table WHERE table_name = '${this.name}';
    `);
  }

  rename(newName) {
    this.db.run(`ALTER TABLE ${this.name} RENAME TO ${newName}`);
    const params = { ':old': this.name, ':new': newName };
    this.db.run('PRAGMA foreign_keys = OFF');
    this.db.run(
      'UPDATE litespread_table SET table_name = :new WHERE table_name = :old',
      params
    );
    this.db.run(
      'UPDATE litespread_column SET table_name = :new WHERE table_name = :old',
      params
    );
    this.db.run('PRAGMA foreign_keys = ON');
  }

  addColumn(colName, formula=null) {
    if (!formula) {
      this.db.run(`
        ALTER TABLE ${this.name} ADD COLUMN '${colName}';
      `);
    }
    this.db.run(`
      INSERT INTO litespread_column(table_name, name, position, formula)
      VALUES ('${this.name}', '${colName}', (
        SELECT max(position) + 1
        FROM litespread_column
        WHERE table_name = '${this.name}'
      ), ?);
    `, [formula]);
    this.schemaChanged();
  }

  addColumnWithDefaultName(defaultName, formula=null) {
    const name = findDefaultName(defaultName,
                                 this.columns.map(c => c.name));
    this.addColumn(name, formula);
    this._updateColumns();
  }

  asJSON() {
    const cols = this.columns.map(c => c.name);
    return {
      fields: cols,
      data: this.db.exec(`
          SELECT ${cols.join(', ')}
          FROM ${this.name}_formatted
        `)[0].values
    };
  }

  schemaChanged() {
    this.parent.schemaChanged();
  }

  dataChanged() {
    this.parent.dataChanged();
  }
}

class View extends Table {
  getSource() {
    const create = this.db.exec(
      `SELECT sql FROM sqlite_master WHERE name = '${this.name}'`
    )[0].values[0][0];
    return create.match(/\s+AS\s+([^]*)/)[1];
  }

  setSource(sql) {
    this.db.run(`
      DROP VIEW ${this.name};
      CREATE VIEW ${this.name} AS ${sql};
    `);
    this.parent.importTable(this.name, 'view');
    this.schemaChanged();
  }
}

class Column {
  constructor(db, columnRow, table) {
    Object.assign(this, columnRow);
    this.db = db;
    this.table = table;
  }

  setCol(col, val) {
    this.db.changeRow(
      `
          UPDATE litespread_column SET ${col} = ?
          WHERE table_name = ?
            AND name = ?
      `,
      [val, this.table_name, this.name]
    );
    this.schemaChanged();
  }

  updateData(updateSql) {
    this.db.run(`
          UPDATE ${this.table_name}
          SET ${this.name} = ${updateSql}
      `);
    this.dataChanged();
  }

  drop = () => {
    this.db.changeRow(
      `
      DELETE FROM litespread_column
      WHERE table_name = ?
      AND name = ?
      `,
      [this.table.name, this.name]
    );
    if (!this.formula) {
      // actually drop column from SQL table
      const remaining_cols = this.table.columns
        .filter(c => c.name !== this.name)
        .map(c => c.name)
        .join(', ');
      this.db.run(`
        BEGIN;
        ALTER TABLE ${this.table.name} RENAME TO __tmp;
        CREATE TABLE ${this.table.name} AS
        SELECT ${remaining_cols} FROM __tmp;
        DROP TABLE __tmp;
        COMMIT;
      `);
    }
    this.schemaChanged();
  };

  schemaChanged() {
    this.table.schemaChanged();
  }

  dataChanged() {
    this.table.dataChanged();
  }
}

function sortRowids(db, tableName) {
  const orderBy = db.exec(
    `SELECT order_by FROM litespread_table WHERE table_name = '${tableName}'`
  )[0].values[0][0];
  console.assert(orderBy, 'Need sort criterion!');
  const sortedRows = db.exec(`
      SELECT rowid FROM ${tableName}_raw ORDER BY ${orderBy}
  `)[0].values;
  const update = db.prepare(
    `UPDATE ${tableName} SET rowid = ? WHERE rowid = -?`
  );
  db.run(`UPDATE ${tableName} SET rowid = -rowid`);
  sortedRows.forEach(([oldRowid], i) => {
    update.run([i + 1, oldRowid]);
    console.assert(
      db.getRowsModified() === 1,
      `Failed to changed value for row ${oldRowid} to ${i + 1}`
    );
  });
}

function moveColumn(db, tableName, fromPosition, toPosition) {
  // Since sqlite checks the unique constraint after every row and there is no
  // way to force a specific order or disable the constraint, we'll have to
  // work around that. We do this by assigning each processed row a position
  // with the value 10000 added and then subtract that value from all rows
  // afterwards. This avoids temporary violations of the unique constraint.
  db.run(`
      BEGIN;
        UPDATE litespread_column
        SET position = 10000 + CASE
            WHEN position = ${fromPosition} THEN ${toPosition}
            WHEN ${fromPosition} < ${toPosition} THEN
              position + CASE
                WHEN position BETWEEN ${fromPosition} AND ${toPosition}
                  THEN -1
                ELSE 0
              END
            ELSE
              position + CASE
                WHEN position BETWEEN ${toPosition} AND ${fromPosition}
                  THEN +1
                ELSE 0
              END
          END
        WHERE table_name = '${tableName}';

        UPDATE litespread_column
        SET position = position - 10000
        WHERE table_name = '${tableName}';
      COMMIT;
    `);
}

function moveRow(db, tableName, fromPosition, toPosition) {
  // rowids start at 1
  fromPosition += 1;
  toPosition += 1;
  const count = db.exec(`
      SELECT count(*) FROM ${tableName} WHERE rowid IN (${fromPosition}, ${toPosition})
  `)[0].values[0][0];
  if (count !== 2) {
    console.warn('Move rowids not in table');
    return;
  }
  // Since sqlite checks the unique constraint after every row and there is no
  // way to force a specific order or disable the constraint, we'll have to
  // work around that. We do this by assigning each processed row a position
  // with the value 10000 added and then subtract that value from all rows
  // afterwards. This avoids temporary violations of the unique constraint.
  const sql = `
      BEGIN;
        UPDATE ${tableName}
        SET rowid = 1000000 + CASE
            WHEN rowid = ${fromPosition} THEN ${toPosition}
            WHEN ${fromPosition} < ${toPosition} THEN
              rowid + CASE
                WHEN rowid BETWEEN ${fromPosition} AND ${toPosition}
                  THEN -1
                ELSE 0
              END
            ELSE
              rowid + CASE
                WHEN rowid BETWEEN ${toPosition} AND ${fromPosition}
                  THEN +1
                ELSE 0
              END
          END;

        UPDATE ${tableName}
        SET rowid = rowid - 1000000;
      COMMIT;
    `;
  db.run(sql);
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

function importParsedJson(db, json, tableName) {
  tableName = toSafeName(tableName);
  const fields = json.data.shift();
  const cols = fields.map(toSafeName).join(', ');
  db.run(`
      CREATE TABLE "${tableName}" (${cols});
  `);
  const placeholders = fields.map(() => '?').join(', ');
  const stmt = db.prepare(
    `INSERT INTO "${tableName}" VALUES (${placeholders})`
  );
  json.data.forEach(row => stmt.run(row));
}

function toSafeName(name) {
  return name.replace(/\s+/g, '_').replace(/([a-zA-Z0-9_]+).*/, '$1');
}

export {
  importParsedJson,
  changeColumnName,
  moveColumn,
  moveRow,
  addFormulaColumn,
  Document
};
