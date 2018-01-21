import React, { Component } from 'react';
import './App.css';
import { updateDocument, importDocument } from './backend/litespread.js'
import SQL from 'sql.js'
import SpreadTable from './SpreadTable.js'
import { EditableText, Tab, Tabs, FocusStyleManager, Navbar, NavbarGroup,
    NavbarHeading, NavbarDivider, Button
} from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import RemoteStorage from 'remotestoragejs';
import Widget from 'remotestorage-widget';

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
        /*{
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
        },*/
    ],
}




class App extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            db: null,
            last_db_change: null,
            tables: [],
        }
    }

    componentDidMount() {
        const self = this;
        const fromRemote = false;
        if (fromRemote) {
            remoteClient.getFile('test.sqlite').then(file => {
                file.data
                let uInt8Array = new Uint8Array(file.data);
                let db = new SQL.Database(uInt8Array);
                updateDocument(db, doc);
                self.setState({db: db, last_db_change:new Date()});
            });
        } else {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', '/test.sqlite3', true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function(e) {
                let uInt8Array = new Uint8Array(this.response);
                let db = new SQL.Database(uInt8Array);
                importDocument(db);
                updateDocument(db, doc);
                self.receiveDb(db);
            };
            xhr.send();
        }
    }

    receiveDb = (db) => {
        db.changeRows = (sqlStmt, params, expectedChanges) => {
            const changes = db.run(sqlStmt, params).getRowsModified();
            console.assert(changes === expectedChanges,
                    'Got %i changes instead of %i in statement %s with params %s',
                    changes, expectedChanges, sqlStmt, params);
        }

        const tables = db.exec("SELECT table_name FROM litespread_table")[0]
            .values.map(row => row[0]);
        window.db = db;  // for debugging
        this.setState({
            db: db,
            last_db_change:new Date(),
            tables: tables,
            current_table: tables[0],
        });
    }

    onDataChange = () => {
        this.setState({last_db_change: new Date()});
        remoteClient.storeFile('application/x-sqlite3', 'test.sqlite', this.state.db.export().buffer)
    }

    onSchemaChange = () => {
        updateDocument(this.state.db);
        this.setState({last_db_change: new Date()});
    }

    render() {
        return (
            <div className="App">
                <Navbar>
                    <NavbarGroup>
                        <NavbarHeading>Litespread</NavbarHeading>
                    </NavbarGroup>
                    <NavbarGroup align="right">
                        <Button className="pt-minimal" iconName="home">Home</Button>
                        <Button className="pt-minimal" iconName="document">Files</Button>
                        <NavbarDivider />
                        <Button className="pt-minimal" iconName="user"></Button>
                        <Button className="pt-minimal" iconName="notifications"></Button>
                        <Button className="pt-minimal" iconName="cog"></Button>
                    </NavbarGroup>
                </Navbar>
                <Tabs id="TableTabs"
                    defaultSelectedTabId="table-tab-0"
                    vertical={true}
                    //renderActiveTabPanelOnly={true}
                >
                    {this.state.tables.map((table_name, tableIndex) => (
                        <Tab id={"table-tab-" + tableIndex} title={table_name} key={tableIndex} panel={(
                            <SpreadTable
                                db={this.state.db}
                                tableName={table_name}
                                key={table_name}
                                last_db_change={this.state.last_db_change}
                                onDataChange={this.onDataChange}
                                onSchemaChange={this.onSchemaChange}
                            />
                        )} />
                    ))}
                    {/*
                    <Tabs.Expander />
                    <input className="pt-input" type="text" placeholder="Search..." />
                    */}
                </Tabs>
            </div>
       );
    }
}

const remoteDir = 'litespread'
const remoteStorage = new RemoteStorage();
remoteStorage.access.claim(remoteDir, 'rw');
remoteStorage.caching.enable('/' + remoteDir +'/')
const remoteClient = remoteStorage.scope('/' + remoteDir +'/');
window.remoteClient = remoteClient;

const widget = new Widget(remoteStorage);
widget.attach();

FocusStyleManager.onlyShowFocusOnTabs();

export default App;
