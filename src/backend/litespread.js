'use strict';
// var sql = require('sql.js');
// var parser = require('./libs/sqlite-parser.js');


// var query = 'select pants from laundry;';
// var ast = parser(query);
// console.log(ast);

var formatters = {
        'money': x => `printf("%.2f", ${x})`,
}

var summaries = {
        'undefined': x => 'NULL',
        'sum': x => `sum(${x})`,
        'avg': x => `avg(${x})`,
}


function make_col(col) {
    var select = col.formula || col.name;
    return `${select} AS ${col.name}`;
}


function make_raw_view(db, table) {
    var from_clause, rowid;
    if (table.from) {
        from_clause = table.from;
        rowid = 'null AS rowid';
    } else {
        from_clause = table.name;
        rowid = 'rowid';
    }
    var select = table.columns.map(make_col).join(', ');
    // console.log(select);

    db.run(`
        DROP VIEW IF EXISTS ${table.name}_raw;
        CREATE VIEW ${table.name}_raw AS
        SELECT ${rowid}, ${select} FROM ${from_clause}
    `);
}


function format_col(col, select) {
    var formatter = formatters[col.format] || (x => x);
    return formatter(select || col.name) + ' AS ' + col.name;
}


function make_formatted_view(db, table) {
    var select = table.columns.map(col => format_col(col)).join(', ');
    var summary = table.columns.map(
        col => {
            var summary = summaries[col.summary || 'undefined'];
            if (summary === undefined) {
                throw Error("Unknown summary: " + col.summary)
            };
            return format_col(col, summary(col.name));
        }
    ).join(', ');
    var script = `
        DROP VIEW IF EXISTS ${table.name}_formatted;
        CREATE VIEW ${table.name}_formatted AS
        SELECT rowid, ${select} FROM ${table.name}_raw
        UNION ALL
        SELECT rowid, ${summary} FROM ${table.name}_raw
    `
    // console.log(script);
    db.run(script)
}


function updateDocument(db) {
    let tables = db.exec("SELECT table_name FROM litespread_table")[0]
        .values.map(row => row[0]);
    tables = tables.map(t => getTableDesc(db, t));
    tables.forEach(
        table => {
            make_raw_view(db, table);
            make_formatted_view(db, table);
        }
    );
}


function importDocument(db) {
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
            table_name text,
            description text
        );
        INSERT INTO litespread_table(table_name)
        SELECT DISTINCT name
        FROM sqlite_master
        WHERE type = 'table';
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS litespread_column (
            table_name text,
            name text,
            position int,
            format text,
            summary text,
            description text
        );
    `);
    var col_insert = db.prepare(`
        INSERT INTO litespread_column(table_name, name, position)
        VALUES (?, ?, ?)
    `)
    db.each("SELECT table_name FROM litespread_table", [], ({table_name}) => {
        db.each(`PRAGMA table_info(${table_name})`, [], ({cid, name}) => {
            col_insert.run([table_name, name, cid]);
        });
    });
}

// skipCommit is useful for tests
function changeColumnName(db, table, colIndex, newName, skipCommit) {
    const oldCols = table.columns.filter(c => !c.formula).map(c => c.name);
    const newCols = oldCols.map((c, i) => i === colIndex ? newName : c);
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
    `
    db.exec(q);
    if (!skipCommit) { db.run("COMMIT"); console.log('commit', newName) }
}

function getTableDesc(db, table_name) {
    let columns = [];
    db.each(`
            SELECT * FROM litespread_column
            WHERE table_name = '${table_name}'
        `, [], db_row => columns.push(db_row));

    return {
        name: table_name,
        columns: columns,
    }
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


export { updateDocument, importDocument, changeColumnName, getTableDesc, addColumn }; 
