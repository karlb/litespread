import React from 'react';
import {
  Navbar,
  NavbarGroup,
  NavbarHeading,
  NavbarDivider,
  Button,
  Menu,
  MenuItem,
  Popover,
  Position,
  EditableText
} from '@blueprintjs/core';
import { Link } from 'react-router-dom';

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
        <MenuItem
          icon="export"
          text="Export as CSV"
          onClick={props.doc.exportCSV}
        />
        <MenuItem
          icon="trash"
          text="Delete File"
          onClick={props.doc.deleteFile}
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

export default MainNavbar;
