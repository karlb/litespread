import React, { Component } from 'react';
import './App.css';
import * as ls from './backend/litespread.js';
import SQL from 'sql.js';
import SpreadTable from './SpreadTable.js';
import {
  Tab,
  Tabs,
  FocusStyleManager,
  Navbar,
  NavbarGroup,
  NavbarHeading,
  NavbarDivider,
  Button,
  Menu,
  MenuItem,
  Popover,
  Position,
  Card,
  NonIdealState
} from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import RemoteStorage from 'remotestoragejs';
import Widget from 'remotestorage-widget';
import FileSaver from 'file-saver';
import { BrowserRouter as Router, Route, Link } from 'react-router-dom';
import RemoteLitespread, { MIME_TYPE } from './RemoteFile.js';

function loadAsDb(dataPromise, filename) {
  if (filename.endsWith('.csv')) {
    return Promise.all([import('papaparse'), dataPromise]).then(
      ([Papa, data]) => {
        const json = Papa.parse(data, {});
        const db = new SQL.Database();
        const tableName = filename
          .replace(/\s+/g, '_')
          .replace(/([a-zA-Z0-9_]+).*/, '$1');
        ls.importParsedJson(db, json, tableName);
        return db;
      }
    );
  } else {
    return dataPromise.then(data => {
      const uInt8Array = new Uint8Array(data);
      return new SQL.Database(uInt8Array);
    });
  }
}

class Document extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      db: null,
      last_db_change: null,
      tables: []
    };
  }

  get filename() {
    return this.props.match.params.filename;
  }

  componentDidMount() {
    const self = this;
    if (this.props.match.params.location === 'files') {
      remoteClient.getFile(this.filename).then(
        file => {
          const uInt8Array = new Uint8Array(file.data);
          const db = new SQL.Database(uInt8Array);
          self.receiveDb(db);
        },
        () => {
          console.error('Could not load file from remote storage!');
        }
      );
    } else {
      fetch(this.filename).then(result => {
        if (this.filename.endsWith('.csv')) {
          result = result.text();
        } else {
          result = result.arrayBuffer();
        }
        let filename = this.filename.split('/').pop();
        loadAsDb(result, filename).then(this.receiveDb);
      });
    }
  }

  receiveDb = db => {
    // just a helper function
    db.changeRows = (sqlStmt, params, expectedChanges) => {
      const changes = db.run(sqlStmt, params).getRowsModified();
      console.assert(
        changes === expectedChanges,
        'Got %i changes instead of %i in statement %s with params %s',
        changes,
        expectedChanges,
        sqlStmt,
        params
      );
    };

    ls.importDocument(db);
    ls.updateDocument(db);

    const tables = db
      .exec('SELECT table_name FROM litespread_table')[0]
      .values.map(row => row[0]);
    window.db = db; // for debugging
    this.setState({
      db: db,
      last_db_change: new Date(),
      tables: tables,
      current_table: tables[0]
    });
  };

  save = () => {
    if (this.props.match.params.location === 'files') {
      remoteClient.save(this.filename, this.state.db.export().buffer);
    }
  };

  onDataChange = () => {
    this.setState({ last_db_change: new Date() });
    this.save();
  };

  onSchemaChange = () => {
    ls.updateDocument(this.state.db);
    this.setState({ last_db_change: new Date() });
    this.save();
  };

  saveFile = () => {
    const blob = new Blob([this.state.db.export()], { type: MIME_TYPE });
    FileSaver.saveAs(blob, this.filename);
  };

  render() {
    return (
      <div className="App">
        <MainNavbar doc={this} />
        <Tabs
          id="TableTabs"
          defaultSelectedTabId="table-tab-0"
          vertical={true}
          //renderActiveTabPanelOnly={true}
        >
          {this.state.tables.map((table_name, tableIndex) => (
            <Tab
              id={'table-tab-' + tableIndex}
              title={table_name}
              key={tableIndex}
              panel={
                <SpreadTable
                  db={this.state.db}
                  tableName={table_name}
                  key={table_name}
                  last_db_change={this.state.last_db_change}
                  onDataChange={this.onDataChange}
                  onSchemaChange={this.onSchemaChange}
                />
              }
            />
          ))}
        </Tabs>
      </div>
    );
  }
}

class StartPage extends Component {
  constructor(props, context) {
    super(props, context);

    // remotestorage widget
    const widget = new Widget(remoteStorage);
    widget.attach();

    this.state = {
      files: []
    };

    remoteClient.list().then(listing => {
      this.setState({ files: Object.keys(listing) });
    });
  }

  newFile = event => {
    const db = new SQL.Database();
    db.run(`
        CREATE TABLE table1 (col1, col2, col3);
        INSERT INTO table1 (col1)
        VALUES (null), (null), (null);
    `);
    ls.importDocument(db);
    const filename = 'new_file.sqlite3';
    remoteClient
      .add(filename, db.export().buffer)
      .then(() => this.props.history.push('/files/' + filename));
  };

