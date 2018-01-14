import React, { Component } from 'react';
import './App.css';
import 'bootstrap/dist/css/bootstrap.css';
import { update_document } from './backend/litespread.js'
import SQL from 'sql.js'
import Table from './Table.js'

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




class App extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            db: null,
        }
    }

    componentDidMount() {
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/test.sqlite3', true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function(e) {
            var uInt8Array = new Uint8Array(this.response);
            var db = new SQL.Database(uInt8Array);
            update_document(db, doc);
            self.setState({db: db});
        };
        xhr.send();
    }

    render() {
        return (
                <div className="App">
                <Table db={this.state.db} table={doc.tables[0]}/>
                </div>
               );
    }
}

export default App;
