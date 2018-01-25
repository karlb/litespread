import React, { Component } from 'react';
import './App.css';
import { updateDocument, importDocument } from './backend/litespread.js'
import SQL from 'sql.js'
import SpreadTable from './SpreadTable.js'
import { EditableText, Tab, Tabs, FocusStyleManager, Navbar, NavbarGroup,
    NavbarHeading, NavbarDivider, Button, Menu, MenuItem, Popover, Position,
    FileInput
} from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import RemoteStorage from 'remotestoragejs';
import Widget from 'remotestorage-widget';
import FileSaver from 'file-saver';
import {
  BrowserRouter as Router,
  Route,
  Link
} from 'react-router-dom'


const MIME_TYPE = 'application/x-sqlite3'


class ShowFile extends Component {

    constructor(props, context) {
        super(props, context);

        // set up remotestorage
        let remoteClient;
        if (this.props.match.params.location !== 'local') {
            const remoteDir = 'litespread'
            const remoteStorage = new RemoteStorage();
            remoteStorage.access.claim(remoteDir, 'rw');
            remoteStorage.caching.enable('/' + remoteDir +'/')
            remoteClient = remoteStorage.scope('/' + remoteDir +'/');
            window.remoteClient = remoteClient;

            const widget = new Widget(remoteStorage);
            widget.attach();
        }

        this.state = {
            db: null,
            last_db_change: null,
            tables: [],
            remoteClient: remoteClient,
        }
    }

    get filename() {
        return this.props.match.params.filename;
    }

    componentDidMount() {
        const self = this;
        if (this.state.remoteClient) {
            this.state.remoteClient.getFile(this.filename).then(file => {
                let uInt8Array = new Uint8Array(file.data);
                let db = new SQL.Database(uInt8Array);
                updateDocument(db);
                self.receiveDb(db);
            });
        } else {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', '/' + this.filename, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function(e) {
                let uInt8Array = new Uint8Array(this.response);
                let db = new SQL.Database(uInt8Array);
                importDocument(db);
                updateDocument(db);
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

    save = () => {
        if (!this.state.remoteClient) {
            return;
        }
        this.state.remoteClient.storeFile(
                MIME_TYPE,
                this.filename,
                this.state.db.export().buffer);
        console.log('saved!');
    }

    onDataChange = () => {
        this.setState({last_db_change: new Date()});
        this.save();
    }

    onSchemaChange = () => {
        updateDocument(this.state.db);
        this.setState({last_db_change: new Date()});
        this.save();
    }

    uploadFile = (event) => {
        console.log('upload started', event);
        const f = event.target.files[0];
        const r = new FileReader();
        const self = this;
        r.onload = function() {
            console.log('upload received')
            const Uints = new Uint8Array(r.result);
            const db = new SQL.Database(Uints);
            importDocument(db);
            updateDocument(db);
            self.receiveDb(db);
        }
        r.readAsArrayBuffer(f);
        event.target.value = null;
    }

    saveFile = () => {
        const blob = new Blob([this.state.db.export()], {type: MIME_TYPE});
        FileSaver.saveAs(blob, this.filename);
    }

    render() {
        const fileMenu = (
            <Menu>
                <input type="file" style={{display: ''}} id="inputfile" onChange={this.uploadFile} value=""/>
                <MenuItem iconName="document-open" text="Load from Disk" onClick={() => document.getElementById('inputfile').click()}/>
                <MenuItem iconName="download" text="Save to Disk" onClick={this.saveFile}/>
                <MenuItem iconName="folder-open" text="Synced Files">
                    <MenuItem iconName="blank" text="..." />
                </MenuItem>
            </Menu>
        );


        return (
            <div className="App">
                <Navbar>
                    <NavbarGroup>
                        <NavbarHeading>Litespread</NavbarHeading>
                    </NavbarGroup>
                    <NavbarGroup align="right">
                        <Button className="pt-minimal" iconName="home">Home</Button>
                        <Popover content={fileMenu} position={Position.BOTTOM}>
                            <Button className="pt-minimal" iconName="document">Files</Button>
                        </Popover>
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


FocusStyleManager.onlyShowFocusOnTabs();

const AppRouting = () => (
  <Router>
    <div>
      {/*
      <ul>
        <li><Link to="/files">Files</Link></li>
        <li><Link to="/files/test.sqlite">test.sqlite</Link></li>
      </ul>

      <hr/>

      <Route exact path="/" component={ShowFile}/>
      */}
      <Route path="/:location(files|local)/:filename" component={ShowFile}/>
    </div>
  </Router>
)

export default AppRouting;
