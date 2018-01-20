import React, { Component } from 'react';
import './App.css';
import { update_document } from './backend/litespread.js'
import SQL from 'sql.js'
import SpreadTable from './SpreadTable.js'
import { EditableText, Tab, Tabs, FocusStyleManager, Navbar, NavbarGroup,
    NavbarHeading, NavbarDivider, Button, IconClasses
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
        const self = this;
        const fromRemote = true;
        if (fromRemote) {
            remoteClient.getFile('test.sqlite').then(file => {
                file.data
                let uInt8Array = new Uint8Array(file.data);
                let db = new SQL.Database(uInt8Array);
                update_document(db, doc);
                self.setState({db: db, last_db_change:new Date()});
            });
        } else {
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
    }

    onDataChange = () => {
        this.setState({last_db_change: new Date()});
        remoteClient.storeFile('application/x-sqlite3', 'test.sqlite', this.state.db.export().buffer)
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
                    {this.state.doc.tables.map((table, tableIndex) => (
                        <Tab id={"table-tab-" + tableIndex} title={table.name} key={tableIndex} panel={(
                            <SpreadTable
                                db={this.state.db}
                                table={table}
                                key={table.name}
                                last_db_change={this.state.last_db_change}
                                onDataChange={this.onDataChange}
                                onSchemaChange={(table) => {
                                    this.state.doc.tables[tableIndex] = table;
                                    update_document(this.state.db, this.state.doc);
                                    this.setState({last_db_change: new Date()});
                                }}
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
