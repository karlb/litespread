import React from 'react';
import './App.css';
import * as ls from './backend/litespread.js';
import SQL from 'sql.js';
import SpreadTable from './SpreadTable.js';
import {
  Tree,
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
  NonIdealState,
  EditableText
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
        ls.importParsedJson(db, json, filename);
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


function createDummyTable(db) {
    db.run(`
        CREATE TABLE table1 (col1, col2, col3);
        INSERT INTO table1 (col1)
        VALUES (null), (null), (null);
    `);
}

class Document extends React.PureComponent {
  constructor(props, context) {
    super(props, context);

    this.state = {
      db: null,
      last_db_change: null,
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

    const lsdoc = new ls.Document(db);
    window.db = db; // for debugging

    this.setState({
      db: db,
      lsdoc: lsdoc,
      last_db_change: new Date(),
      currentTable: lsdoc.tables[0].name
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
    this.state.lsdoc.update();
    this.setState({ last_db_change: new Date() });
    this.save();
  };

  // download file to disk
  saveFile = () => {
    const blob = new Blob([this.state.db.export()], { type: MIME_TYPE });
    FileSaver.saveAs(blob, this.filename);
  };

  rename = requestedName => {
    console.log(this.blob);
    remoteClient
      .add(requestedName, this.state.db.export().buffer)
      .then(actualName => this.props.history.push('/files/' + actualName));

    remoteClient.remove(this.filename);
  };

  render() {
    if (!this.state.lsdoc) {
      return null;
    }

    const tableNodes = 
      this.state.lsdoc.tables.map((table, tableIndex) => {
        const selected = table.name === this.state.currentTable;
        return {
          id: 'table-' + tableIndex,
          label: <EditableText
            defaultValue={table.name}
            disabled={!selected}
            onConfirm={name => {
              if (table.name === name) {return}
              table.rename(name);
              this.setState({currentTable: name});
              this.onSchemaChange();
            }} />,
          table: table,
          depth: 1,
          path: [0, tableIndex],
          isSelected: selected,
          secondaryLabel: selected && this.state.lsdoc.tables.length > 1 && <Button
            icon="trash"
            className="pt-minimal"
            onClick={() => {
              table.drop();
              this.onSchemaChange();
              this.setState({currentTable: this.lsdoc.tables[0].name})
            }}
          />
        }
      });

    const currentTableObj = this.state.lsdoc.tables.filter(
                t => t.name === this.state.currentTable)[0];
    if (!currentTableObj) {
      throw Error(`Could not find table ${this.state.currentTable}`);
    }

    return (
      <div className="App">
        <MainNavbar doc={this} />
        <div style={{display: 'flex', flexDirection: 'row'}}>
          <Tree
            onNodeClick={(node) => {
              if (node.table) {
                this.setState({currentTable: node.table.name});
              }
            }}
            contents={[
              {
                id: 'tables-section',
                label: 'Tables',
                depth: 0,
                path: 0,
                isExpanded: true,
                hasCaret: false,
                childNodes: tableNodes,
                secondaryLabel: <Button
                  icon="add"
                  onClick={() => {
                    createDummyTable(this.state.db);
                    this.state.lsdoc.importTable('table1');
                    this.onSchemaChange();
                  }}
                />
              },
            ]}
          />
          <SpreadTable
            db={this.state.db}
            table={currentTableObj}
            key={this.state.currentTable}
            last_db_change={this.state.last_db_change}
            onDataChange={this.onDataChange}
            onSchemaChange={this.onSchemaChange}
          />
        </div>
      </div>
    );
  }
}

class StartPage extends React.Component {
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
    createDummyTable(db);
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
          icon="document-open"
          text="Load from Disk"
          onClick={() => document.getElementById('inputfile').click()}
        />
        */}
        <MenuItem
          icon="download"
          text="Save to Disk"
          onClick={props.doc.saveFile}
        />
        <MenuItem icon="folder-open" text="Synced Files">
          <MenuItem icon="blank" text="..." />
        </MenuItem>
      </Menu>
    );

    menus = (
      <Popover content={fileMenu} position={Position.BOTTOM}>
        <Button className="pt-minimal" icon="document">
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
        {props.doc && (
          <EditableText
            defaultValue={props.doc.filename}
            onConfirm={props.doc.rename}
          />
        )}
      </NavbarGroup>
      <NavbarGroup align="right">
        <Button className="pt-minimal" icon="home">
          Home
        </Button>
        {menus}
        <NavbarDivider />
        <Button className="pt-minimal" icon="user" />
        <Button className="pt-minimal" icon="notifications" />
        <Button className="pt-minimal" icon="cog" />
      </NavbarGroup>
    </Navbar>
  );
};

class App extends React.Component {
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
