var fs = require('fs');
var sql = require('sql.js');
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
    var from_clause = table.from || table.name;
    var select = table.columns.map(make_col).join(', ');
    // console.log(select);

    db.run(`
        DROP VIEW IF EXISTS ${table.name}_raw;
        CREATE VIEW ${table.name}_raw AS
        SELECT rowid, ${select} FROM ${from_clause}
    `);
}


function format_col(col, select) {
    var formatter = formatters[col.formatter] || (x => x);
    return formatter(select || col.name) + ' AS ' + col.name;
}


function make_formatted_view(db, table) {
    var select = table.columns.map(col => format_col(col)).join(', ');
    var summary = table.columns.map(
        col => {
            var summary = summaries[col.summary || 'undefined'];
            if (summary === undefined) {throw "Unknown summary: " + col.summary};
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


function update_document(db, doc) {
    doc.tables.forEach(
        table => {
            make_raw_view(db, table);
            make_formatted_view(db, table);
        }
    );
}
export { update_document }; 


if (typeof window === 'undefined') {
    var filename = '../test.sqlite3';
    var filebuffer = fs.readFileSync(filename);
    var db = new sql.Database(filebuffer);
    update_document(db);
    var data = db.export();
    var buffer = new Buffer(data);
    fs.writeFileSync(filename, buffer);
} else {
    window.update_document = update_document;
}
