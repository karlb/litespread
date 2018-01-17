import React, { Component } from 'react';
import './App.css';
import 'bootstrap/dist/css/bootstrap.css';
import { update_document } from './backend/litespread.js'
import SQL from 'sql.js'
import Table from './Table.js'

let doc = {
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




class App extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            doc: doc,
            db: null,
            last_db_change: null,
            current_table: doc.tables[0].name,
        }
    }

    componentDidMount() {
        let self = this;
        let xhr = new XMLHttpRequest();
        xhr.open('GET', '/test.sqlite3', true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function(e) {
            let uInt8Array = new Uint8Array(this.response);
            let db = new SQL.Database(uInt8Array);
            update_document(db, doc);
            self.setState({db: db, last_db_change:new Date()});
        };
        xhr.send();
    }

    render() {
        return (
                <div className="App">
                <ul className="nav nav-tabs">
                    {this.state.doc.tables.map((table) =>
                        <li role="presentation"
                            className={table.name === this.state.current_table ? 'active' : null}
                            key={table.name}
                            onClick={() => this.setState({current_table: table.name})}
                        ><a href="#">{table.name}</a></li>
                    )}
                </ul>
                {this.state.doc.tables.map( (table, tableIndex) =>
                    (table.name === this.state.current_table) &&
                    <Table
                        db={this.state.db}
                        table={table}
                        key={table.name}
                        last_db_change={this.state.last_db_change}
                        onDataChange={() => this.setState({last_db_change: new Date()})}
                        onSchemaChange={(table) => {
                            this.state.doc.tables[tableIndex] = table;
                            update_document(this.state.db, this.state.doc);
                            this.setState({last_db_change: new Date()});
                        }}
                    />
                )}
                </div>
               );
    }
}

export default App;
