import React, { Component } from 'react';
import './App.css';
import 'bootstrap/dist/css/bootstrap.css';
import ReactDataGrid from 'react-data-grid';
import { update_document } from './backend/litespread.js'
import SQL from 'sql.js'

function entries(obj) {
    var ownProps = Object.keys(obj),
    i = ownProps.length,
    resArray = new Array(i);  // preallocate the Array
    while (i--)
        resArray[i] = [ownProps[i], obj[ownProps[i]]];

    return resArray;
};

var doc = {
    'tables': [
        {
            'name': 'inventory',
            'columns': [
                {
                    'name': 'name',
                    'position': 0,
                },
                {
                    'name': 'qty',
                    'position': 1,
                    'summary': 'sum',
                },
                {
                    'name': 'price',
                    'position': 2,
                    'formatter': 'money',
                    'summary': 'avg',
                },
                {
                    'name': 'total_price',
                    'position': 3,
                    'formula': 'qty * price',
                    'formatter': 'money',
                    'summary': 'sum',
                },
            ],
        },
        {
            'name': 'joined_table',
            'from': 'inventory JOIN sales USING (name)',
            'columns': [
                {
                    'name': 'name',
                    'position': 0,
                },
                {
                    'name': 'shop',
                    'position': 1,
                },
                {
                    'name': 'price',
                    'position': 2,
                    'formatter': 'money',
                    'summary': 'avg',
                },
                {
                    'name': 'revenue',
                    'position': 2,
                    'formula': 'price * units_sold',
                    'formatter': 'money',
                    'summary': 'avg',
                }
            ],
        },
    ],
}


var formatter_alignment = {
    'undefined': 'left',
    'money': 'right',
};


function CustomHeader(props) {
    const col = props.column;
    var header = <div class="{col.cellClass}">{col.key}</div>;
    if (col.formula) {
        return [header, <div>= {col.formula}</div>];
    }
    return header;
}


class App extends Component {
  render() {
    return (
      <div className="App">
        <Example />
      </div>
    );
  }
}


class Example extends React.Component {

    constructor(props, context) {

        super(props, context);
        this._columns = [
        { key: 'id', name: 'ID' },
        { key: 'title', name: 'Title' },
        { key: 'count', name: 'Count' } ];

        this.state = {
            rows: [],
            columns: [],
        };
    }

    componentDidMount() {
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/test.sqlite3', true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function(e) {
            var uInt8Array = new Uint8Array(this.response);
            self._db = new SQL.Database(uInt8Array);
            window.db = self._db;
            update_document(self._db, doc);
            self.setState({
                columns: doc.tables[0].columns.map(col => ({
                    key: col.name,
                    name: col.name,
                    cellClass: 'text-' + formatter_alignment[col.formatter || 'undefined'],
                    editable: !col.formula,
                    headerRenderer: CustomHeader,
                    formula: col.formula,
                }))
                //columns: result[0].columns.map(c => ({key: c, name: c})),
            });
            self.updateFromDb();
            // contents is now [{columns:['col1','col2',...], values:[[first row], [second row], ...]}]
            //update_document(db);
        };
        xhr.send();
    }

    updateFromDb() {
        var result = this._db.exec("SELECT * FROM inventory_formatted");
        var rows = result[0].values.map(row => row);
        this.setState({
            rows: rows,
        });
    }

    handleGridRowsUpdated = ({ fromRow, toRow, updated }) => {
        console.log(fromRow, toRow, updated);
        var row_ids = [];
        for (let i = fromRow; i <= toRow; i++) {
            row_ids.push(this.state.rows[i][0]);
        }
        var set = entries(updated).map(
                item => `${item[0]} = '${item[1]}'`
            ).join(', ');
        console.log(row_ids, set);
        this._db.exec(`
                UPDATE inventory
                SET ${set}
                WHERE _rowid_ IN (${row_ids.join(', ')})
        `);
        this.updateFromDb();
    };

    rowGetter = (rowIndex) => {
        var row = {};
        this.state.rows[rowIndex].forEach(
            (value, i) => {
                if (i === 0) {
                    row.rowid = value
                } else {
                    row[this.state.columns[i - 1].key] = value;
                }
            }
        )
        return row;
    };

    render() {
        return  (
                <ReactDataGrid
                columns={this.state.columns}
                rowGetter={this.rowGetter}
                rowsCount={this.state.rows.length}
                minHeight={500}
                onGridRowsUpdated={this.handleGridRowsUpdated}
                enableCellSelect={true}  // required for editable
                headerRowHeight={60}
                />);
    }
}

export default App;
