import React from 'react';
import SQL from 'sql.js';
import FileSaver from 'file-saver';
import {
  Tree,
  Button,
  EditableText,
  Dialog,
  Classes,
  Intent,
  TextArea
} from '@blueprintjs/core';

import SpreadTable from './SpreadTable.js';
import MainNavbar from './MainNavbar.js';
import * as ls from './backend/litespread.js';
import { MIME_TYPE } from './RemoteFile.js';

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

class Document extends React.PureComponent {
  constructor(props, context) {
    super(props, context);

    this.state = {
      db: null,
      last_db_change: null,
      editView: null
    };
  }

  get filename() {
    return this.props.match.params.filename;
  }

  componentDidMount() {
    const self = this;
    if (this.props.match.params.location === 'files') {
      console.log('Load from remotestorage ' + this.filename);
      this.props.remoteClient.getFile(this.filename).then(
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
      console.log('Load from URL ' + this.filename);
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
    const lsdoc = new ls.Document(db);
    lsdoc.dataChangeCallbacks.push(this.onDataChange);
    lsdoc.schemaChangeCallbacks.push(this.onSchemaChange);
    window.db = db; // for debugging

    this.setState({
      db: db,
      lsdoc: lsdoc,
      last_db_change: new Date(),
      currentTable: lsdoc.tables[0].name
    });

    // Keeping this global is nice for debugging.
    window.lsdoc = lsdoc;
  };

  save = () => {
    if (this.props.match.params.location === 'files') {
      this.props.remoteClient.save(
        this.filename,
        this.state.db.export().buffer
      );
      // Turn foreign keys back on which have been turned off during the
      // export. See https://github.com/kripken/sql.js/issues/233
      this.state.db.run('PRAGMA foreign_keys = ON');
    }
  };

  onDataChange = () => {
    this.setState({ last_db_change: new Date() });
    this.save();
  };

  onSchemaChange = () => {
    console.log('schema changed');
    this.state.lsdoc.update();
    this.setState({ last_db_change: new Date() });
    this.save();
  };

  // download file to disk
  saveFile = () => {
    const blob = new Blob([this.state.db.export()], { type: MIME_TYPE });
    FileSaver.saveAs(blob, this.filename);
  };

  deleteFile = () => {
    this.props.remoteClient
      .remove(this.filename)
      .then(() => this.props.history.push('/'));
  };

  exportCSV = () => {
    const currentTableObj = this.state.lsdoc.tables.filter(
      t => t.name === this.state.currentTable
    )[0];
    const json = currentTableObj.asJSON();

    return import('papaparse').then(Papa => {
      const csv = Papa.unparse(json);
      const blob = new Blob([csv], { type: 'text/csv' });
      const filename = this.filename.split('.')[0] + '.csv';
      FileSaver.saveAs(blob, filename);
    });
  };

  rename = requestedName => {
    console.log(this.blob);
    this.props.remoteClient
      .add(requestedName, this.state.db.export().buffer)
      .then(actualName => this.props.history.push('/files/' + actualName));

    this.props.remoteClient.remove(this.filename);
  };

  render() {
    if (!this.state.lsdoc) {
      return null;
    }

    let currentTableObj = this.state.lsdoc.tables.filter(
      t => t.name === this.state.currentTable
    )[0];
    if (!currentTableObj) {
      currentTableObj = this.state.lsdoc.tables[0];
    }

    const nodes = this.state.lsdoc.tables.map((table, tableIndex) => {
      const selected = table.name === currentTableObj.name;
      return {
        id: 'table-' + tableIndex,
        label: (
          <EditableText
            defaultValue={table.name}
            disabled={!selected}
            onConfirm={name => {
              if (table.name === name) {
                return;
              }
              table.rename(name);
              this.setState({ currentTable: name });
              this.onSchemaChange();
            }}
          />
        ),
        table: table,
        depth: 1,
        path: [0, tableIndex],
        isSelected: selected,
        secondaryLabel: selected && (
          <div>
            {table.type === 'view' && (
              <Button
                icon="cog"
                minimal={true}
                onClick={() => {
                  this.setState({ editView: table });
                }}
              />
            )}
            {this.state.lsdoc.tables.length > 1 && (
              <Button
                icon="trash"
                minimal={true}
                onClick={() => {
                  table.drop();
                  this.onSchemaChange();
                }}
              />
            )}
          </div>
        )
      };
    });
    const tableNodes = nodes.filter(n => n.table.type === 'table');
    const viewNodes = nodes.filter(n => n.table.type === 'view');

    return (
      <div className="App">
        <MainNavbar
          doc={this}
          remotestorageState={this.props.remotestorageState}
          remoteClient={this.props.remoteClient}
        />
        <div className="document-container">
          <Tree
            onNodeClick={node => {
              if (node.table) {
                this.setState({ currentTable: node.table.name });
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
                secondaryLabel: (
                  <Button
                    icon="add"
                    minimal={true}
                    onClick={() => {
                      this.state.lsdoc.createTableWithDefaultName('table');
                    }}
                  />
                )
              },
              {
                id: 'views-section',
                label: 'Views',
                depth: 0,
                path: 0,
                isExpanded: true,
                hasCaret: false,
                childNodes: viewNodes,
                secondaryLabel: (
                  <Button
                    icon="add"
                    minimal={true}
                    onClick={() => {
                      this.state.lsdoc.createViewWithDefaultName('view');
                    }}
                  />
                )
              }
            ]}
          />
          <SpreadTable
            db={this.state.db}
            table={currentTableObj}
            key={currentTableObj.name}
            last_db_change={this.state.last_db_change}
            onDataChange={this.onDataChange}
            onSchemaChange={this.onSchemaChange}
          />
        </div>
        {this.state.editView !== null && (
          <ViewEditor
            view={this.state.editView}
            onClose={() => this.setState({ editView: null })}
          />
        )}
      </div>
    );
  }
}

class ViewEditor extends React.PureComponent {
  constructor(props, context) {
    super(props, context);

    this.state = {
      sql: this.props.view.getSource()
    };
  }

  save = () => {
    this.props.view.setSource(this.state.sql);
    this.props.onClose();
  };

  render() {
    return (
      <Dialog
        isOpen={true}
        onClose={this.props.onClose}
        title={'Edit ' + this.props.view.name}
        className="view-editor"
      >
        <div className={Classes.DIALOG_BODY}>
          <TextArea
            fill={true}
            onChange={event => this.setState({ sql: event.target.value })}
            value={this.state.sql}
          />
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button onClick={this.props.onClose}>Discard Changes</Button>
            <Button intent={Intent.PRIMARY} onClick={this.save}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }
}

export { Document as default, loadAsDb };
