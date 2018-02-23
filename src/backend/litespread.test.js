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
            department_id int
        );
    `);
  return new ls.Document(db);
}


it('updateDocument', () => {
  const db = createTestDB();
  ls.importDocument(db);
  ls.updateDocument(db);
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

  rows = doc.db.exec('SELECT table_name FROM litespread_table')[0].values;
  expect(rows[0]).toEqual(['employee']);

  rows = doc.db.exec('SELECT table_name, name, position FROM litespread_column')[0]
    .values;
  expect(rows[0]).toEqual(['employee', 'name', 0]);
  expect(rows[1]).toEqual(['employee', 'department_id', 1]);
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
  testChange(0, 'emp_name', 'CREATE TABLE employee (emp_name,department_id)');
  testChange(1, 'department', 'CREATE TABLE employee (name,department)');

  ls.updateDocument(doc.db);
});

it('addColumn', () => {
  const doc = createTestDoc();
  ls.addColumn(doc.db, 'employee', 'employed_since');

  let rows = doc.db.exec(`
        SELECT name FROM litespread_column
        WHERE table_name ='employee' ORDER BY position
    `)[0].values;
  expect(rows[0]).toEqual(['name']);
  expect(rows[1]).toEqual(['department_id']);
  expect(rows[2]).toEqual(['employed_since']);

  ls.updateDocument(doc.db);
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
  ls.addColumn(doc.db, 'employee', 'employed_since');
  const table = ls.getTableDesc(doc.db, 'employee');
  ls.changeColumnName(doc.db, table, 2, 'work_start');
  ls.updateDocument(doc.db);
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
    const table = ls.getTableDesc(doc.db, 'example');
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
