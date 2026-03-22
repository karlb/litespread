import React from 'react';
import sqlPromise from './initSql.js';
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
  Routes,
  Route,
  Navigate,
  Link
} from 'react-router-dom';
import withRouter from './withRouter.jsx';
import * as Sentry from '@sentry/browser';

import RemoteLitespread from './RemoteFile.js';
import Document, { loadAsDb } from './Document.jsx';
import MainNavbar from './MainNavbar.jsx';
import StartPage from './StartPage.jsx';
import './App.css';
import packageJson from '../package.json';
const version = packageJson.version;

Sentry.init({
  dsn: 'https://3acc6160c3ac43c09eb2e9bfcac854a4@sentry.io/1496942',
  enabled: window.location.href.indexOf('localhost') === -1,
  release: version
});

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
    sqlPromise.then(SQL => {
      const db = new SQL.Database();
      db.run(`
        CREATE TABLE table1 (col1, col2, col3);
        INSERT INTO table1 (col1)
        VALUES (null), (null), (null);
      `);
      const filename = 'new_file.sqlite3';
      remoteClient
        .add(filename, db.export().buffer)
        .then(() => this.props.navigate('/files/' + filename));
    });
  };

  uploadFile = event => {
    const f = event.target.files[0];
    const r = new FileReader();
    const filename = document
      .getElementById('inputfile')
      .value.split(/[\\/]/)
      .pop();

    const save_and_redirect = data => {
      remoteClient
        .add(filename, data)
        .then(() => this.props.navigate('/files/' + filename));
    };

    r.onload = () => {
      const data = r.result;
      const isSqlite =
        new Uint8Array(data, 0, 6).every((b, i) => b === [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65][i]);
      if (isSqlite) {
        save_and_redirect(data);
      } else if (filename.endsWith('.csv')) {
        const text = new TextDecoder().decode(data);
        loadAsDb(text, filename).then(db =>
          save_and_redirect(db.export().buffer)
        );
      } else {
        save_and_redirect(data);
      }
    };
    r.readAsArrayBuffer(f);
    event.target.value = null;
  };

  render() {
    return (
      <div>
        <MainNavbar remotestorageState={this.props.remotestorageState} />
        <div className="start-page">
          <h1 className={Classes.HEADING}>Litespread Documents</h1>
          <div>
            Litespread is viewer and editor for SQLite and CSV files with basic
            spreadsheet functionality. Saved files can be used with other SQLite
            compatible software without losing formatting, formulas, aggregate
            rows and views.{' '}
            <a href="https://github.com/karlb/litespread/wiki">
              Read more&hellip;
            </a>
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
              <ul className="bp5-list-unstyled">
                {this.state.files.map(filename => (
                  <li key={filename}>
                    <Link to={'/files/' + filename}>{filename}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <NonIdealState
                title="No Files found"
                description="Apparently you didn't save any files in Litespread, yet. Please use one of the actions above to work with Litespread. If you already have documents in your remoteStorage, please sign in from the menu at the top-right."
                icon="document"
              />
            )}
          </Card>
        </div>
      </div>
    );
  }
}

const WrappedFilesPage = withRouter(FilesPage);
const WrappedDocument = withRouter(Document);

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

  componentDidMount() {
    // handle connectionState
    remoteStorage.on('connected', () => {
      const userAddress = remoteStorage.remote.userAddress;
      console.log(`${userAddress} connected their remote storage.`);
      this.setState({
        connectionState: 'connected',
        connectedAs: userAddress
      });
      Sentry.setUser({ username: userAddress });
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
      console.error('Remotestorage error:', error);
      this.showError(error.name, error.message);
    });

    // handle sync
    remoteStorage.on('sync-done', () => {
      this.setState({ lastSync: new Date() });
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
    return (
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/files" replace />} />
          <Route
            path="/start"
            element={<StartPage remotestorageState={remotestorageState} />}
          />
          <Route
            path="/files"
            element={<WrappedFilesPage remotestorageState={remotestorageState} />}
          />
          <Route
            path="/files/*"
            element={
              <WrappedDocument
                remoteClient={remoteClient}
                remotestorageState={remotestorageState}
              />
            }
          />
          <Route
            path="/url/*"
            element={
              <WrappedDocument
                remoteClient={remoteClient}
                remotestorageState={remotestorageState}
              />
            }
          />
        </Routes>
        {this.state.error && (
          <Dialog
            title={this.state.error.title}
            isOpen={true}
            onClose={() => this.setState({ error: null })}
          >
            <div className={Classes.DIALOG_BODY}>{this.state.error.text}</div>
          </Dialog>
        )}
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
