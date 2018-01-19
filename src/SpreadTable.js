import React from 'react';
import update from 'immutability-helper';
import { Table, Column, EditableCell, Cell, ColumnHeaderCell } from "@blueprintjs/table";
import { Button, Intent, EditableText } from "@blueprintjs/core";
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
            name: props.table.name,
        };
    }

    makeColumns(props) {
        return props.table.columns.map((col, colIndex) => ({
            cellClass: 'text-' + formatter_alignment[col.formatter || 'undefined'],
        }))
    }

    componentWillMount() {
        if (this.props.db) {
            this.updateFromDb(this.props.db);
        }
    }

    updateFromDb(db) {
        let result = db.exec(`SELECT * FROM ${this.props.table.name}_formatted`);
        let rows = result[0].values.map(row => row);
        this.setState({
            rows: rows,
        });
    }

    onCellChange = (value, rowIndex, colIndex) => {
        let row = this.state.rows[rowIndex];
        let sql = `
                UPDATE ${this.props.table.name}
                SET ${this.props.table.columns[colIndex].name} = '${value}'
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

    componentWillReceiveProps = (nextProps) => {
        if (nextProps.last_db_change !== this.state.last_refresh) {
            this.updateFromDb(nextProps.db);
            this.setState({
                last_refresh: nextProps.last_db_change,
            });
        }
    }

    render() {
        return  (
            <Table numRows={this.state.rows.length}>
                {this.props.table.columns.map((col, colIndex) => (
                    <Column
                        key={col.name}
                        name={col.name}
                        cellRenderer={this.cellRenderer}
                        columnHeaderCellRenderer={this.columnHeaderCellRenderer}
                    />
                ))}
            </Table>
        );
    }

    cellRenderer = (rowIndex, colIndex) => {
        let col = this.props.table.columns[colIndex];
        return (
            <EditableCell
                onConfirm={(value) => this.onCellChange(value, rowIndex, colIndex)}
                className={'text-' + formatter_alignment[col.formatter || 'undefined']}
                value={this.state.rows[rowIndex][colIndex + 1]}
            />
        );
    }

    columnHeaderCellRenderer = (colIndex) => {
        let formula = this.props.table.columns[colIndex].formula;
        return (
            <ColumnHeaderCell name={this.props.table.columns[colIndex].name}>
                {formula && <EditableText
                    defaultValue={formula}
                    onConfirm={(newFormula) => this.onFormulaChange(newFormula, colIndex)}
                />}
            </ColumnHeaderCell>
        );
    }
}


export default SpreadTable;
