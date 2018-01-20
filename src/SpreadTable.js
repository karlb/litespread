import React from 'react';
import update from 'immutability-helper';
import { Table, Column, EditableCell, Cell, ColumnHeaderCell, EditableName } from "@blueprintjs/table";
import { Button, Intent, EditableText } from "@blueprintjs/core";
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
        const result = db.exec(`SELECT * FROM ${this.props.table_name}_formatted`);
        const rows = result[0].values;

        this.setState({
            rows: rows,
            table: ls.getTableDesc(db, this.props.table_name),
        });
    }

    onCellChange = (value, rowIndex, colIndex) => {
        let row = this.state.rows[rowIndex];
        let sql = `
                UPDATE ${this.props.table_name}
                SET ${this.state.table.columns[colIndex].name} = '${value}'
                WHERE _rowid_ = ${row[0]}
        `;
        this.props.db.exec(sql);
        this.props.onDataChange();
    };

    onFormulaChange = (formula, colIndex) => {
        let updateDesc = {columns: {}};
        updateDesc.columns[colIndex] = {formula: {$set: formula}};
        this.props.onSchemaChange(update(this.props.table, updateDesc));
    }

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
        this.props.db.run(`
            INSERT INTO litespread_column(table_name, name)
            VALUES ('${this.props.table_name}', 'new col');
        `);
        this.props.onSchemaChange();
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
                    enableColumnInteractionBar={true}
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
        let formula = this.state.table.columns[colIndex].formula;
        return (
            <ColumnHeaderCell
                name={this.state.table.columns[colIndex].name}
                nameRenderer={this.nameRenderer}
                index={colIndex}
            >
                {formula && <EditableText
                    defaultValue={formula}
                    onConfirm={(newFormula) => this.onFormulaChange(newFormula, colIndex)}
                />}
            </ColumnHeaderCell>
        );
    }
}


export default SpreadTable;
