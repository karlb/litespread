import React from 'react';
import {
  Table,
  Column,
  EditableCell,
  Cell,
  ColumnHeaderCell,
  EditableName,
  TableLoadingOption
} from '@blueprintjs/table';
import {
  EditableText,
  Classes,
  Menu,
  MenuItem,
  Callout,
  MenuDivider,
  Button,
  ButtonGroup,
  Icon
} from '@blueprintjs/core';
import * as ls from './backend/litespread.js';
import '@blueprintjs/table/lib/css/table.css';
import colTypes from './col-types.js';


function updateFromDb(table, db) {
  let result;
  try {
    result = db.exec(`SELECT * FROM ${table.name}_formatted`);
  } catch (e) {
    return {
      loadingOptions: [TableLoadingOption.CELLS],
      loadingError: e.toString()
    };
  }
  if (result[0] === undefined) {
    return {
      loadingOptions: [TableLoadingOption.CELLS],
      loadingError: 'Table has now rows'
    }
  }
  const rows = result[0].values;

  return {
    rows: rows,
    loadingOptions: [],
    loadingError: null
  };
}


class SpreadTable extends React.PureComponent {
  constructor(props, context) {
    super(props, context);
    this.state = {
      rows: []
    };
  }

  onCellChange = (value, rowIndex, colIndex) => {
    const col = this.props.table.columns[colIndex];
    const validator = colTypes[col.format || 'generic'].validator;
    value = validator(value);
    let row = this.state.rows[rowIndex];
    let sql = `
                UPDATE ${this.props.table.name}
                SET ${this.props.table.columns[colIndex].name} = '${value}'
                WHERE _rowid_ = ${row[0]}
        `;
    this.props.db.exec(sql);
    this.props.onDataChange();
  };

  changeColumnName = (colIndex, newName) => {
    ls.changeColumnName(this.props.db, this.props.table, colIndex, newName);
    this.props.onSchemaChange();
  };

  static getDerivedStateFromProps(props, state) {
    if (props.last_db_change !== state.last_refresh) {
      let changes = updateFromDb(props.table, props.db);
      changes.last_refresh= props.last_db_change;
      return changes
    }
    return null;
  };

  addRow = () => {
    let sql = `
                INSERT INTO ${this.props.table.name}(${
      this.props.table.columns[0].name
    })
                VALUES (null);
        `;
    this.props.db.exec(sql);
    this.props.onDataChange();
  };

  addColumn = () => {
    this.props.table.addColumnWithDefaultName('col');
  };

  addFormulaColumn = () => {
    this.props.table.addColumnWithDefaultName('col', '1 + 1');
  };

  renderHeaderMenu = (table, column) => {
    const changePrecision = change => {
      this.props.db.changeRows(
        `
                    UPDATE litespread_column
                       SET precision = precision + ?
                    WHERE table_name = ?
                      AND name = ?
                `,
        [change, column.table_name, column.name],
        1
      );
      this.props.onSchemaChange();
    };
    const setSort = orderBy => {
      table.setCol('order_by', orderBy);
      this.props.onSchemaChange();
      this.props.onDataChange();
    };
    return (
      <Menu>
        <MenuItem
          icon="percentage"
          text="Change Format"
          // workaround for
          // https://github.com/palantir/blueprint/issues/3010
          popoverProps={{
            hoverCloseDelay: 400,
            captureDismiss: true
          }}
        >
          <MenuDivider title="Types" />
          {Object.entries(colTypes).map(([id, c]) => (
            <MenuItem
              icon={c.icon}
              text={c.name}
              onClick={() => {
                column.setCol('format', id);
                column.setCol('precision', c.defaultPrecision);
                this.props.onSchemaChange();
                if (id === 'money' && !column.formula) {
                  // remove currency symbols from column
                  this.props.db.create_function('remove_currency', x => {
                    if (typeof x === 'string') {
                      return x.replace(/ ?([$€£¥]|[A-Z]{3}) ?/, '');
                    }
                    return x;
                  });
                  column.updateData(`remove_currency(${column.name})`);
                  this.props.onDataChange();
                }
              }}
              key={id}
            />
          ))}
          <MenuDivider title="Settings" />
          <MenuItem
            shouldDismissPopover={false}
            text={
              <span>
                Precision:
                <ButtonGroup minimal={true} large={false}>
                  <Button
                    icon="small-minus"
                    onClick={() => changePrecision(-1)}
                  />
                  <Button
                    icon="small-plus"
                    onClick={() => changePrecision(+1)}
                  />
                </ButtonGroup>
              </span>
            }
          />
        </MenuItem>
        <MenuItem icon="widget-footer" text="Change Summary">
          <MenuItem
            icon="blank"
            text="None"
            onClick={() => {
              column.setCol('summary', null);
              this.props.onSchemaChange();
              this.props.onDataChange();
            }}
          />
          <MenuItem
            icon="add"
            text="Sum"
            onClick={() => column.setCol('summary', 'sum')}
          />
          <MenuItem
            icon="layout-linear"
            text="Average"
            onClick={() => column.setCol('summary', 'avg')}
          />
        </MenuItem>
        <MenuItem icon="sort" text="Order by">
          <MenuItem
            icon="sort-asc"
            text={column.name + ' ascending'}
            onClick={() => setSort(column.name + ' ASC')}
          />
          <MenuItem
            icon="sort-desc"
            text={column.name + ' descening'}
            onClick={() => setSort(column.name + ' DESC')}
          />
        </MenuItem>
        <MenuItem icon="trash" text="Delete Column" onClick={column.drop} />
        {/*
                {column.formula && <MenuItem icon="function" text="Change Formula" />}
                <MenuItem icon="asterisk" text="Change Column Type">
                    <MenuItem icon="asterisk" text="Generic" onClick={setGeneric}/>
                    <MenuItem icon="function" text="Formula" onClick={() => column.setCol('formula', '1')} />
                </MenuItem>
                <MenuItem icon="wrench" text="Rename Column" />
                <MenuItem icon="sort-asc" text="Sort Asc" />
                <MenuItem icon="sort-desc" text="Sort Desc" />
                */}
      </Menu>
    );
  };

