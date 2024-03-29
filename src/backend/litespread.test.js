import fs from 'fs';
import sql from 'sql.js';
import Papa from 'papaparse';
import * as ls from './litespread.js';

function createTestDB() {
  const db = new sql.Database();
  db.run(`
        CREATE TABLE employee (
            name text,
            department_id int
        );
    `);
  return db;
}

function createTestDoc() {
  const db = new sql.Database();
  db.run(`
        CREATE TABLE employee (
            name text,
            department_id int,
            "evil.Column name" text
        );
        INSERT INTO employee VALUES ('Jim', 1, null);
    `);
  db.run(`
        CREATE VIEW v_employee AS
        SELECT 'foo' AS name, 1 AS department_id;
  `);
  return new ls.Document(db);
}

it('updateDocument', () => {
  const db = createTestDB();
  new ls.Document(db);
  // const filename = '../test.sqlite3';
  // const filebuffer = fs.readFileSync(filename);
  // const db = new sql.Database(filebuffer);
  //const data = db.export();
  //const buffer = new Buffer(data);
  //fs.writeFileSync(filename, buffer);
});

it('importDocument', () => {
  const doc = createTestDoc();
  let rows;

  rows = doc.db.exec(
    'SELECT table_name FROM litespread_table ORDER BY table_name'
  )[0].values;
  expect(rows[0]).toEqual(['employee']);
  expect(rows[1]).toEqual(['v_employee']);

  rows = doc.db.exec(
    'SELECT table_name, name, position FROM litespread_column ORDER BY 1, 3'
  )[0].values;
  expect(rows[0]).toEqual(['employee', 'name', 0]);
  expect(rows[1]).toEqual(['employee', 'department_id', 1]);
  expect(rows[2]).toEqual(['employee', 'evil.Column name', 2]);
  expect(rows[3]).toEqual(['v_employee', 'name', 0]);
  expect(rows[4]).toEqual(['v_employee', 'department_id', 1]);
});

it('changeColumnName', () => {
  const doc = createTestDoc();
  const table = doc.tables[0];

  function testChange(colIndex, newName, expected) {
    ls.changeColumnName(doc.db, table, colIndex, newName, true);
    const table_sql = doc.db.exec(
      "SELECT sql FROM sqlite_master WHERE name = 'employee'"
    )[0].values[0][0];
    expect(table_sql).toEqual(expected);
    expect(
      doc.db.exec(`
                    SELECT count(*) FROM litespread_column
                    WHERE name = '${newName}' AND table_name = '${
        table.name
      }'`)[0].values[0][0]
    ).toEqual(1);
    doc.db.exec('ROLLBACK');
  }
  testChange(
    0,
    'emp_name',
    'CREATE TABLE "employee" ("emp_name","department_id","evil.Column name")'
  );
  testChange(
    1,
    'department',
    'CREATE TABLE "employee" ("name","department","evil.Column name")'
  );

  doc.update();
});

it('addColumn', () => {
  const doc = createTestDoc();
  const table = doc.tables[0];
  table.addColumn('employed_since');

  let rows = doc.db.exec(`
        SELECT name FROM litespread_column
        WHERE table_name ='employee' ORDER BY position
    `)[0].values;
  expect(rows[0]).toEqual(['name']);
  expect(rows[1]).toEqual(['department_id']);
  expect(rows[3]).toEqual(['employed_since']);

  doc.update();
});

it('import1', () => {
  const json = Papa.parse('src/backend/test-data/import1.csv', {});
  const db = new SQL.Database();
  ls.importParsedJson(db, json, 'import1');
});

it('import2', () => {
  const json = Papa.parse('src/backend/test-data/import2.csv', {});
  const db = new SQL.Database();
  ls.importParsedJson(db, json, 'import2 test');
});

it('moveColumn', () => {
  function checkMoveResult(from, to, result) {
    const db = new sql.Database();
    db.run(`
          CREATE TABLE example (
              col0 text,
              col1 int,
              col2 int,
              col3 int
          );
      `);
    const doc = new ls.Document(db);
    ls.moveColumn(doc.db, 'example', from, to);
    let rows = doc.db.exec(`
          SELECT name, position FROM litespread_column
          WHERE table_name ='example' ORDER BY position
      `)[0].values;
    expect(rows).toEqual(result.map((x, i) => ['col' + x, i]));
  }

  checkMoveResult(2, 1, [0, 2, 1, 3]);
  checkMoveResult(1, 2, [0, 2, 1, 3]);
  checkMoveResult(1, 3, [0, 2, 3, 1]);
  checkMoveResult(0, 2, [1, 2, 0, 3]);
});

