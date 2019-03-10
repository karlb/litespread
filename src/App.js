import React from 'react';
import SQL from 'sql.js';
import {
  FocusStyleManager,
  Card,
  Classes,
  Dialog,
  NonIdealState
} from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import RemoteStorage from 'remotestoragejs';
import {
  BrowserRouter as Router,
  Route,
  Redirect,
  Link
} from 'react-router-dom';

import RemoteLitespread from './RemoteFile.js';
import Document, { loadAsDb } from './Document.js';
import MainNavbar from './MainNavbar.js';
import StartPage from './StartPage.js';
import './App.css';

class FilesPage extends React.Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      files: []
    };
  }

  componentDidMount() {
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
        <MainNavbar remotestorageState={this.props.remotestorageState} />
        <div className="start-page">
          <h1 className={Classes.HEADING}>Litespread Documents</h1>
          <div>
            Litespread is viewer and editor for SQLite and CSV files with basic spreadsheet functionality. Saved files can be used with other SQLite compatible software without losing formatting, formulas, aggregate rows and views. <a href="https://bitbucket.org/karlb/litespread/wiki/">Read more&hellip;</a>
          </div>
          <div className="big-actions">
            <Card interactive={true} onClick={this.newFile}>
              <NonIdealState
                title="Create new File"
                description="Start from scratch with an empty file."
                icon="add"
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
                icon="folder-open"
              />
            </Card>
          </div>

          <Card>
            <h2 className={Classes.HEADING}>Your Files</h2>
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
                description="Apparently you didn't save any files in Litespread, yet. Please use on of the actions above to work with Litespread. If you already have documents in your remoteStorage, please sign in from the menu at the top-right, now."
                icon="document"
              />
            )}
          </Card>
        </div>
      </div>
    );
  }
}

const Index = props => {
  return <Redirect to="/files" />;
};

class App extends React.Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      lastSync: null,
      connectionState: null,
      connectedAs: null,
      error: null
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
    remoteStorage.on('network-online', () => {
      this.setState({ connectionState: 'connected' });
    });
    remoteStorage.on('network-offline', () => {
      this.setState({ connectionState: 'offline' });
    });
    remoteStorage.on('not-connected', () => {
      this.setState({ connectionState: 'not-connected' });
    });
    remoteStorage.on('disconnected', () => {
      this.setState({ connectionState: 'not-connected' });
    });
    remoteStorage.on('error', error => {
      this.showError(error.name, error.message);
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
    const remotestorageState = {
      lastSync: this.state.lastSync,
      connectionState: this.state.connectionState,
      connectedAs: this.state.connectedAs,
      remoteClient: remoteClient,
      remoteStorage: remoteStorage
    };
    const DocWithProps = props => {
      return (
        <Document
          {...props}
          remoteClient={remoteClient}
          remotestorageState={remotestorageState}
        />
      );
    };

    return (
      <Router>
        <React.Fragment>
          <Route
            exact
            path="/"
            render={props => (
              <Index {...props} remotestorageState={remotestorageState} />
            )}
          />
          <Route
            exact
            path="/start"
            render={props => (
              <StartPage {...props} remotestorageState={remotestorageState} />
            )}
          />
          <Route
            exact
            path="/files"
            render={props => (
              <FilesPage {...props} remotestorageState={remotestorageState} />
            )}
          />
          <Route
            path="/:location(files|url)/:filename(.*)"
            render={DocWithProps}
          />
          {this.state.error && (
            <Dialog
              title={this.state.error.title}
              isOpen={true}
              onClose={() => this.setState({ error: null })}
            >
              <div className={Classes.DIALOG_BODY}>{this.state.error.text}</div>
            </Dialog>
          )}
        </React.Fragment>
      </Router>
    );
  }

  showError = (title, text) => {
    this.setState({ error: { title: title, text: text } });
  };
}

FocusStyleManager.onlyShowFocusOnTabs();

const remoteStorage = new RemoteStorage({
  modules: [RemoteLitespread],
  cache: true
  // logging: true,
});
remoteStorage.access.claim('litespread', 'rw');
remoteStorage.caching.enable('/litespread/');
const remoteClient = remoteStorage.litespread;
window.remoteClient = remoteClient; // for debugging

export default App;