  render() {
    if (this.props.db === null) {
      return null;
    }
    if (!this.props.table) {
      throw Error('No table selected!');
    }
    return (
      <div className="spreadtable-outer-container">
        <ButtonGroup>
          {this.props.table.type === 'table' && (
            <React.Fragment>
              <Button icon="add-row-bottom" onClick={this.addRow}>
                Add Row
              </Button>
              <Button icon="add-column-right" onClick={this.addColumn}>
                Add Data Column
              </Button>
            </React.Fragment>
          )}
          <Button icon="function" onClick={this.addFormulaColumn}>
            Add Formula Column
          </Button>
        </ButtonGroup>
        <div className="spreadtable-container">
          {this.state.loadingError && (
            <Callout className="pt-intent-danger">
              {this.state.loadingError}
            </Callout>
          )}
          <Table
            numRows={this.state.rows.length}
            enableColumnReordering={true}
            onColumnsReordered={(oldIndex, newIndex, length) => {
              ls.moveColumn(
                this.props.db,
                this.props.table.name,
                oldIndex,
                newIndex
              );
              this.props.onSchemaChange();
            }}
            enableColumnInteractionBar={true}
            enableRowReordering={true}
            onRowsReordered={(oldIndex, newIndex, length) => {
              if (this.props.table.order_by) {
                this.props.table.sortRowids();
                this.props.table.setCol('order_by', null); // manual sorting
                this.props.onSchemaChange();
              }
              ls.moveRow(
                this.props.db,
                this.props.table.name,
                oldIndex,
                newIndex
              );
              this.props.onDataChange();
            }}
            getCellClipboardData={(row, col) => {
              console.log(this.state.rows);
              return this.state.rows[row][col + 1];
            }}
            enableFocusedCell={true}
            enableMultipleSelection={false}
            loadingOptions={this.state.loadingOptions}
            onColumnWidthChanged={(colIndex, width) => {
              console.log(this.props.table.columns[colIndex].setCol);
              this.props.table.columns[colIndex].setCol('width', width);
            }}
            columnWidths={this.props.table.columns.map(c => c.width)}
            className="spreadtable"
          >
            {this.props.table.columns.map((col, colIndex) => (
              <Column
                key={col.name}
                name={col.name}
                cellRenderer={this.cellRenderer}
                columnHeaderCellRenderer={this.columnHeaderCellRenderer}
              />
            ))}
          </Table>
        </div>
      </div>
    );
  }

  cellRenderer = (rowIndex, colIndex) => {
    const col = this.props.table.columns[colIndex];
    const colType = colTypes[col.format] || 'generic';
    const { align, className } = colType;
    const editable = this.props.table.type === 'table' && !col.formula;
    let classNames = {
      'no-edit': !editable,
      ['text-' + align]: true,
      [className]: true
    };
    const value = this.state.rows[rowIndex][colIndex + 1];
    if (this.props.table.hasFooter && rowIndex === this.state.rows.length - 1) {
      classNames['footer'] = true;
      if (col.summary) {
        const summary = <span className="summary">({col.summary})</span>;
        if (align === 'left') {
          return (
            <Cell className={classNames}>
              {value} {summary}
            </Cell>
          );
        } else {
          return (
            // Fragment use is a workaround for https://github.com/palantir/blueprint/issues/2446
            <Cell className={classNames}>
              <React.Fragment>
                {summary} {value}
              </React.Fragment>
            </Cell>
          );
        }
      } else {
        return <Cell className={classNames} />;
      }
    } else if (editable) {
      return (
        <EditableCell
          onConfirm={value => this.onCellChange(value, rowIndex, colIndex)}
          className={classNames}
          value={value}
        />
      );
    } else {
      return <Cell className={classNames}>{value}</Cell>;
    }
  };

  nameRenderer = (name, colIndex) => {
    const col = this.props.table.columns[colIndex];

    // sort
    const orderBy = this.props.table.order_by;
    let sort;
    if (orderBy === col.name + ' ASC') {
      sort = 'asc';
    }
    if (orderBy === col.name + ' DESC') {
      sort = 'desc';
    }

    return (
      <React.Fragment>
        {sort && (
          <Icon
            icon={'sort-' + sort}
            style={{ margin: '6px 4px', float: 'right' }}
          />
        )}
        <EditableName
          name={name}
          onConfirm={value => this.changeColumnName(colIndex, value)}
        />
      </React.Fragment>
    );
  };

  columnHeaderCellRenderer = colIndex => {
    const col = this.props.table.columns[colIndex];
    const onFormulaChange = (col, formula) => {
      col.setCol('formula', formula);
      this.props.onSchemaChange();
    };

    return (
      <ColumnHeaderCell
        name={this.props.table.columns[colIndex].name}
        menuRenderer={() => this.renderHeaderMenu(this.props.table, col)}
        nameRenderer={this.nameRenderer}
      >
        {col.formula && (
          <div
            className={`formula ${Classes.TEXT_MUTED} ${Classes.TEXT_SMALL}`}
          >
            =&nbsp;
            <EditableText
              defaultValue={col.formula}
              onConfirm={newFormula => onFormulaChange(col, newFormula)}
            />
          </div>
        )}
      </ColumnHeaderCell>
    );
  };
}

export default SpreadTable;