  uploadFile = event => {
    const f = event.target.files[0];
    const r = new FileReader();
    const self = this;
    const filename = document
      .getElementById('inputfile')
      .value.split(/[\\/]/)
      .pop();

    const save_and_redirect = data => {
      remoteClient
        .add(filename, data)
        .then(() => self.props.history.push('/files/' + filename));
    };

    if (filename.endsWith('.csv')) {
      r.onload = () =>
        loadAsDb(r.result, filename).then(db =>
          save_and_redirect(db.export().buffer)
        );
      r.readAsText(f);
    } else {
      r.onload = () => save_and_redirect(r.result);
      r.readAsArrayBuffer(f);
    }
    event.target.value = null;
  };

  render() {
    return (
      <div>
        <MainNavbar />
        <div className="start-page">
          <h1>Litespread Documents</h1>
          <div className="big-actions">
            <Card interactive={true} onClick={this.newFile}>
              <NonIdealState
                title="Create new File"
                description="Start from scratch with an empty file."
                visual="add"
              />
            </Card>
            <Card
              interactive={true}
              onClick={() => document.getElementById('inputfile').click()}
            >
              <input
                type="file"
                style={{ display: 'none' }}
                id="inputfile"
                onChange={this.uploadFile}
                value=""
              />
              <NonIdealState
                title="Load from Disk"
                description="Load file from disk and start editing."
                visual="folder-open"
              />
            </Card>
          </div>

          <Card>
            <h2>Your Files</h2>
            {this.state.files.length ? (
              <ul className="pt-list-unstyled">
                {this.state.files.map(filename => (
                  <li key={filename}>
                    <Link to={'files/' + filename}>{filename}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <NonIdealState
                title="No Files found"
                description="Apparently you didn't save any files in Litespread, yet. Please use on of the actions above to work with Litespread."
                visual="document"
              />
            )}
          </Card>
        </div>
      </div>
    );
  }
}

const MainNavbar = props => {
  let menus;
  if (props.doc) {
    const fileMenu = (
      <Menu>
        {/*
        <input
          type="file"
          style={{ display: '' }}
          id="inputfile"
          onChange={this.props.doc.uploadFile}
          value=""
        />
        <MenuItem
          iconName="document-open"
          text="Load from Disk"
          onClick={() => document.getElementById('inputfile').click()}
        />
        */}
        <MenuItem
          iconName="download"
          text="Save to Disk"
          onClick={props.doc.saveFile}
        />
        <MenuItem iconName="folder-open" text="Synced Files">
          <MenuItem iconName="blank" text="..." />
        </MenuItem>
      </Menu>
    );

    menus = (
      <Popover content={fileMenu} position={Position.BOTTOM}>
        <Button className="pt-minimal" iconName="document">
          File
        </Button>
      </Popover>
    );
  }

  return (
    <Navbar>
      <NavbarGroup>
        <Link to="/" className="logo-and-text">
          <img src="/img/logo.svg" alt="" />
          <NavbarHeading>Litespread</NavbarHeading>
        </Link>
        {props.doc && props.doc.filename}
      </NavbarGroup>
      <NavbarGroup align="right">
        <Button className="pt-minimal" iconName="home">
          Home
        </Button>
        {menus}
        <NavbarDivider />
        <Button className="pt-minimal" iconName="user" />
        <Button className="pt-minimal" iconName="notifications" />
        <Button className="pt-minimal" iconName="cog" />
      </NavbarGroup>
    </Navbar>
  );
};

class App extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      lastSync: null,
      connectionState: null,
      connectedAs: null
    };
  }

  componentWillMount() {
    // handle connectionState
    remoteStorage.on('connected', () => {
      const userAddress = remoteStorage.remote.userAddress;
      console.log(`${userAddress} connected their remote storage.`);
      this.setState({
        connectionState: 'connected',
        connectedAs: userAddress
      });
    });
    remoteStorage.on('network-offline', () => {
      this.setState({ connectionState: 'offline' });
    });
    remoteStorage.on('network-online', () => {
      this.setState({ connectionState: 'online' });
    });
    remoteStorage.on('not-connected', () => {
      this.setState({ connectionState: 'not-connected' });
    });

    // handle sync
    remoteStorage.on('sync-done', () => {
      this.setState({ lastSync: new Date() });
    });

    // handle error
    remoteStorage.on('error', error => {
      console.error('Remotestorage error:', error);
    });
  }

  render() {
    const DocWithProps = props => {
      return <Document {...props} lastSync={this.state.lastSync} />;
    };

    return (
      <Router>
        <React.Fragment>
          <Route exact path="/" component={StartPage} />
          <Route
            path="/:location(files|url)/:filename(.*)"
            render={DocWithProps}
          />
        </React.Fragment>
      </Router>
    );
  }
}

FocusStyleManager.onlyShowFocusOnTabs();

const remoteStorage = new RemoteStorage({
  modules: [RemoteLitespread],
  cache: true
  //logging: true,
});
remoteStorage.access.claim('litespread', 'rw');
const remoteClient = remoteStorage.litespread;
window.remoteClient = remoteClient; // for debugging

export default App;