it('moveRow', () => {
  function checkMoveResult(from, to, result) {
    const db = new sql.Database();
    db.run(`
          CREATE TABLE example (
              value int
          );
      `);
    const doc = new ls.Document(db);
    doc.db.run(`
        INSERT INTO example
        VALUES (0), (1), (2), (3)
    `);
    ls.moveRow(doc.db, 'example', from, to);
    let rows = doc.db.exec(`
          SELECT rowid, value FROM example
          ORDER BY rowid
      `)[0].values;
    expect(rows).toEqual(result.map((x, i) => [i + 1, x]));
  }

  checkMoveResult(2, 1, [0, 2, 1, 3]);
  checkMoveResult(1, 2, [0, 2, 1, 3]);
  checkMoveResult(1, 3, [0, 2, 3, 1]);
  checkMoveResult(0, 2, [1, 2, 0, 3]);

  // ignore errors
  checkMoveResult(-1, 2, [0, 1, 2, 3]);
  checkMoveResult(1, 4, [0, 1, 2, 3]);
});

it('rename new column', () => {
  const doc = createTestDoc();
  const table = doc.tables[0];
  table.addColumn('employed_since');
  ls.changeColumnName(doc.db, table, 2, 'work_start');
  doc.update();
});

it('rename table', () => {
  const doc = createTestDoc();
  const table = doc.tables[0];
  table.rename('new_name');
  doc.update();
  const newTable = doc.tables[0];
  expect(newTable.name).toEqual('new_name');
  expect(newTable.columns.length).toEqual(table.columns.length);

  // also see if renaming views works without errors
  let view = doc.tables.filter(t => t.type === 'view')[0];
  view.rename('new_view');
});

it('drop column', () => {
  const doc = createTestDoc();
  doc.tables[0].columns[1].drop();
  doc.update();
  const table = doc.tables[0];

  // check litespread table
  expect(table.columns.length).toEqual(2);
  expect(table.columns[0].name).toEqual('name');

  // check sql schema
  const cols = doc.db.exec(`
    PRAGMA table_info('employee')
  `)[0].values;
  expect(cols.length).toEqual(2);
  expect(cols[0][1]).toEqual('name');
});

it('sortRowids', () => {
  function checkResult(orderBy, result) {
    const db = new sql.Database();
    db.run(`
          CREATE TABLE example (
              value int
          );
      `);
    const doc = new ls.Document(db);
    doc.db.run(`
        INSERT INTO example
        VALUES (0), (1), (2), (3)
    `);
    const table = doc.tables[0];
    table.setCol('order_by', orderBy);
    table.sortRowids();
    let rows = doc.db.exec(`
          SELECT rowid, value FROM example
          ORDER BY rowid
      `)[0].values;
    expect(rows).toEqual(result.map((x, i) => [i + 1, x]));
  }

  checkResult('value DESC', [3, 2, 1, 0]);
});

it('createTableWithDefaultName', () => {
  const doc = createTestDoc();
  doc.createTableWithDefaultName('table');
  doc.createTableWithDefaultName('table');
});

it('createViewWithDefaultName', () => {
  const doc = createTestDoc();
  doc.createViewWithDefaultName('table');
  doc.createViewWithDefaultName('table');
});

it('addColumnWithDefaultName', () => {
  const doc = createTestDoc();
  const table = doc.tables[0];
  table.addColumnWithDefaultName('col');
  table.addColumnWithDefaultName('col');
  table.addColumnWithDefaultName('col', '1 + 1');
  table.addColumnWithDefaultName('col', '"evil.Column name" + 1');
  doc.update();
  expect(doc.db.getCol('SELECT col3 FROM employee_raw')[0]).toEqual(2);
});

it('view: get/setSource', () => {
  const doc = createTestDoc();
  let view = doc.tables.filter(t => t.type === 'view')[0];
  const sql = view.getSource();

  // overwrite view with same SQL an expect same output
  view.setSource(sql);
  doc.update();
  view = doc.tables.filter(t => t.type === 'view')[0];
  expect(view.columns.map(c => c.name)).toEqual(['name', 'department_id']);

  // add one column and remove another one
  view.setSource("SELECT 'foo' AS name, 2 AS bacon");
  doc.update();
  view = doc.tables.filter(t => t.type === 'view')[0];
  expect(view.columns.map(c => c.name)).toEqual(['name', 'bacon']);
});
