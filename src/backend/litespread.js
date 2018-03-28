var squel = require('squel');
var helper = require('./litespread_helper.js');

const LATEST_VERSION = 5;

var formatters = {
  money: (x, c) => `CASE WHEN ${x} IS NOT NULL THEN printf("%.${c.precision}f", ${x}) END`,
  number: (x, c) => `CASE WHEN ${x} IS NOT NULL THEN printf("%.${c.precision}f", ${x}) END`,
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


class Document {

  constructor(db) {
    helper.addDbMethods(db);
    this.db = db;
    this.importAll();
    this.update();
  }

  importTable(tableName) {
    this.db.run(
      "INSERT INTO litespread_table(table_name) VALUES (?)",
      [tableName]
    );
    const col_insert = this.db.prepare(`
          INSERT INTO litespread_column(table_name, name, position)
          VALUES (?, ?, ?)
      `);
    this.db.each(`PRAGMA table_info(${tableName})`, [], ({ cid, name }) => {
      col_insert.run([tableName, name, cid]);
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
    this.db.each(`
        SELECT DISTINCT name AS table_name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'litespread_%'
        `, [],
        ({ table_name }) => {
          this.importTable(table_name);
        }
    );

    if (this.db.exec('SELECT count(*) FROM litespread_table')[0].values[0][0] === 0) {
      throw new Error('Invalid file or no tables found.');
    }
  }

  update() {
    this.tables = this.db.getAsObjects('SELECT * FROM litespread_table')
      .map(t => new Table(this.db, t));
    this.tables.forEach(table => {
      make_raw_view(this.db, table);
      make_formatted_view(this.db, table);
    });
  }
}


class Table {
  constructor(db, tableRow) {
    let columns = [];
    db.each(
      `
              SELECT * FROM litespread_column
              WHERE table_name = '${tableRow.table_name}'
          `,
      [],
      db_row => columns.push(new Column(db, db_row))
    );

    this.db = db;
    this.name = tableRow.table_name;
    this.columns = columns;
    this.order_by = tableRow.order_by;
    this.hasFooter = columns.some(c => c.summary);
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
    sortRowids(this.db, this.name)
  }

  drop() {
    this.db.run(`
        DROP TABLE ${this.name};
        DELETE FROM litespread_table WHERE table_name = '${this.name}';
    `);
  }

  rename(newName) {
    this.db.run(`ALTER TABLE ${this.name} RENAME TO ${newName}`);
    const params = {':old': this.name, ':new': newName};
    this.db.run("UPDATE litespread_table SET table_name = :new WHERE table_name = :old", params);
    this.db.run("UPDATE litespread_column SET table_name = :new WHERE table_name = :old", params);
  }

  asJSON() {
    return {
      fields: this.columns.map(c => c.name),
      data: this.db.exec(`SELECT * FROM ${this.name}_formatted`)[0].values,
    }
  }
}


class Column {
  constructor(db, columnRow) {
    Object.assign(this, columnRow);
    this.db = db;
  }

  setCol(col, val) {
    console.log(col, val, this.table_name, this.name);
    this.db.changeRow(`
          UPDATE litespread_column SET ${col} = ?
          WHERE table_name = ?
            AND name = ?
      `,
      [val, this.table_name, this.name]
    );
  }

  updateData(updateSql) {
    this.db.run(`
          UPDATE ${this.table_name}
          SET ${this.name} = ${updateSql}
      `
    );
  }
}

function getTableDesc(db, tableName) {
  let table = db.getAsObject(`SELECT * FROM litespread_table WHERE table_name = '${tableName}'`);

  return new Table(db, table);
}


function sortRowids(db, tableName) {
  const orderBy = db.exec(`SELECT order_by FROM litespread_table WHERE table_name = '${tableName}'`)[0].values[0][0];
  console.assert(orderBy, 'Need sort criterion!');
  const sortedRows = db.exec(`
      SELECT rowid FROM ${tableName}_raw ORDER BY ${orderBy}
  `)[0].values;
  const update = db.prepare(`UPDATE ${tableName} SET rowid = ? WHERE rowid = -?`);
  db.run(`UPDATE ${tableName} SET rowid = -rowid`);
  sortedRows.forEach(([oldRowid], i) => {
    update.run([i + 1, oldRowid]);
    console.assert(
        db.getRowsModified() === 1,
        `Failed to changed value for row ${oldRowid} to ${i + 1}`
    );
  });
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
  getTableDesc,
  addColumn,
  moveColumn,
  moveRow,
  addFormulaColumn,
  Document
};
