import React from 'react';
import SQL from 'sql.js';
import { FocusStyleManager, Card, NonIdealState } from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import RemoteStorage from 'remotestoragejs';
import Widget from 'remotestorage-widget';
import { BrowserRouter as Router, Route, Link } from 'react-router-dom';

import RemoteLitespread from './RemoteFile.js';
import Document, { loadAsDb, createDummyTable } from './Document.js';
import MainNavbar from './MainNavbar.js';
import './App.css';

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
                icon="document"
              />
            )}
          </Card>
        </div>
      </div>
    );
  }
}

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
      return (
        <Document
          {...props}
          lastSync={this.state.lastSync}
          remoteClient={remoteClient}
        />
      );
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
