import React from 'react';
import update from 'immutability-helper';
import { Table, Column, EditableCell, Cell, ColumnHeaderCell, EditableName } from "@blueprintjs/table";
import { Button, Intent, EditableText, Menu, MenuItem } from "@blueprintjs/core";
import * as ls from './backend/litespread.js'
import "@blueprintjs/table/lib/css/table.css";

function entries(obj) {
    let ownProps = Object.keys(obj),
    i = ownProps.length,
    resArray = new Array(i);  // preallocate the Array
    while (i--)
        resArray[i] = [ownProps[i], obj[ownProps[i]]];

    return resArray;
};


let formatter_alignment = {
    'undefined': 'left',
    'money': 'right',
};


class SpreadTable extends React.Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            rows: [],
            table: null,
        };
    }

    componentWillMount() {
        if (this.props.db) {
            this.updateFromDb(this.props.db);
        }
    }

    updateFromDb(db) {
        const result = db.exec(`SELECT * FROM ${this.props.tableName}_formatted`);
        const rows = result[0].values;

        this.setState({
            rows: rows,
            table: ls.getTableDesc(db, this.props.tableName),
        });
    }

    onCellChange = (value, rowIndex, colIndex) => {
        let row = this.state.rows[rowIndex];
        let sql = `
                UPDATE ${this.props.tableName}
                SET ${this.state.table.columns[colIndex].name} = '${value}'
                WHERE _rowid_ = ${row[0]}
        `;
        this.props.db.exec(sql);
        this.props.onDataChange();
    };

    changeColumnName = (colIndex, newName) => {
        ls.changeColumnName(this.props.db, this.state.table, colIndex, newName);
        this.props.onSchemaChange();
    }

    componentWillReceiveProps = (nextProps) => {
        if (nextProps.last_db_change !== this.state.last_refresh) {
            this.updateFromDb(nextProps.db);
            this.setState({
                last_refresh: nextProps.last_db_change,
            });
        }
    }

    addColumn = () => {
        ls.addColumn(this.props.db, this.props.tableName, 'new_col')
        this.props.onSchemaChange();
    }


    setColAttr = (column, attr, value) => {
        this.props.db.changeRows(`
                UPDATE litespread_column SET ${attr} = ?
                WHERE table_name = ?
                  AND name = ?
            `, [value, this.props.tableName, column.name], 1)
        this.props.onSchemaChange();
    }


    renderHeaderMenu = (tableName, column) => {
        const setCol = (attr, val) => this.setColAttr(column, attr, val);
        return (
            <Menu>
                <MenuItem iconName="asterisk" text="Change Format">
                    <MenuItem iconName="blank" text="Generic" onClick={() => setCol('format', null)} />
                    <MenuItem iconName="dollar" text="Money" onClick={() => setCol('format', 'money')} />
                </MenuItem>
                <MenuItem iconName="widget-footer" text="Change Summary">
                    <MenuItem iconName="blank" text="None" onClick={() => setCol('summary', null)} />
                    <MenuItem iconName="add" text="Sum" onClick={() => setCol('summary', 'sum')} />
                    <MenuItem iconName="layout-linear" text="Average" onClick={() => setCol('summary', 'avg')} />
                </MenuItem>
                <MenuItem iconName="asterisk" text="Change Column Type">
                    <MenuItem iconName="asterisk" text="Generic" />
                    <MenuItem iconName="function" text="Formula" onClick={() => setCol('formula', '1')} />
                </MenuItem>
                <MenuItem iconName="function" text="Change Formula" />
                <MenuItem iconName="wrench" text="Rename Column" />
                <MenuItem iconName="sort-asc" text="Sort Asc" />
                <MenuItem iconName="sort-desc" text="Sort Desc" />
            </Menu>
        );
    }

    render() {
        if (this.props.db === null) {
            return null;
        }
        return (
            <div className="text-left">
                <div className="pt-button-group">
                  <a className="pt-button pt-icon-add-column-right" tabIndex="0" role="button"
                    onClick={this.addColumn}
                  >Add Column</a>
                  <a className="pt-button pt-icon-add-row-bottom" tabIndex="0" role="button">Add Row</a>
                </div>
                <Table
                    numRows={this.state.rows.length}
                    //enableColumnInteractionBar={true}
                >
                    {this.state.table.columns.map((col, colIndex) => (
                        <Column
                            key={col.name}
                            name={col.name}
                            cellRenderer={this.cellRenderer}
                            columnHeaderCellRenderer={this.columnHeaderCellRenderer}
                        />
                    ))}
                </Table>
            </div>
        );
    }

    cellRenderer = (rowIndex, colIndex) => {
        let col = this.state.table.columns[colIndex];
        return (
            <EditableCell
                onConfirm={(value) => this.onCellChange(value, rowIndex, colIndex)}
                className={'text-' + formatter_alignment[col.formatter || 'undefined']}
                value={this.state.rows[rowIndex][colIndex + 1]}
            />
        );
    }

    nameRenderer = (name, colIndex) => {
        return <EditableName name={name} onConfirm={(value) => this.changeColumnName(colIndex, value)}/>
    }

    columnHeaderCellRenderer = (colIndex) => {
        const col = this.state.table.columns[colIndex];
        const onFormulaChange = (col, formula) => {
            this.setColAttr(col, 'formula', formula);
            this.props.onSchemaChange();
        }
        return (
            <ColumnHeaderCell
                name={this.state.table.columns[colIndex].name}
                menuRenderer={() => this.renderHeaderMenu(this.state.table.name, col)}
                nameRenderer={this.nameRenderer}
            >
                {col.formula && <EditableText
                    defaultValue={col.formula}
                    onConfirm={(newFormula) => onFormulaChange(col, newFormula)}
                />}
            </ColumnHeaderCell>
        );
    }
}


export default SpreadTable;
