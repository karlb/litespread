import React from 'react';
import {
  Alert,
  Navbar,
  NavbarGroup,
  NavbarHeading,
  NavbarDivider,
  Button,
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
          <Button minimal={true} icon="user" />
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
