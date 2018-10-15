import React from 'react';
import {
  Alert,
  Navbar,
  NavbarGroup,
  NavbarHeading,
  NavbarDivider,
  Button,
  Classes,
  ControlGroup,
  Menu,
  MenuItem,
  Popover,
  Position,
  EditableText,
  Intent
} from '@blueprintjs/core';
import { Link } from 'react-router-dom';

class MainNavbar extends React.Component {
  constructor(props) {
    super(props);
    this.state = { deleteDialogOpen: false };
  }

  openDeleteDialog = () => {
    this.setState({ deleteDialogOpen: true });
  };

  render() {
    let menus;
    if (this.props.doc) {
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
            onClick={this.props.doc.saveFile}
          />
          <MenuItem
            icon="export"
            text="Export as CSV"
            onClick={this.props.doc.exportCSV}
          />
          <MenuItem
            icon="trash"
            text="Delete File"
            onClick={this.openDeleteDialog}
          />
          {/*
          <MenuItem icon="folder-open" text="Synced Files">
            <MenuItem icon="blank" text="..." />
          </MenuItem>
          */}
        </Menu>
      );

      menus = (
        <Popover content={fileMenu} position={Position.BOTTOM}>
          <Button minimal={true} icon="document">
            File
          </Button>
        </Popover>
      );
    }
      
    const connState = this.props.remotestorageState.connectionState;
    let userMenu;
    if (connState !== 'not-connected') {
      userMenu = (
        <Menu>
          <MenuItem
            icon="log-out"
            text="Log out"
            onClick={() => {this.props.remotestorageState.remoteStorage.disconnect()}}
          />
        </Menu>
      );
    } else {
      userMenu = (
        <form style={{width: '350px', padding: '20px'}}
          onSubmit={(event) => {
            this.props.remotestorageState.remoteStorage.connect(event.target.username.value);
            event.preventDefault();
          }}
        >
          <h4 className={Classes.HEADING}>Connect to remoteStorage</h4>
          <ControlGroup fill={true}>
            <input className={Classes.INPUT} placeholder="example@5apps.com"
              type="text" name="username" autoFocus={true} autocomplete="username"/>
            <Button type="submit" icon="log-in" intent="primary">Connect</Button>
          </ControlGroup>
          <p className={`${Classes.TEXT_SMALL} ${Classes.TEXT_MUTED}`} style={{'margin': '10px 0 0 0'}}>
            You can easily sync your Litespread documents across multiple deviced using a remoteStorage provider. Otherwise, all data will only be saved by your browser.
          </p>
          <p className={`${Classes.TEXT_SMALL} ${Classes.TEXT_MUTED}`} style={{'margin': '10px 0 0 0'}}>
            <a href="https://remotestorage.io/" target="_blank" rel="noopener noreferrer">Learn more about remoteStorage</a>
            <br />
            <a href="https://5apps.com/storage/beta" target="_blank" rel="noopener noreferrer">Get a free account</a>
          </p>
          {/*
          <MenuItem
            icon="log-in"
            text="Connect to remoteStorage"
          />
          */}
        </form>
      );
    }

    return (
      <Navbar>
        <NavbarGroup>
          <Link to="/" className="logo-and-text">
            <img src="/img/logo.svg" alt="" />
            <NavbarHeading>Litespread</NavbarHeading>
          </Link>
          {this.props.doc && (
            <EditableText
              defaultValue={this.props.doc.filename}
              onConfirm={this.props.doc.rename}
            />
          )}
        </NavbarGroup>
        <NavbarGroup align="right">
          {/*
          <Button minimal={true} icon="home">
            Home
          </Button>
          */}
          {menus}
          <NavbarDivider />
          <Popover content={userMenu} position={Position.BOTTOM}>
            <Button minimal={true} icon={connState === 'offline' ? 'offline' : 'user'}>
              {['connected', 'offline'].includes(connState) && this.props.remotestorageState.connectedAs}
            </Button>
          </Popover>
          {/*
          <Button minimal={true} icon="notifications" />
          <Button minimal={true} icon="cog" />
          */}
        </NavbarGroup>
        {this.state.deleteDialogOpen && (
          <DeleteDialog
            onCancel={() => this.setState({ deleteDialogOpen: false })}
            onConfirm={this.props.doc.deleteFile}
          />
        )}
      </Navbar>
    );
  }
}

const DeleteDialog = props => {
  return (
    <Alert
      {...props}
      ////className={this.props.data.themeName}
      cancelButtonText="Cancel"
      confirmButtonText="Move to Trash"
      icon="trash"
      intent={Intent.DANGER}
      //isOpen={isOpen}
      isOpen={true}
      canEscapeKeyCancel={true}
    >
      <p>
        Are you sure you want to delete this file? You won't be able to undo
        this operation.
      </p>
    </Alert>
  );
};

export default MainNavbar;
