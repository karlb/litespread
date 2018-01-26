import React from 'react';
import {
    Table, Column, EditableCell, Cell, ColumnHeaderCell, EditableName,
    TableLoadingOption
} from "@blueprintjs/table";
import { EditableText, Menu, MenuItem, Callout } from "@blueprintjs/core";
import * as ls from './backend/litespread.js'
import "@blueprintjs/table/lib/css/table.css";


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
        let result;
        try {
            result = db.exec(`SELECT * FROM ${this.props.tableName}_formatted`);
        }
        catch (e) {
            this.setState({
                loadingOptions: [TableLoadingOption.CELLS],
                loadingError: e.toString(),
            });
            return;
        }
        const rows = result[0].values;

        this.setState({
            rows: rows,
            table: ls.getTableDesc(db, this.props.tableName),
            loadingOptions: [],
            loadingError: null,
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

    addRow = () => {
        let sql = `
                INSERT INTO ${this.props.tableName}(${this.state.table.columns[0].name})
                VALUES (null);
        `;
        this.props.db.exec(sql);
        this.props.onDataChange();
    }

    addColumn = () => {
        ls.addColumn(this.props.db, this.props.tableName, 'new_col')
        this.props.onSchemaChange();
    }

    addFormulaColumn = () => {
        console.log(this.props.tableName);
        this.props.db.changeRows(`
                INSERT INTO litespread_column (table_name, name, formula, position)
                VALUES (
                    :table_name, 'new_col', '1',
                    (SELECT max(position) + 1 FROM litespread_column WHERE table_name = :table_name)
                )
            `, {':table_name': this.props.tableName}, 1)
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
        const deleteCol = () => {
            this.props.db.changeRows(`
                    DELETE FROM litespread_column
                    WHERE table_name = ?
                      AND name = ?
                `, [column.table_name, column.name], 1);
            if (!column.formula) {
                this.props.db.run(`ALTER TABLE ${column.table_name} DROP COLUMN ${column.name}`);
            }
        }
        return (
            <Menu>
                <MenuItem iconName="percentage" text="Change Format">
                    <MenuItem iconName="blank" text="Generic" onClick={() => setCol('format', null)} />
                    <MenuItem iconName="dollar" text="Money" onClick={() => setCol('format', 'money')} />
                </MenuItem>
                <MenuItem iconName="widget-footer" text="Change Summary">
                    <MenuItem iconName="blank" text="None" onClick={() => setCol('summary', null)} />
                    <MenuItem iconName="add" text="Sum" onClick={() => setCol('summary', 'sum')} />
                    <MenuItem iconName="layout-linear" text="Average" onClick={() => setCol('summary', 'avg')} />
                </MenuItem>
                <MenuItem iconName="trash" text="Delete Column" onClick={deleteCol}/>
                {/*
                {column.formula && <MenuItem iconName="function" text="Change Formula" />}
                <MenuItem iconName="asterisk" text="Change Column Type">
                    <MenuItem iconName="asterisk" text="Generic" onClick={setGeneric}/>
                    <MenuItem iconName="function" text="Formula" onClick={() => setCol('formula', '1')} />
                </MenuItem>
                <MenuItem iconName="wrench" text="Rename Column" />
                <MenuItem iconName="sort-asc" text="Sort Asc" />
                <MenuItem iconName="sort-desc" text="Sort Desc" />
                */}
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
                  >Add Data Column</a>
                  <a className="pt-button pt-icon-function" tabIndex="0" role="button"
                    onClick={this.addFormulaColumn}
                  >Add Formula Column</a>
                  <a className="pt-button pt-icon-add-row-bottom" tabIndex="0" role="button"
                    onClick={this.addRow}>Add Row</a>
                </div>
                <Table
                    numRows={this.state.rows.length}
                    /*enableColumnReordering={true}
                    onColumnsReordered={(oldIndex, newIndex, length) => console.log(oldIndex, newIndex, length)}
                    enableColumnInteractionBar={true}*/
                    enableFocusedCell={true}
                    enableMultipleSelection={false}
                    loadingOptions={this.state.loadingOptions}
                    style={{position: 'absolute'}}
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
                {this.state.loadingError && <Callout className="pt-intent-danger">{this.state.loadingError}</Callout>}
            </div>
        );
    }

    cellRenderer = (rowIndex, colIndex) => {
        let col = this.state.table.columns[colIndex];
        let classNames = {
            'no-edit': col.formula,
        };
        const align = formatter_alignment[col.format || 'undefined'];
        classNames[('text-' + align)] = true;
        const value = this.state.rows[rowIndex][colIndex + 1];
        if (this.state.table.hasFooter && rowIndex === this.state.rows.length - 1) {
            classNames['footer'] = true;
            if (col.summary) {
                const summary = <span className="summary">({col.summary})</span>;
                if (align === 'left') {
                    return <Cell className={classNames}>{value} {summary}</Cell>
                } else {
                    return <Cell className={classNames}>{summary} {value}</Cell>
                }
            } else {
                return <Cell className={classNames} />
            }
        } else if (col.formula) {
            return (
                <Cell className={classNames}>{value}</Cell>
            );
        } else {
            return (
                <EditableCell
                    onConfirm={(value) => this.onCellChange(value, rowIndex, colIndex)}
                    className={classNames}
                    value={value}
                />
            );
        }
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
                {col.formula && (
                    <div className="formula">=&nbsp;
                        <EditableText
                            defaultValue={col.formula}
                            onConfirm={(newFormula) => onFormulaChange(col, newFormula)}
                        />
                    </div>
                )}
            </ColumnHeaderCell>
        );
    }
}


export default SpreadTable;
