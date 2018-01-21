import fs from 'fs';
import sql from 'sql.js';
import * as ls from './litespread.js'

function createTestDB() {
    const db = new sql.Database();
    db.run(`
        CREATE TABLE employee (
            name text,
            department_id int
        );
    `);
    return db
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
    const db = createTestDB();
    ls.importDocument(db);
    let rows;

    rows = db.exec("SELECT table_name FROM litespread_table")[0].values;
    expect(rows[0]).toEqual(['employee'])

    rows = db.exec("SELECT table_name, name, position FROM litespread_column")[0].values;
    expect(rows[0]).toEqual(['employee', 'name', 0])
    expect(rows[1]).toEqual(['employee', 'department_id', 1])
});


it('changeColumnName', () => {
    const db = createTestDB();
    ls.importDocument(db);
    const table = ls.getTableDesc(db, 'employee');

    function testChange(colIndex, newName, expected) {
        ls.changeColumnName(db, table, colIndex, newName, true);
        const table_sql = db.exec(
                "SELECT sql FROM sqlite_master WHERE name = 'employee'")[0]
            .values[0][0];
        expect(table_sql).toEqual(expected);
        expect(db.exec(`
                    SELECT count(*) FROM litespread_column
                    WHERE name = '${newName}' AND table_name = '${table.name}'`
                )[0].values[0][0]
            ).toEqual(1);
        db.exec('ROLLBACK');
    }
    testChange(0, 'emp_name', 'CREATE TABLE employee (emp_name,department_id)');
    testChange(1, 'department', 'CREATE TABLE employee (name,department)');

    ls.updateDocument(db);
});


it('addColumn', () => {
    const db = createTestDB();
    ls.importDocument(db);
    ls.addColumn(db, 'employee', 'employed_since');

    let rows = db.exec(`
        SELECT name FROM litespread_column
        WHERE table_name ='employee' ORDER BY position
    `)[0].values;
    expect(rows[0]).toEqual(['name'])
    expect(rows[1]).toEqual(['department_id'])
    expect(rows[2]).toEqual(['employed_since'])

    ls.updateDocument(db);
});


it('rename new column', () => {
    const db = createTestDB();
    ls.importDocument(db);
    ls.addColumn(db, 'employee', 'employed_since');
    const table = ls.getTableDesc(db, 'employee')
    ls.changeColumnName(db, table, 2, 'work_start');
    ls.updateDocument(db);
});
